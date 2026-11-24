import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
const shots = process.argv[2] ?? tmpdir()
const origin = 'https://deepseek.local.invalid'
const assets = join(root, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(root, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
const csp = native
  .match(/const PAGE_POLICY = ([\s\S]*?);\n/)[1]
  .match(/"([^"]*)"/g)
  .map((part) => JSON.parse(part))
  .join('')
const media = {
  '.png': 'image/png',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}
const nativePath = new RegExp(native.match(/const PACKAGED_PATH = \/(.+)\/;/)[1])
for (const path of await readdir(join(assets, 'static'), {
  recursive: true,
  withFileTypes: true,
})) {
  if (!path.isFile() || path.name.endsWith('.LICENSE.txt')) continue
  assert(nativePath.test(join(path.parentPath, path.name).slice(assets.length)), path.name)
}
const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const firstKey = 'test-local-key'
  const nextKey = 'test-updated-key'
  let verificationAttempts = 0
  let sent = 0
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await context.addInitScript(() =>
    localStorage.setItem(
      'chat-demo:memory',
      JSON.stringify({ enabled: true, auto: false, items: [] })
    )
  )
  await context.addInitScript(() => {
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        window.mockWindowAction = (action) => post({ type: 'window-action', action })
        window.mockInsets = { top: 31, right: 0, bottom: 18, left: 12 }
        window.mockWindowLayout = () =>
          post({
            type: 'window-layout',
            insets: window.mockInsets,
            nativeHeader: window.lastWindowUi.mobile && !window.lastWindowUi.covered,
          })
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            window.lastWindowUi = JSON.parse(value)
            window.mockWindowLayout()
            return
          }
          let status = 0
          let stored = ''
          if (operation === 'read') stored = sessionStorage.getItem('mockDeviceKey') || ''
          if (operation === 'save') {
            if (value === 'test-device-save-failure') status = 24000005
            else sessionStorage.setItem('mockDeviceKey', value)
          }
          if (operation === 'open') {
            window.lastOpenedLink = value
            return
          }
          port1.postMessage(JSON.stringify({ id, status, value: stored }))
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
      },
      { once: true }
    )
  })
  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/index.html' && !nativePath.test(path)) return route.fulfill({ status: 404 })
    return route.fulfill({
      body: await readFile(assets + path),
      contentType: media[extname(path)],
      headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
    })
  })
  await context.route('https://api.deepseek.com/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-api-key',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    // 1.4.0 起「数据管理」会查询余额
    if (path === '/user/balance')
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
    if (path === '/models') {
      verificationAttempts++
      const key = request.headers().authorization
      if (key === 'Bearer invalid-test-key') {
        return route.fulfill({ status: 401, headers, json: { error: { message: 'invalid' } } })
      }
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    }
    assert.equal(path, '/anthropic/v1/messages')
    const payload = request.postDataJSON()
    assert.equal(payload.model, 'deepseek-flash')
    assert.equal(payload.stream, true)
    assert.equal(request.headers()['x-api-key'], sent === 0 ? firstKey : nextKey)
    sent++
    assert(payload.messages.length >= sent)
    const frames = [
      { type: 'message_start', message: { id: 'mock', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '收到。请看 [文档](https://example.com/manual)。' },
      },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', title: '测试会话' } },
      { type: 'message_stop' },
    ]
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: frames
        .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
        .join(''),
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy'))
      runtimeErrors.push(message.text())
  })
  await page.goto(origin + '/index.html')
  const settings = page.getByRole('dialog', { name: '设置' })
  const key = settings.locator('input[type=password]')
  const submit = settings.getByRole('button', { name: '确定', exact: true })
  await key.waitFor()
  await page.waitForFunction(() => window.lastWindowUi?.mobile && window.lastWindowUi.covered)
  assert.equal(await page.title(), 'Deepseek GO')
  assert.match(
    await page.locator('meta[name="viewport"]').getAttribute('content'),
    /viewport-fit=cover/
  )
  const frame = page.locator('[class^="frame-"]')
  const padding = () =>
    frame.evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
  assert.deepEqual(await padding(), ['31px', '0px', '18px', '12px'])
  for (const [input, error] of [
    ['invalid-test-key', 'API Key 无效，请检查后重试'],
    ['test-device-save-failure', 'API Key 校验成功，但设备保存失败（24000005）。'],
  ]) {
    await key.fill(input)
    await submit.click()
    await settings.getByText(error, { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mockDeviceKey') || ''), '')
  }
  await settings.getByRole('button', { name: '仅本次使用', exact: true }).click()
  await settings.getByText('当前 API Key 仅本次使用，重新打开应用后需再输入。').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:api-key')), null)
  await page.reload()
  await key.waitFor()
  await key.fill(' ' + firstKey + ' ')
  await submit.click()
  await key.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mockDeviceKey') || ''), firstKey)
  assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:api-key')), null)
  await settings.getByRole('tab', { name: '通用设置' }).click()
  await settings.getByRole('button', { name: '外观', exact: true }).click()
  const light = settings.getByRole('switch', { name: '沉浸光感' })
  const composer = page.locator('[class^="wrapper-"]').filter({ has: page.locator('textarea') })
  const composerBlur = () => composer.evaluate((el) => getComputedStyle(el).backdropFilter)
  assert(await light.isChecked())
  assert.match(await composerBlur(), /blur/)
  await light.uncheck()
  await page.waitForFunction(() => !document.body.hasAttribute('data-immersive-light'))
  assert.equal(await composerBlur(), 'none')
  await settings.getByRole('radio', { name: '深色', exact: true }).click()
  await page.waitForFunction(() => window.lastWindowUi.dark && window.lastWindowUi.covered)
  await settings.getByRole('button', { name: '莓紫', exact: true }).click()
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--user-accent').trim()
    ),
    '#7449ad'
  )
  const hex = settings.getByRole('textbox', { name: '十六进制主题颜色' })
  await hex.fill('#oops')
  assert(await settings.getByRole('button', { name: '应用', exact: true }).isDisabled())
  await hex.fill('#2480d0')
  await settings.getByRole('button', { name: '应用', exact: true }).click()
  assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:accent-color')), '#2480d0')
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForFunction(() => !window.lastWindowUi.covered)
  const brandLogo = page.locator('[class^="logo-"]')
  await brandLogo.waitFor()
  await page.waitForFunction(() => {
    const image = document.querySelector('[class^="logo-"]')
    return image?.complete && image.naturalWidth === 1536 && image.naturalHeight === 1024
  })
  const logoUrl = await brandLogo.evaluate((img) => img.currentSrc)
  assert.equal(new URL(logoUrl).origin, origin)
  assert.match(new URL(logoUrl).pathname, /^\/static\/media\/logo\.[a-f0-9]{8}\.png$/)
  assert(
    (await readFile(join(assets, new URL(logoUrl).pathname.slice(1)))).equals(
      await readFile(join(root, 'assets/images/logo.png'))
    )
  )
  assert(
    (await readFile('harmony/AppScope/resources/base/media/app_icon.png')).equals(
      await readFile('assets/images/app-icon.png')
    )
  )
  await page.screenshot({ path: join(shots, 'deepseek-go-welcome-with-logo.png') })
  await page.locator('textarea').focus()
  await page.evaluate(() => {
    const viewport = window.visualViewport
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 520 },
      offsetTop: { configurable: true, value: 12 },
    })
    viewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForFunction(
    () => document.querySelector('[class^="frame-"]').getBoundingClientRect().height === 520
  )
  assert.deepEqual(await padding(), ['31px', '0px', '0px', '12px'])
  await page.evaluate(() => {
    const viewport = window.visualViewport
    delete viewport.height
    delete viewport.offsetTop
    viewport.dispatchEvent(new Event('resize'))
  })
  await page.setViewportSize({ width: 740, height: 410 })
  await page.evaluate(() => {
    window.mockInsets = { top: 0, right: 12, bottom: 10, left: 38 }
    window.mockWindowLayout()
  })
  await page.waitForFunction(
    () =>
      document.body.style.getPropertyValue('--native-inset-left') === '38px' &&
      document.querySelector('[class^="frame-"]').getBoundingClientRect().height === 410
  )
  assert.deepEqual(await padding(), ['0px', '12px', '10px', '38px'])
  await page.waitForFunction(
    () => document.body.dataset.chatLayout === 'medium' && !window.lastWindowUi.mobile
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('textarea').fill('你好，准备测试')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const reply = page.getByRole('link', { name: '文档', exact: true })
  await reply.waitFor()
  await reply.click()
  await page.waitForFunction(() => window.lastOpenedLink === 'https://example.com/manual')
  await page.reload()
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  assert.equal(await settings.count(), 0)
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--user-accent').trim()
    ),
    '#2480d0'
  )
  await page.waitForFunction(() => window.lastWindowUi?.mobile && !window.lastWindowUi.covered)
  assert.equal(await composerBlur(), 'none')
  assert.equal(
    await page.evaluate(() => localStorage.getItem('chat-demo:immersive-light')),
    'false'
  )
  const main = page.locator('main')
  const drawer = page.locator('[class^="drawer-"]')
  const drawerWidth = await drawer.evaluate((node) => node.getBoundingClientRect().width)
  await page.evaluate(() => {
    const main = document.querySelector('main')
    window.motionEvents = []
    window.motionSamples = []
    for (const type of ['transitionrun', 'transitionend']) {
      main.addEventListener(type, (event) => {
        if (event.target === main && event.propertyName === 'transform') {
          window.motionEvents.push({
            type,
            x: main.getBoundingClientRect().x,
            covered: window.lastWindowUi.covered,
          })
          if (type === 'transitionrun') {
            setTimeout(() => window.motionSamples.push(main.getBoundingClientRect().x), 70)
          }
        }
      })
    }
    window.mockWindowAction('sidebar')
  })
  await page.waitForFunction(() => window.motionEvents.length === 2)
  const opening = await page.evaluate(() => window.motionEvents)
  const midOpen = await page.evaluate(() => window.motionSamples[0])
  assert(midOpen > 12 && midOpen < 12 + drawerWidth, JSON.stringify({ opening, midOpen }))
  assert(Math.abs(opening[1].x - (12 + drawerWidth)) < 1, JSON.stringify(opening))
  const drawerBounds = await drawer.boundingBox()
  assert.equal(drawerBounds.y, 0)
  assert.equal(drawerBounds.height, 844)
  await page.screenshot({ path: join(shots, 'deepseek-go-drawer.png') })
  assert.equal(await main.evaluate((node) => node.inert), true)
  assert.equal(await page.getByRole('navigation', { name: '对话历史' }).count(), 1)
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.waitForFunction(() => window.motionEvents.length === 4 && !window.lastWindowUi.covered)
  const closing = await page.evaluate(() => window.motionEvents.slice(2))
  const midClose = await page.evaluate(() => window.motionSamples[1])
  assert(midClose > 12 && midClose < 12 + drawerWidth, JSON.stringify({ closing, midClose }))
  assert.equal(closing[1].x, 12, JSON.stringify(closing))
  assert.equal(closing[1].covered, true, JSON.stringify(closing))
  assert.equal(await main.evaluate((node) => node.inert), false)
  assert.equal(await drawer.evaluate((node) => getComputedStyle(node).visibility), 'hidden')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.mockWindowAction('sidebar'))
  await page.getByText('测试会话', { exact: true }).click()
  await page.waitForFunction(() => !window.lastWindowUi.covered)
  assert.equal(await page.evaluate(() => window.motionEvents.length), 4)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByText('你好，准备测试', { exact: true }).waitFor()
  await reply.waitFor()
  await page.waitForFunction(() => window.lastWindowUi?.mobile)
  await page.evaluate(() => window.mockWindowAction('sidebar'))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await settings.getByRole('button', { name: '外观', exact: true }).click()
  assert(!(await light.isChecked()))
  await light.check()
  await page.waitForFunction(() => document.body.hasAttribute('data-immersive-light'))
  assert.equal(await composerBlur(), 'none')
  await settings.getByRole('tab', { name: '数据管理' }).click()
  await settings.getByRole('button', { name: '修改 API Key', exact: true }).click()
  await key.fill(nextKey)
  await submit.click()
  await key.waitFor({ state: 'hidden' })
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.waitForFunction(() => !window.lastWindowUi.covered)
  assert.match(await composerBlur(), /blur/)
  await page.locator('textarea').fill('继续聊天')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await reply.nth(1).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:api-key')), null)
  await page.waitForFunction(() => window.lastWindowUi.showNewChat)
  await page.evaluate(() => window.mockWindowAction('new-chat'))
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  await page.setViewportSize({ width: 900, height: 680 })
  await page.waitForFunction(
    () =>
      !window.lastWindowUi.mobile &&
      document.body.dataset.chatLayout === 'medium' &&
      !document.body.hasAttribute('data-native-chat-header')
  )
  await page.setViewportSize({ width: 1100, height: 720 })
  await page.waitForFunction(() => document.body.dataset.chatLayout === 'wide')
  const dock = page.locator('nav[class^="docked-"]')
  const dockWidth = () => dock.evaluate((el) => el.getBoundingClientRect().width)
  const mainLeft = () => page.locator('main').evaluate((el) => el.getBoundingClientRect().left)
  const collapseButton = page.getByRole('button', { name: '收起边栏', exact: true })
  const expandButton = page.getByRole('button', { name: '打开边栏', exact: true })
  const inspectMotion = async (layout, expectedWidth) => {
    const expectedInset = Number.parseFloat((await padding())[3])
    await page.waitForFunction((name) => document.body.dataset.chatLayout === name, layout)
    await page.waitForFunction(
      (width) =>
        document.querySelector('nav[class^="docked-"]').getBoundingClientRect().width === width,
      expectedWidth
    )
    assert.equal(await mainLeft(), expectedWidth + expectedInset)
    assert.equal(await expandButton.count(), 0)
    await page.locator('textarea').fill('留在输入框的草稿')
    await dock.evaluate((el) => {
      window.dockSamples = []
      window.dockListener = (event) => {
        if (event.target === el && event.propertyName === 'width') {
          setTimeout(() => {
            window.dockSamples.push({
              width: el.getBoundingClientRect().width,
              left: document.querySelector('main').getBoundingClientRect().left,
              transform: getComputedStyle(el.firstElementChild).transform,
            })
          }, 65)
        }
      }
      el.addEventListener('transitionrun', window.dockListener)
    })
    await collapseButton.click()
    await page.waitForFunction(() => window.dockSamples.length === 1)
    await page.waitForFunction(
      () => document.querySelector('nav[class^="docked-"]').getBoundingClientRect().width === 0
    )
    assert.equal(await mainLeft(), expectedInset)
    assert(await dock.evaluate((el) => el.inert))
    assert.equal(await collapseButton.count(), 0)
    await expandButton.click()
    await page.waitForFunction(() => window.dockSamples.length === 2)
    await page.waitForFunction(
      (width) =>
        document.querySelector('nav[class^="docked-"]').getBoundingClientRect().width === width,
      expectedWidth
    )
    const samples = await page.evaluate(() => window.dockSamples)
    for (const sample of samples) {
      assert(sample.width > 0 && sample.width < expectedWidth, JSON.stringify(samples))
      assert(Math.abs(sample.left - sample.width - expectedInset) < 1, JSON.stringify(samples))
      assert.match(sample.transform, /^matrix\(1, 0, 0, 1, -/)
    }
    await dock.evaluate((el) => el.removeEventListener('transitionrun', window.dockListener))
    assert.equal(await page.locator('textarea').inputValue(), '留在输入框的草稿')
  }
  await inspectMotion('wide', 261)
  await page.setViewportSize({ width: 850, height: 680 })
  await inspectMotion('medium', 221)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await collapseButton.click()
  assert.equal(await dockWidth(), 0)
  await expandButton.click()
  assert.equal(await dockWidth(), 221)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await settings.getByRole('button', { name: '外观', exact: true }).click()
  await settings.getByRole('button', { name: '默认天蓝', exact: true }).click()
  assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:accent-color')), null)
  assert.equal(sent, 2)
  assert.equal(verificationAttempts, 4)
  assert.deepEqual(runtimeErrors, [])
  process.stdout.write(
    'PASS logo MIME and decode, latest launcher asset, wide/medium dock collapse and reopen, draft, mobile drawer, reduced motion, full-height background, persisted immersive light, four safe insets, keyboard viewport, native header actions and overlays, responsive layout, custom accent and reload, existing Key/chat flows\n'
  )
} finally {
  await browser.close()
}
