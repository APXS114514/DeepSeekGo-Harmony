// 1.5.2 回归：开启会话标题、智能搜索或阅读链接时，最新一条用户消息超过 32,768 Token 会被服务端拒绝。
// 客户端去掉标题、在提问不含链接时关闭阅读链接后重发一次；仍被拒时给出中文说明，不循环重发。
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
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
}

// 与 2026-11-19 实测的服务端报错一致：新格式带 request_id，旧格式来自用户最初的报告。
const NEW_FORMAT =
  'user input too long, 175869 tokens exceeds max 32768 tokens (request_id: 5b343859-7975-4e1b-973f-374e695efb1e)'
const OLD_FORMAT = 'User input too long. 175871 Tokens, Exceeded max 32768 tokens'

const sse = (text, title) =>
  [
    { type: 'message_start', message: { id: 'mock', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', title } },
    { type: 'message_stop' },
  ]
    .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
    .join('')

const limited = (body) =>
  hasDocument(body.messages.at(-1)) && (body.title?.enabled || body.tools.length > 0)
const toolTypes = (body) => body.tools.map(({ type }) => type)
const TOOLS_HINT = '开启智能搜索或阅读链接时，单条消息连同附件最多约 3.2 万 Token'

const hasDocument = (message) =>
  Array.isArray(message.content) && message.content.some((block) => block.type === 'document')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })

/** respond(body) 返回 { status, json } 或 { text, title } */
const open = async (respond) => {
  const chats = []
  const uploads = []
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 960, height: 720 } })
  await context.addInitScript(() => {
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            window.lastWindowUi = JSON.parse(value)
            post({ type: 'window-layout', insets: { top: 0, right: 0, bottom: 0, left: 0 } })
            return
          }
          if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({ type: 'device-features', deviceType: 'tablet' })
      },
      { once: true }
    )
  })
  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    try {
      return route.fulfill({
        body: await readFile(assets + path),
        contentType: media[extname(path)],
        headers: { 'Content-Security-Policy': csp },
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
    const path = new URL(request.url()).pathname
    if (path === '/user/balance') {
      return route.fulfill({ headers, json: { is_available: true, balance_infos: [] } })
    }
    if (path === '/models') {
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    }
    if (path === '/anthropic/v1/files') {
      uploads.push(path)
      return route.fulfill({
        headers,
        json: { id: 'file-api-long', size_bytes: 762454, mime_type: 'text/markdown' },
      })
    }
    const body = request.postDataJSON()
    if (!body.system?.startsWith('你负责维护用户的长期记忆')) {
      chats.push(body)
    }
    const result = body.system?.startsWith('你负责维护用户的长期记忆')
      ? { text: '{"add":[],"update":[],"remove":[]}' }
      : respond(body)
    if (result.status) {
      return route.fulfill({
        headers,
        status: result.status,
        json: { type: 'error', error: { type: 'invalid_request_error', message: result.message } },
      })
    }
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: sse(result.text, result.title),
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(origin + '/index.html')
  await page.getByText(/今天想聊什么|无痕对话/).first().waitFor()
  return { context, page, errors, chats, uploads }
}

const attachText = (page, name) =>
  page.locator('input[type=file][multiple]').evaluate((el, name) => {
    const data = new DataTransfer()
    data.items.add(new File(['长篇小说正文'], name, { type: 'text/plain' }))
    el.files = data.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, name)

const send = async (page, text) => {
  await page.locator('textarea:visible').first().fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
}

const idle = (page) => page.waitForFunction(() => window.lastWindowUi?.generating === false)

try {
  // 默认开启阅读链接，提问不含链接：去掉标题和阅读链接重发并正常回答，之后的短问题再生成标题。
  {
    const { context, page, errors, chats, uploads } = await open((body) => {
      if (limited(body)) return { status: 400, message: NEW_FORMAT }
      return {
        text: hasDocument(body.messages.at(-1)) ? '这是一部长篇小说的概括。' : '不客气。',
        title: body.title?.enabled ? '长篇小说概括' : undefined,
      }
    })
    await attachText(page, 'long-novel.txt')
    await page.getByText('long-novel.txt', { exact: true }).waitFor()
    await send(page, '用一句话概括这份文件')
    await page.getByText('这是一部长篇小说的概括。').waitFor()
    await idle(page)

    assert.equal(chats.length, 2, 'one fallback request')
    assert.deepEqual(chats[0].title, { enabled: true })
    assert.deepEqual(toolTypes(chats[0]), ['deepseek_read_url'])
    assert.equal(Object.hasOwn(chats[1], 'title'), false)
    assert.deepEqual(chats[1].tools, [])
    assert.deepEqual(chats[1].messages, chats[0].messages)
    assert.equal(chats[1].model, chats[0].model)
    assert.equal(uploads.length, 1, 'fallback reuses the uploaded file')
    assert.equal(await page.getByText(/user input too long/i).count(), 0)
    assert.equal(await page.getByText('长篇小说概括').count(), 0)

    // 下一轮恢复本轮设置：再次请求标题，阅读链接照常开启；历史附件不计入这项检查。
    await send(page, '谢谢')
    await page.getByText('不客气。').waitFor()
    await idle(page)
    assert.equal(chats.length, 3)
    assert.deepEqual(chats[2].title, { enabled: true }, 'untitled session asks again')
    assert.deepEqual(toolTypes(chats[2]), ['deepseek_read_url'])
    assert(
      chats[2].messages.some((message) => message.role === 'user' && hasDocument(message)),
      'history keeps the attachment'
    )
    await page.getByText('长篇小说概括').first().waitFor()
    assert.deepEqual(errors, [])
    await context.close()
  }

  // 开启智能搜索（旧版报错文案）：只重发一次，仍被拒时显示中文说明，不进入循环。
  {
    const { context, page, errors, chats } = await open((body) =>
      limited(body) ? { status: 400, message: OLD_FORMAT } : { text: '普通回答' }
    )
    await page.getByRole('button', { name: '智能搜索', exact: true }).click()
    await attachText(page, 'still-too-long.txt')
    await page.getByText('still-too-long.txt', { exact: true }).waitFor()
    await send(page, '用一句话概括这份文件')
    await page.getByText(TOOLS_HINT, { exact: false }).waitFor()
    await idle(page)
    assert.equal(chats.length, 2)
    assert.deepEqual(toolTypes(chats[0]), ['deepseek_read_url', 'deepseek_web_search'])
    assert.equal(Object.hasOwn(chats[1], 'title'), false)
    assert.deepEqual(toolTypes(chats[1]), ['deepseek_web_search'])
    assert.equal(await page.getByText(OLD_FORMAT).count(), 0)
    assert.deepEqual(errors, [])
    await context.close()
  }

  // 提问含链接：保留阅读链接，只去掉标题重发；仍被拒时显示中文说明。
  {
    const { context, page, errors, chats } = await open((body) =>
      limited(body) ? { status: 400, message: NEW_FORMAT } : { text: '普通回答' }
    )
    await attachText(page, 'with-link.txt')
    await page.getByText('with-link.txt', { exact: true }).waitFor()
    await send(page, '结合 https://example.com/page 概括这份文件')
    await page.getByText(TOOLS_HINT, { exact: false }).waitFor()
    await idle(page)
    assert.equal(chats.length, 2)
    assert.deepEqual(chats[0].title, { enabled: true })
    assert.equal(Object.hasOwn(chats[1], 'title'), false)
    assert.deepEqual(toolTypes(chats[1]), ['deepseek_read_url'])
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await browser.close()
}
