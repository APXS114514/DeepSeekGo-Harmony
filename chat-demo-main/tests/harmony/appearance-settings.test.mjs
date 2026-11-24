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
          if (operation === 'location') {
            post({
              id,
              status: 0,
              value: JSON.stringify({
                countryCode: 'CN',
                countryName: '中国',
                province: '浙江省',
                city: '丽水市',
                district: '莲都区',
              }),
            })
          }
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({
          type: 'device-features',
          voice: true,
          scan: true,
          save: true,
          location: true,
          deviceType: 'phone',
        })
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
    const chatPage = settings.getByRole('button', { name: '对话', exact: true })
    await chatPage.click()
    const notify = settings.locator('label').filter({ hasText: '回答完成通知' })
    const style = await notify.evaluate((el) => ({
      pad: getComputedStyle(el).paddingTop,
      shadow: getComputedStyle(el).boxShadow,
    }))
    assert.equal(style.pad, '12px')
    assert.notEqual(style.shadow, 'none', 'divider between switch rows')
    await settings.getByRole('button', { name: '返回通用设置' }).click()
    assert(await chatPage.evaluate((element) => element === document.activeElement))
    // 鸿蒙版不再展示手动地区下拉，位置信息改为定位开关
    assert.equal(await settings.getByRole('button', { name: '请选择国家或地区' }).count(), 0)
    assert.equal(await settings.getByRole('button', { name: '请选择省份/地区' }).count(), 0)
    assert.equal(await settings.getByRole('button', { name: '请选择市' }).count(), 0)
    await settings
      .getByText(
        '开启后，仅在前台处理「我这里」「附近」等本地问题时使用鸿蒙模糊定位，只发送城市和行政区。'
      )
      .waitFor()
    const locationSwitch = settings.getByRole('switch', { name: '位置信息' })
    assert.equal(await locationSwitch.isChecked(), false)
    await locationSwitch.click()
    await page.getByText('已开启定位（浙江省丽水市莲都区）').waitFor()
    assert.equal(await locationSwitch.isChecked(), true)
    assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:auto-location')), 'true')
    if (shots) await page.screenshot({ path: join(shots, 'settings-general.png') })
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    await page.mouse.click(360, 400)
    await page.waitForFunction(() => document.querySelector('main').inert === false)
    await page.locator('textarea').fill('明天天气怎么样')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('收到。').waitFor()
    assert(
      JSON.stringify(chats.at(-1).messages).includes('浙江省丽水市莲都区'),
      'location sent with message'
    )
    // 关闭定位开关后不再发送位置
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await settings.getByRole('switch', { name: '位置信息' }).click()
    assert.equal(
      await page.evaluate(() => localStorage.getItem('chat-demo:auto-location')),
      'false'
    )
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

  // 英文界面：定位开关展示英文标签，不显示旧版手动地区下拉，也不会发送旧版手动地区
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
    assert.equal(await page.getByRole('button', { name: 'Select country or region' }).count(), 0)
    const locSwitch = page.getByRole('switch', { name: 'Location' })
    assert.equal(await locSwitch.isChecked(), false)
    await context.close()
  }
  console.log('1.3.1 regression: OK')
} finally {
  await browser.close()
}
