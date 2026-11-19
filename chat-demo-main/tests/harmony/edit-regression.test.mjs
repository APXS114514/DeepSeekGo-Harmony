import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
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
    const path = new URL(route.request().url()).pathname
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization',
    }
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
    assert.equal(path, '/models')
    return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
  })
  await context.addInitScript(() => {
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
  await key.fill(firstKey)
  await submit.click()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForFunction(() => !window.lastWindowUi.covered)
  const composer = page.getByPlaceholder('请输入消息')
  await page.getByRole('button', { name: '深度思考', exact: true }).click()
  const send = page.getByRole('button', { name: '发送', exact: true })
  const thinking = page.getByRole('button', { name: '正在思考', exact: true })
  const done = page.getByRole('button', { name: /^已思考/ })
  const preview = page.locator('[class^="preview-"]')
  const emit = (index, frames, complete = false) =>
    page.evaluate(
      ({ index, frames, complete }) => {
        const { controller } = window.streams[index]
        const encoder = new TextEncoder()
        for (const frame of frames) {
          controller.enqueue(
            encoder.encode(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
          )
        }
        if (complete) controller.close()
      },
      { index, frames, complete }
    )
  const thinkingStart = [
    { type: 'message_start', message: { id: 'mock', content: [] } },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
  ]
  const thoughtDelta = (thinking) => ({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking },
  })
  const answerStart = (text) => [
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
  ]
  const answerEnd = [
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', title: '测试会话' } },
    { type: 'message_stop' },
  ]
  const begin = async (index, initialText) => {
    await page.waitForFunction((index) => window.streams.length > index, index)
    assert.equal(
      await page.evaluate((i) => window.streams[i].payload.thinking.type, index),
      'enabled'
    )
    await emit(index, [...thinkingStart, thoughtDelta(initialText)])
  }
  const firstPrompt = '原始问题'
  const revisedPrompt = '修改后的问题'
  const early = '第一段思考起点'
  const body = '这是用于测试高度的推理句子。'.repeat(50)
  await composer.fill(firstPrompt)
  await send.click()
  await begin(0, early + '\n\n' + body + '\n\n当前片段')
  await preview.waitFor()
  assert.equal(await thinking.getAttribute('aria-expanded'), 'false')
  assert(!(await preview.textContent()).includes(early))
  assert.match(await preview.textContent(), /当前片段$/)
  await emit(0, [thoughtDelta('，第二次增量')])
  await preview.getByText(/第二次增量/).waitFor()
  const previewGeometry = await preview.evaluate((el) => {
    const outer = el.getBoundingClientRect()
    const inner = el.firstElementChild.getBoundingClientRect()
    return {
      height: outer.height,
      max: parseFloat(getComputedStyle(el).lineHeight) * 5,
      childHeight: inner.height,
      visibleEnd: inner.bottom <= outer.bottom + 1,
    }
  })
  assert(previewGeometry.height <= previewGeometry.max + 1)
  assert(previewGeometry.childHeight > previewGeometry.height)
  assert(previewGeometry.visibleEnd)
  await emit(0, answerStart('这是正式回答。'))
  await page.getByText('这是正式回答。').waitFor()
  await preview.waitFor({ state: 'detached' })
  assert.equal(await done.getAttribute('aria-expanded'), 'false')
  await emit(0, answerEnd, true)
  const editButton = page.getByRole('button', { name: '编辑消息', exact: true })
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="编辑消息"]')?.disabled
  )
  await done.click()
  await page.getByText(early, { exact: true }).waitFor()
  assert.equal(await done.getAttribute('aria-expanded'), 'true')
  await done.click()
  await page.getByText(early, { exact: true }).waitFor({ state: 'detached' })

  await composer.fill('原有输入草稿')
  const editor = page.getByRole('textbox', { name: '编辑消息', exact: true })
  const apply = page.getByRole('button', { name: '发送', exact: true })
  const cancel = page.getByRole('button', { name: '取消', exact: true })
  const keyboard = async (height, offsetTop = 0) => {
    await page.evaluate(
      ({ height, offsetTop }) => {
        const viewport = window.visualViewport
        if (height === null) {
          delete viewport.height
          delete viewport.offsetTop
        } else {
          Object.defineProperties(viewport, {
            height: { configurable: true, value: height },
            offsetTop: { configurable: true, value: offsetTop },
          })
        }
        viewport.dispatchEvent(new Event('resize'))
      },
      { height, offsetTop }
    )
  }
  const editorUsable = async () => {
    await composer.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('textarea:visible').count(), 1)
    await page.waitForFunction(() => {
      const textbox = document.querySelector('textarea[aria-label="编辑消息"]')
      const editor = textbox.parentElement
      const pane = editor.closest('[class^="scroll-"]')
      const scroller = getComputedStyle(pane).display === 'contents' ? pane.parentElement : pane
      const scrollBounds = scroller.getBoundingClientRect()
      return Array.from(editor.querySelectorAll('button')).every((button) => {
        const box = button.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return (
          box.top >= scrollBounds.top && box.bottom <= scrollBounds.bottom && button.contains(hit)
        )
      })
    })
  }
  await editButton.click()
  await editor.waitFor()
  assert.equal(await editor.inputValue(), firstPrompt)
  assert(await editor.evaluate((el) => document.activeElement === el))
  await keyboard(275, 10)
  await editor.fill('很长的编辑内容。\n'.repeat(50))
  await editorUsable()
  assert(await editor.evaluate((el) => el.scrollHeight > el.clientHeight))
  await cancel.tap()
  await composer.waitFor()
  assert.equal(await composer.inputValue(), '原有输入草稿')
  assert.equal(await page.getByText(firstPrompt, { exact: true }).count(), 1)
  assert.equal(await page.evaluate(() => window.streams.length), 1)
  await keyboard(null)

  await editButton.click()
  await editor.waitFor()
  await page.setViewportSize({ width: 680, height: 420 })
  await page.waitForFunction(() => document.body.dataset.chatLayout === 'medium')
  assert.equal(await editor.inputValue(), firstPrompt)
  await keyboard(230, 0)
  await editor.fill(revisedPrompt)
  await editorUsable()
  await apply.tap()
  await composer.waitFor()
  assert.equal(await composer.inputValue(), '原有输入草稿')
  await keyboard(null)
  await begin(1, '第二条回复的思考。')
  const request = await page.evaluate(() => window.streams[1].payload)
  assert.equal(request.messages.at(-1).content, revisedPrompt)
  await preview.waitFor()
  await thinking.click()
  await page.getByText('第二条回复的思考。', { exact: true }).waitFor()
  await emit(1, [...answerStart('修改后的回答。'), ...answerEnd], true)
  await page.getByText('修改后的回答。', { exact: true }).waitFor()
  assert.equal(await done.getAttribute('aria-expanded'), 'true')
  await page.getByRole('button', { name: '上一个版本' }).click()
  await page.getByText(firstPrompt, { exact: true }).waitFor()
  await page.getByText('这是正式回答。', { exact: true }).waitFor()
  assert.equal(await done.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(runtimeErrors, [])
  process.stdout.write(
    'PASS: incremental thinking tail, auto-collapse, manual disclosure, keyboard-safe editing in compact and medium layouts, cancel/send, preserved draft and previous branch\n'
  )
} finally {
  await browser.close()
}
