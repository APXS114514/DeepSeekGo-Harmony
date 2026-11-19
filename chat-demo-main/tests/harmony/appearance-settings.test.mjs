// 1.3.1 回归：默认主题色 #66ccff、深浅色背景跟随主题色、设置开关分隔、位置信息支持海外。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
const shots = process.argv[2]
const origin = 'https://deepseek.local.invalid'
const assets = join(root, 'harmony/entry/src/main/resources/rawfile/chat')
const media = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
}
const chats = []
const sse = (text) =>
  [
    { type: 'message_start', message: { id: 'mock', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', title: '测试会话' } },
    { type: 'message_stop' },
  ]
    .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
    .join('')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
const open = async ({ scheme = 'light', storage = {}, locale = 'zh-CN' } = {}) => {
  const context = await browser.newContext({
    locale,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    deviceScaleFactor: 2,
  })
  await context.addInitScript((storage) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(
        'chat-demo:memory',
        JSON.stringify({ enabled: true, auto: false, items: [] })
      )
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
      sessionStorage.setItem('seeded', '1')
    }
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (m) => port1.postMessage(JSON.stringify(m))
        window.devicePost = post
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            window.lastWindowUi = JSON.parse(value)
            post({
              type: 'window-layout',
              insets: { top: 0, right: 0, bottom: 0, left: 0 },
              nativeHeader: false,
            })
          }
          if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({ type: 'device-features', voice: true, scan: true, save: true, deviceType: 'phone' })
      },
      { once: true }
    )
  }, storage)
  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    try {
      return route.fulfill({
        body: await readFile(assets + path),
        contentType: media[extname(path)],
      })
    } catch {
      return route.fulfill({ status: 404 })
    }
  })
  await context.route('https://api.deepseek.com/**', async (route) => {
    const request = route.request()
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    // 1.4.0 起「数据管理」会查询余额
    if (new URL(request.url()).pathname === '/user/balance')
      return route.fulfill({
        headers,
        json: {
          is_available: true,
          balance_infos: [
            {
              currency: 'CNY',
              total_balance: '10.00',
              granted_balance: '0.00',
              topped_up_balance: '10.00',
            },
          ],
        },
      })
    if (new URL(request.url()).pathname === '/models')
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    chats.push(request.postDataJSON())
    return route.fulfill({ headers, contentType: 'text/event-stream', body: sse('收到。') })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  await page.goto(origin + '/index.html')
  await page
    .getByText(/今天想聊什么|What’s on your mind/)
    .first()
    .waitFor()
  return { context, page }
}
const rgb = (page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  })

try {
  // 默认主题色与浅色背景
  {
    const { context, page } = await open()
    assert.equal(
      await page.evaluate(() => document.body.style.getPropertyValue('--user-accent')),
      '#66ccff'
    )
    const [r, g, b] = await rgb(page)
    assert(b >= g && g >= r, `light bg should lean blue, got ${r},${g},${b}`)
    if (shots) await page.screenshot({ path: join(shots, 'light-default.png') })

    // 设置页：开关行有间距和分隔线；位置信息先选国家或地区
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    const notify = settings.locator('label').filter({ hasText: '回答完成通知' })
    const style = await notify.evaluate((el) => ({
      pad: getComputedStyle(el).paddingTop,
      shadow: getComputedStyle(el).boxShadow,
    }))
    assert.equal(style.pad, '12px')
    assert.notEqual(style.shadow, 'none', 'divider between switch rows')
    await settings
      .getByText(
        '随消息告诉 DeepSeek 你所在的国家或地区，用于天气、出行和本地推荐等问题。只发送地名，不使用定位。'
      )
      .waitFor()
    const region = settings.getByRole('button', { name: '请选择国家或地区' })
    assert.equal((await region.textContent()).trim(), '不设置')
    assert.equal(await settings.getByRole('button', { name: '请选择省份/地区' }).count(), 0)
    await region.click()
    await page.getByRole('option', { name: '日本' }).click()
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('chat-demo:location'))),
      { region: 'JP' }
    )
    assert.equal(await settings.getByRole('button', { name: '请选择省份/地区' }).count(), 0)
    await region.click()
    await page.getByRole('option', { name: '中国', exact: true }).click()
    await settings.getByRole('button', { name: '请选择省份/地区' }).click()
    await page.getByRole('option', { name: '浙江省' }).click()
    await settings.getByRole('button', { name: '请选择市' }).click()
    await page.getByRole('option', { name: '丽水市' }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chat-demo:location')))
    assert.equal(saved.region, 'CN')
    assert(saved.province && saved.city)
    await page.waitForTimeout(600)
    const cityColor = await settings
      .getByRole('button', { name: '请选择市' })
      .evaluate((el) => ({
        text: el.textContent.trim(),
        color: getComputedStyle(el.querySelector('span') ?? el).color,
        disabled: el.disabled,
      }))
    console.log('city select', JSON.stringify(cityColor))
    if (shots) await page.screenshot({ path: join(shots, 'settings-general.png') })
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    await page.mouse.click(360, 400)
    await page.waitForFunction(() => document.querySelector('main').inert === false)
    await page.locator('textarea').fill('明天天气怎么样')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('收到。').waitFor()
    assert(JSON.stringify(chats.at(-1).messages).includes('丽水市'), 'location sent with message')
    // 改回不设置
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await settings.getByRole('button', { name: '请选择国家或地区' }).click()
    await page.getByRole('option', { name: '不设置' }).click()
    assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:location')), null)
    await context.close()
  }

  // 深色：默认主题色时背景不再偏绿；换成莓紫后跟着变
  {
    const { context, page } = await open({ scheme: 'dark' })
    const [r, g, b] = await rgb(page)
    assert(b >= g && g >= r, `dark bg should lean blue, got ${r},${g},${b}`)
    if (shots) await page.screenshot({ path: join(shots, 'dark-default.png') })
    await context.close()
  }
  {
    const { context, page } = await open({
      scheme: 'dark',
      storage: { 'chat-demo:accent-color': '#7449ad' },
    })
    const [r, g, b] = await rgb(page)
    assert(r > g && b > g, `dark bg should lean purple, got ${r},${g},${b}`)
    if (shots) await page.screenshot({ path: join(shots, 'dark-purple.png') })
    await context.close()
  }

  // 英文界面的海外用户：直接选择国家
  {
    const { context, page } = await open({
      locale: 'en-US',
      storage: {
        'chat-demo:locale': 'en-US',
        'chat-demo:location': JSON.stringify({ region: 'US' }),
      },
    })
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const region = page.getByRole('button', { name: 'Select country or region' })
    assert.equal((await region.textContent()).trim(), 'United States')
    await context.close()
  }
  console.log('1.3.1 regression: OK')
} finally {
  await browser.close()
}
