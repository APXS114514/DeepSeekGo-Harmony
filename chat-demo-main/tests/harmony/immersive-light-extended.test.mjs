import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const indexSource = await readFile(
  join(repoRoot, 'harmony/entry/src/main/ets/pages/Index.ets'),
  'utf8'
)
const materialSource = await readFile(
  join(repoRoot, 'harmony/entry/src/main/ets/window/ImmersiveMaterial.ets'),
  'utf8'
)
const headerSource = await readFile(
  join(repoRoot, 'harmony/entry/src/main/ets/window/ChatHeader.ets'),
  'utf8'
)

// 1. 静态核对原生顶栏交互形变、流光、图标动效和半模态/弹窗配置
assert(
  materialSource.includes('interactive: true'),
  'Header material must enable interactive deformation'
)
assert(materialSource.includes('lightEffect: {}'), 'Header material must enable lightEffect')
assert(headerSource.includes('BounceSymbolEffect'), 'ChatHeader must apply BounceSymbolEffect')
assert(indexSource.includes('.bindSheet('), 'Index must bind native tools sheet via bindSheet')
assert(indexSource.includes('NativeMenuDialog'), 'Index must present NativeMenuDialog')
assert(indexSource.includes('NativeConfirmDialog'), 'Index must present NativeConfirmDialog')
assert(
  indexSource.includes('onWillDisappear: () => this.finishToolsSheet()'),
  'Tools sheet must resolve in onWillDisappear'
)
assert(
  indexSource.match(/onWillDisappear:/g)?.length >= 4,
  'All native dialogs and sheets must resolve in onWillDisappear'
)

const csp = indexSource
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

