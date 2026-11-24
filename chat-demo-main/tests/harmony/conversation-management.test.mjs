import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(repoRoot, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
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

const sseEvent = (type, payload) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`

const replyEvents = (text, title) =>
  [
    sseEvent('message_start', {
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'deepseek-flash',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }),
    sseEvent('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    sseEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }),
    sseEvent('content_block_stop', { index: 0 }),
    sseEvent('message_delta', {
      delta: { stop_reason: 'end_turn', ...(title ? { title } : {}) },
      usage: { output_tokens: 12 },
    }),
    sseEvent('message_stop', {}),
  ].join('')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1024, height: 760 },
  })
  await context.addInitScript(() => {
    sessionStorage.setItem('mockDeviceKey', 'test-conv-key')
    localStorage.setItem(
      'chat-demo:memory',
      JSON.stringify({ enabled: true, auto: false, items: [] })
    )
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            window.lastWindowUi = JSON.parse(value)
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
          if (operation === 'save') {
            sessionStorage.setItem('mockDeviceKey', value)
            port1.postMessage(JSON.stringify({ id, status: 0, value: '' }))
          }
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({
          type: 'device-features',
          voice: false,
          apiVoice: false,
          readAloud: false,
          share: false,
          scan: false,
          immersiveScanMenu: false,
          save: true,
          location: false,
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
    const path = new URL(route.request().url()).pathname
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, anthropic-version, anthropic-beta, x-api-key',
    }
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/anthropic/v1/files') {
      return route.fulfill({ headers, json: { id: 'file_mock_001' } })
    }
    if (path === '/user/balance') {
      return route.fulfill({ headers, json: { is_available: true, balance_infos: [] } })
    }
    return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
  })

  await context.addInitScript(() => {
    window.streams = []
    const realFetch = window.fetch
    window.fetch = (url, init) => {
      if (String(url) !== 'https://api.deepseek.com/anthropic/v1/messages') {
        return realFetch(url, init)
      }
      const stream = {
        payload: JSON.parse(init.body),
        aborted: false,
      }
      if (init.signal) {
        init.signal.addEventListener('abort', () => {
          stream.aborted = true
          try {
            stream.controller?.error(new DOMException('Aborted', 'AbortError'))
          } catch {
            // already closed
          }
        })
      }
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

  const pushStream = async (index, chunk, close = true) => {
    await page.waitForFunction((i) => window.streams.length > i, index)
    await page.evaluate(
      ({ i, text, done }) => {
        const s = window.streams[i]
        s.controller.enqueue(new TextEncoder().encode(text))
        if (done) {
          s.controller.close()
        }
      },
      { i: index, text: chunk, done: close }
    )
  }

  await page.goto(origin + '/index.html')
  const composer = page.getByPlaceholder('请输入消息')
  await composer.waitFor()

  // 1. 第一轮提问并生成标题「量子计算」
  await composer.fill('第一轮问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(0, replyEvents('第一轮回答内容', '量子计算'))
  await page.getByText('第一轮回答内容').waitFor()

  // 2. 第二轮附带文件提问，再撤回上一轮
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('附件内容示例'),
  })
  await page.getByText('notes.txt').waitFor()
  await composer.fill('第二轮带附件问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(1, replyEvents('第二轮回答内容'))
  await page.getByText('第二轮回答内容').waitFor()

  // 点按「撤回上一轮」
  await page.getByRole('button', { name: '撤回上一轮', exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('第二轮回答内容'))
  assert.equal(await composer.inputValue(), '第二轮带附件问题')
  await page.getByText('notes.txt').waitFor()

  // 修改草稿后重发，核对请求上下文不包含已撤回的旧第二轮
  await composer.fill('第二轮修改后问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(2, replyEvents('第二轮修订回答'))
  await page.getByText('第二轮修订回答').waitFor()

  const thirdPayload = await page.evaluate(() => window.streams[2].payload)
  const sentTexts = thirdPayload.messages.map((m) =>
    typeof m.content === 'string'
      ? m.content
      : m.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
  )
  assert(
    sentTexts.every(
      (text) => !text.includes('第二轮带附件问题') && !text.includes('第二轮回答内容')
    ),
    'Recalled turn must be absent from subsequent context'
  )
  assert(sentTexts.some((text) => text.includes('第一轮问题')))
  assert(sentTexts.some((text) => text.includes('第二轮修改后问题')))

  // 3. 流式生成中撤回上一轮：先停止生成，再恢复为草稿
  await composer.fill('流式撤回测试问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(
    3,
    sseEvent('message_start', {
      message: {
        id: 'msg_stream',
        type: 'message',
        role: 'assistant',
        model: 'deepseek-flash',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }) +
      sseEvent('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
      sseEvent('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: '正在输出一半' },
      }),
    false
  )
  await page.getByText('正在输出一半').waitFor()
  await page.getByRole('button', { name: '撤回上一轮', exact: true }).click()
  await page.waitForFunction(() => window.streams[3].aborted === true)
  await page.waitForFunction(() => !document.body.innerText.includes('正在输出一半'))
  assert.equal(await composer.inputValue(), '流式撤回测试问题')
  await composer.fill('')

  // 4. 从第一轮回答「从此处开启新分支」
  const forkButtons = page.getByRole('button', { name: '从此处开启新分支', exact: true })
  assert.equal(await forkButtons.count(), 2)
  await forkButtons.first().click()

  // 新分支「量子计算（1）」自动打开，且只带第一轮记录，不带第二轮
  await page.getByRole('button', { name: '量子计算（1）', exact: true }).waitFor()
  assert(await page.getByText('第一轮回答内容').isVisible())
  assert.equal(await page.getByText('第二轮修订回答').count(), 0)

  // 侧栏自动归组并展开
  const group = page.locator('[data-branch-group]').first()
  await group.waitFor()
  const toggleBtn = group.locator('button[aria-expanded]').first()
  assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'true')
  await group.getByRole('button', { name: '量子计算', exact: true }).waitFor()
  await group.getByRole('button', { name: '量子计算（1）', exact: true }).waitFor()

  // 在分支（1）中独立继续对话，确认上下文仅包含第一轮 + 分支新提问
  await composer.fill('分支一的独立追问')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(4, replyEvents('分支一的回答'))
  await page.getByText('分支一的回答').waitFor()
  const branchPayload = await page.evaluate(() => window.streams[4].payload)
  const branchTexts = branchPayload.messages.map((m) =>
    typeof m.content === 'string'
      ? m.content
      : m.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
  )
  assert(branchTexts.every((t) => !t.includes('第二轮修订回答')))
  assert(branchTexts.some((t) => t.includes('分支一的独立追问')))

  // 5. 从分支（1）再开分支：归入同一组，命名为「量子计算（2）」
  await page.getByRole('button', { name: '从此处开启新分支', exact: true }).last().click()
  await group.getByRole('button', { name: '量子计算（2）', exact: true }).waitFor()
  assert.equal(await page.locator('[data-branch-group]').count(), 1)
  assert.equal(await group.getByText('3', { exact: true }).count(), 1)

  // 折叠再展开分支组
  await toggleBtn.click()
  assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'false')
  assert.equal(await group.getByRole('button', { name: '量子计算（2）', exact: true }).count(), 0)
  await toggleBtn.click()
  assert.equal(await toggleBtn.getAttribute('aria-expanded'), 'true')
  await group.getByRole('button', { name: '量子计算（2）', exact: true }).waitFor()

  // 6. 普通新对话照常单独显示（不在分支组内）
  await page.getByRole('button', { name: '新对话', exact: true }).click()
  await composer.fill('普通对话问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await pushStream(5, replyEvents('普通对话回答', '独立普通对话'))
  await page.getByText('普通对话回答').waitFor()
  await page.getByRole('button', { name: '独立普通对话', exact: true }).waitFor()
  assert.equal(await group.getByRole('button', { name: '独立普通对话', exact: true }).count(), 0)

  // 7. 删除原对话「量子计算」后，其分支仍可正常打开、重命名和继续使用
  const origRow = group.getByRole('button', { name: '量子计算', exact: true }).locator('..')
  await origRow.hover()
  await origRow.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  const deleteDialog = page.getByRole('dialog', { name: '永久删除对话' })
  await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
  await group.getByRole('button', { name: '量子计算', exact: true }).waitFor({ state: 'detached' })
  assert.equal(await group.getByText('2', { exact: true }).count(), 1)

  // 剩余 2 个分支仍在同组且可打开
  await group.getByRole('button', { name: '量子计算（1）', exact: true }).click()
  await page.getByText('分支一的回答').waitFor()

  // 重命名分支（1）
  const branch1Row = group.getByRole('button', { name: '量子计算（1）', exact: true }).locator('..')
  await branch1Row.hover()
  await branch1Row.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  const renameInput = page.getByRole('textbox', { name: '重命名' })
  await renameInput.fill('重命名后的分支')
  await renameInput.press('Enter')
  await group.getByRole('button', { name: '重命名后的分支', exact: true }).waitFor()

  // 重载页面后确认分支组与重命名均已持久化
  await page.reload()
  const reloadedGroup = page.locator('[data-branch-group]').first()
  await reloadedGroup.waitFor()
  await reloadedGroup.getByRole('button', { name: '重命名后的分支', exact: true }).waitFor()
  await reloadedGroup.getByRole('button', { name: '量子计算（2）', exact: true }).waitFor()

  assert.deepEqual(runtimeErrors, [])
  console.log('conversation-management: PASS')
} finally {
  await browser.close()
}