const sseReply = (text, title) =>
  [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', title }, usage: { output_tokens: 8 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ].join('')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1024, height: 760 },
  })
  await context.addInitScript(() => {
    sessionStorage.setItem('mockDeviceKey', 'test-immersive-key')
    localStorage.setItem(
      'chat-demo:memory',
      JSON.stringify({ enabled: true, auto: false, items: [] })
    )
    window.nativeUiRequests = []
    window.nativeUiQueue = []
    window.streams = []
    const realFetch = window.fetch
    window.fetch = (url, init) => {
      if (String(url) !== 'https://api.deepseek.com/anthropic/v1/messages') {
        return realFetch(url, init)
      }
      const stream = { payload: JSON.parse(init.body) }
      const body = new ReadableStream({
        start: (controller) => {
          stream.controller = controller
        },
      })
      window.streams.push(stream)
      return Promise.resolve(
        new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
      )
    }
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            post({
              type: 'window-layout',
              insets: { top: 0, right: 0, bottom: 0, left: 0 },
              nativeHeader: false,
            })
            return
          }
          if (operation === 'read') {
            port1.postMessage(
              JSON.stringify({
                id,
                status: 0,
                value: sessionStorage.getItem('mockDeviceKey') || '',
              })
            )
            return
          }
          if (operation === 'scan') {
            if (window.deferScan) {
              window.resolveScan = (reply) =>
                port1.postMessage(JSON.stringify({ id, status: reply.status, value: reply.value }))
              return
            }
            port1.postMessage(JSON.stringify({ id, status: 0, value: `识字结果(${value})` }))
            return
          }
          if (
            operation === 'native-menu' ||
            operation === 'native-confirm' ||
            operation === 'native-sheet'
          ) {
            window.nativeUiRequests.push({ operation, payload: JSON.parse(value) })
            if (operation === 'native-sheet' && window.deferSheet) {
              window.resolveSheet = (reply) =>
                port1.postMessage(JSON.stringify({ id, status: reply.status, value: reply.value }))
              return
            }
            const next = window.nativeUiQueue.shift() ?? { status: 1, value: '' }
            port1.postMessage(JSON.stringify({ id, status: next.status, value: next.value }))
            return
          }
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({
          type: 'device-features',
          voice: false,
          apiVoice: false,
          readAloud: false,
          share: false,
          scan: true,
          immersiveScanMenu: true,
          immersiveUi: true,
          save: true,
          location: false,
          haptics: true,
          windowPrivacy: false,
          deviceType: 'tablet',
        })
      },
      { once: true }
    )
  })

  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      body: await readFile(assets + path),
      contentType: media[extname(path)],
      headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
    })
  })
  await context.route('https://api.deepseek.com/**', async (route) => {
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization',
    }
    return route.fulfill({ headers, json: { is_available: true, balance_infos: [], data: [] } })
  })

  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto(origin + '/index.html')
  const composer = page.getByPlaceholder('请输入消息')
  await composer.waitFor()

  // 2. 网页侧胶囊开关与悬浮按钮光感样式校验
  const thinkToggle = page.getByRole('button', { name: '深度思考', exact: true })
  const lightOnStyles = await thinkToggle.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      attr: document.body.hasAttribute('data-immersive-light'),
      boxShadow: style.boxShadow,
      bgImage: style.backgroundImage,
    }
  })
  assert.equal(lightOnStyles.attr, true)
  assert.notEqual(lightOnStyles.boxShadow, 'none')
  assert(lightOnStyles.bgImage.includes('radial-gradient'))

  // 收起侧栏检查悬浮按钮组 backdrop-filter
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  const collapsedBackdrop = await page
    .locator('[class*="collapsedGroup-"]')
    .evaluate((el) => getComputedStyle(el).backdropFilter)
  assert(
    collapsedBackdrop.includes('blur('),
    `Expected blur backdropFilter, got ${collapsedBackdrop}`
  )
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()

  // 3. 统一回形针「添加附件」半模态（native-sheet）：不再保留独立识字按钮、不再禁用变灰、去掉重复开关
  assert.equal(await page.getByRole('button', { name: '识别图片文字', exact: true }).count(), 0)
  const attachBtn = page.getByRole('button', { name: '添加附件', exact: true })
  const normalAttachColor = await attachBtn.evaluate((el) => getComputedStyle(el).color)

  // 半模态打开期间按钮保持正常颜色（不设 disabled），只设 aria-expanded，且重复点击不发第二次请求
  await page.evaluate(() => {
    window.deferSheet = true
  })
  await attachBtn.click()
  await page.waitForFunction(() => window.nativeUiRequests.length === 1)
  const openState = await attachBtn.evaluate((el) => ({
    disabled: el.disabled,
    expanded: el.getAttribute('aria-expanded'),
    color: getComputedStyle(el).color,
  }))
  assert.equal(openState.disabled, false, 'paperclip must not be disabled while sheet is open')
  assert.equal(openState.expanded, 'true')
  assert.equal(openState.color, normalAttachColor, 'paperclip must keep normal color while open')
  await attachBtn.click()
  assert.equal(
    await page.evaluate(() => window.nativeUiRequests.length),
    1,
    'duplicate click while sheet is open must be ignored'
  )

  // 选择拍照识字，并在识别进行中验证按钮为忙碌态且不变灰
  await page.evaluate(() => {
    window.deferSheet = false
    window.deferScan = true
    window.resolveSheet({ status: 0, value: 'scan-camera' })
  })
  const busyBtn = page.getByRole('button', { name: '正在识别文字…', exact: true })
  await busyBtn.waitFor()
  const busyState = await busyBtn.evaluate((el) => ({
    disabled: el.disabled,
    busy: el.getAttribute('aria-busy'),
    color: getComputedStyle(el).color,
  }))
  assert.equal(busyState.disabled, false, 'paperclip must not be disabled while scanning')
  assert.equal(busyState.busy, 'true')
  assert.equal(
    busyState.color,
    normalAttachColor,
    'paperclip must keep normal color while scanning'
  )
  await page.evaluate(() => {
    window.deferScan = false
    window.resolveScan({ status: 0, value: '识字结果(camera)' })
  })
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '识字结果(camera)')
  await attachBtn.waitFor()

  // 半模态只含「上传图片或文件 / 拍照识字 / 从图库识字」三项，无重复的深度思考/智能搜索/阅读链接
  const sheetReq = await page.evaluate(() =>
    window.nativeUiRequests.find((item) => item.operation === 'native-sheet')
  )
  assert(sheetReq)
  assert.equal(sheetReq.payload.title, '添加附件')
  assert.equal(sheetReq.payload.sections.length, 1)
  assert.deepEqual(
    sheetReq.payload.sections[0].items.map((i) => i.key),
    ['upload', 'scan-camera', 'scan-album']
  )

  // 原生半模态不可用时回退网页菜单，内容相同
  await page.evaluate(() => {
    window.nativeUiQueue.push({ status: -1, value: '' })
  })
  await attachBtn.click()
  await page.getByRole('menuitem', { name: '上传图片或文件', exact: true }).waitFor()
  await page.getByRole('menuitem', { name: '拍照识字', exact: true }).waitFor()
  await page.getByRole('menuitem', { name: '从图库识字', exact: true }).waitFor()
  await page.keyboard.press('Escape')

  // 创建一个会话用于菜单与删除确认测试
  await composer.fill('光感菜单测试')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.waitForFunction(() => window.streams.length > 0)
  await page.evaluate(
    (chunk) => {
      window.streams[0].controller.enqueue(new TextEncoder().encode(chunk))
      window.streams[0].controller.close()
    },
    sseReply('光感回复', '光感测试会话')
  )
  await page.getByText('光感回复').waitFor()

  // 4. 原生右键/长按菜单（native-menu）+ 不可用回退网页菜单
  const sessionRow = page.getByRole('button', { name: '光感测试会话', exact: true }).locator('..')
  await page.evaluate(() => {
    window.nativeUiQueue.push({ status: 0, value: 'rename' }, { status: -1, value: '' })
  })
  await sessionRow.click({ button: 'right' })
  const renameInput = page.getByRole('textbox', { name: '重命名' })
  await renameInput.waitFor()
  await renameInput.press('Escape')

  // 原生菜单失败时自动回退网页菜单
  await sessionRow.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除', exact: true }).waitFor()

  // 5. 原生确认弹窗（native-confirm）：先取消保留，再确认删除
  await page.evaluate(() => {
    window.nativeUiQueue.push({ status: 1, value: '' })
  })
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await page.waitForFunction(() =>
    window.nativeUiRequests.some((item) => item.operation === 'native-confirm')
  )
  // 取消后会话仍在，且没有弹出网页 Modal
  assert.equal(await page.getByRole('dialog', { name: '永久删除对话' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '光感测试会话', exact: true }).count(), 1)

  // 再次通过原生菜单选择删除 -> 原生确认弹窗确认删除
  await page.evaluate(() => {
    window.nativeUiQueue.push({ status: 0, value: 'delete' }, { status: 0, value: 'confirmed' })
  })
  await sessionRow.click({ button: 'right' })
  await page
    .getByRole('button', { name: '光感测试会话', exact: true })
    .waitFor({ state: 'detached' })

  // 6. 设置页原生确认不可用时回退网页确认弹窗 + 关闭光感开关后恢复普通样式
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理', exact: true }).click()
  await page.evaluate(() => {
    window.nativeUiQueue.push({ status: -1, value: '' })
  })
  await page.getByRole('button', { name: '删除', exact: true }).click()
  const webDeleteModal = page.getByRole('dialog', { name: '删除后，所有对话都将清空且无法找回。' })
  await webDeleteModal.waitFor()
  await webDeleteModal.getByRole('button', { name: '取消', exact: true }).click()

  // 切到外观关闭「沉浸光感」，核对按钮恢复普通样式且不再触发原生半模态
  await page.getByRole('tab', { name: '通用设置', exact: true }).click()
  await page.getByRole('button', { name: '外观', exact: true }).click()
  await page.getByRole('switch', { name: '沉浸光感' }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  assert.equal(await page.evaluate(() => document.body.hasAttribute('data-immersive-light')), false)
  // 关闭沉浸光感后按钮数量不变，回形针仍为「添加附件」，但改用网页菜单且不触发 native-sheet
  assert.equal(await page.getByRole('button', { name: '识别图片文字', exact: true }).count(), 0)
  const sheetCountBefore = await page.evaluate(
    () => window.nativeUiRequests.filter((item) => item.operation === 'native-sheet').length
  )
  await attachBtn.click()
  await page.getByRole('menuitem', { name: '上传图片或文件', exact: true }).waitFor()
  await page.getByRole('menuitem', { name: '拍照识字', exact: true }).waitFor()
  await page.getByRole('menuitem', { name: '从图库识字', exact: true }).waitFor()
  assert.equal(
    await page.evaluate(
      () => window.nativeUiRequests.filter((item) => item.operation === 'native-sheet').length
    ),
    sheetCountBefore
  )
  await page.keyboard.press('Escape')

  assert.deepEqual(runtimeErrors, [])
  console.log('immersive-light-extended: PASS')
} finally {
  await browser.close()
}
