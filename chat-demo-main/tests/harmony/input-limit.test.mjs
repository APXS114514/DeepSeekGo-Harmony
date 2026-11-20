// 回归聊天请求的 32K 输入限制，以及超限图片的上传、历史补传和草稿迁移。
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

/** respond(body) 返回 { status, message } 或 { text, title }。 */
const open = async (respond, shouldFailUpload = () => false) => {
  const chats = []
  const uploads = []
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 960, height: 720 },
  })
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
      const form = await new Response(request.postDataBuffer(), {
        headers: { 'content-type': request.headers()['content-type'] },
      }).formData()
      const file = form.get('file')
      const upload = {
        id: 'file-api-upload-' + (uploads.length + 1),
        name: file.name,
        purpose: form.get('purpose'),
        bytes: Buffer.from(await file.arrayBuffer()),
      }
      uploads.push(upload)
      if (shouldFailUpload(upload)) {
        return route.fulfill({ headers, status: 503, body: 'Mock upload unavailable' })
      }
      return route.fulfill({
        headers,
        json: { id: upload.id, size_bytes: upload.bytes.length, mime_type: file.type },
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
  await page
    .getByText(/今天想聊什么|无痕对话/)
    .first()
    .waitFor()
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

const imageIds = (body) =>
  body.messages.flatMap(({ content }) =>
    Array.isArray(content)
      ? content.filter(({ type }) => type === 'image').map(({ source }) => source.file_id)
      : []
  )

const pngDimensions = (bytes) => {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

const attachImages = (page, images) =>
  page.locator('input[type=file][multiple]').evaluate(async (input, images) => {
    const transfer = new DataTransfer()
    const originals = {}
    for (const [name, width, height] of images) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, width, height / 2)
      context.fillStyle = '#00ff00'
      context.fillRect(0, height / 2, width, height / 2)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      transfer.items.add(new File([blob], name, { type: 'image/png' }))
      originals[name] = Array.from(new Uint8Array(await blob.arrayBuffer()))
    }
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return originals
  }, images)

// 模拟升级前的记录。原件仍来自实际的上传入口，只有指定图片没有本地原件。
const seedLegacyImages = (page, title, missing = []) =>
  page.evaluate(
    async ({ title, missing }) => {
      const result = (request) =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const db = await result(indexedDB.open('chat-demo'))
      try {
        const tx = db.transaction(['sessions', 'files'], 'readwrite')
        const done = new Promise((resolve, reject) => {
          tx.oncomplete = resolve
          tx.onabort = () => reject(tx.error)
        })
        const sessions = tx.objectStore('sessions')
        const session = (await result(sessions.getAll())).find((session) => session.title === title)
        const files = session.messages.flatMap((message) => message.files ?? [])
        for (const file of files) {
          file.serverId = 'file-api-legacy-' + file.name
          delete file.imageSizeChecked
          if (missing.includes(file.name)) tx.objectStore('files').delete(file.id)
        }
        sessions.put(session)
        await done
      } finally {
        db.close()
      }
    },
    { title, missing }
  )

const savedImages = (page, title) =>
  page.evaluate(async (title) => {
    const result = (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const db = await result(indexedDB.open('chat-demo'))
    try {
      const tx = db.transaction(['sessions', 'files'])
      const [sessions, originals] = await Promise.all([
        result(tx.objectStore('sessions').getAll()),
        result(tx.objectStore('files').getAll()),
      ])
      const session = sessions.find((session) => session.title === title)
      return Promise.all(
        session.messages
          .flatMap((message) => message.files ?? [])
          .map(async (file) => {
            const blob = originals.find(({ id }) => id === file.id)?.blob
            return { ...file, bytes: blob && Array.from(new Uint8Array(await blob.arrayBuffer())) }
          })
      )
    } finally {
      db.close()
    }
  }, title)

const reopen = async (page, title) => {
  await page.reload()
  await page.getByText(title, { exact: true }).first().click()
}

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

  // 新图仅缩放上传副本。升级后的历史大图失败时跳过旧 ID，下轮重试并保存新 ID。
  {
    const title = '历史长图'
    let rejectNextUpload = false
    let reply = 0
    const { context, page, errors, chats, uploads } = await open(
      () => ({ text: '图片回答 ' + ++reply, title }),
      () => {
        const reject = rejectNextUpload
        rejectNextUpload = false
        return reject
      }
    )
    const originals = await attachImages(page, [
      ['tall.png', 320, 9000],
      ['wide.png', 8192, 1],
      ['boundary.png', 4096, 24],
    ])
    await send(page, '发送三张图片')
    await page.getByText('图片回答 1', { exact: true }).waitFor()
    await idle(page)
    assert.equal(uploads.length, 3)
    const byName = Object.fromEntries(uploads.map((upload) => [upload.name, upload]))
    assert.deepEqual(pngDimensions(byName['tall.png'].bytes), [146, 4096])
    assert.deepEqual(pngDimensions(byName['wide.png'].bytes), [4096, 1])
    assert.deepEqual(byName['boundary.png'].bytes, Buffer.from(originals['boundary.png']))
    assert(uploads.every(({ purpose }) => purpose === null))
    assert.deepEqual(
      imageIds(chats[0]),
      ['tall.png', 'wide.png', 'boundary.png'].map((name) => byName[name].id)
    )
    await page.getByText(title, { exact: true }).first().waitFor()
    for (const { name, bytes, imageSizeChecked } of await savedImages(page, title)) {
      assert.deepEqual(bytes, originals[name], name + ' retains the exact original bytes')
      assert.equal(imageSizeChecked, true)
    }

    await seedLegacyImages(page, title, ['wide.png'])
    await reopen(page, title)
    rejectNextUpload = true
    await send(page, '历史补传失败后仍可回答')
    await page.getByText('图片回答 2', { exact: true }).waitFor()
    await idle(page)
    assert.equal(uploads.length, 4)
    assert.equal(uploads[3].name, 'tall.png')
    assert.deepEqual(imageIds(chats[1]), [
      'file-api-legacy-wide.png',
      'file-api-legacy-boundary.png',
    ])

    await send(page, '下一轮重新补传')
    await page.getByText('图片回答 3', { exact: true }).waitFor()
    await idle(page)
    assert.equal(uploads.length, 5)
    assert.deepEqual(pngDimensions(uploads[4].bytes), [146, 4096])
    const migratedIds = [uploads[4].id, 'file-api-legacy-wide.png', 'file-api-legacy-boundary.png']
    assert.deepEqual(imageIds(chats[2]), migratedIds)
    const [tall, wide, boundary] = await savedImages(page, title)
    assert.deepEqual([tall.serverId, wide.serverId, boundary.serverId], migratedIds)
    assert.deepEqual(
      [tall.imageSizeChecked, wide.imageSizeChecked, boundary.imageSizeChecked],
      [true, undefined, true]
    )
    assert.deepEqual(tall.bytes, originals['tall.png'])

    await reopen(page, title)
    await send(page, '刷新后复用已补传的图片')
    await page.getByText('图片回答 4', { exact: true }).waitFor()
    await idle(page)
    assert.deepEqual(imageIds(chats[3]), migratedIds)
    assert.equal(uploads.length, 5)
    assert.deepEqual(errors, [])
    await context.close()
  }

  // 从历史恢复上下文超限的消息时，草稿仍带着旧图的尺寸标记状态。
  {
    const title = '需要另开对话'
    let rejectContext = false
    const { context, page, errors, chats, uploads } = await open(() =>
      rejectContext
        ? { status: 400, message: 'This model’s maximum context length is 1048576 tokens.' }
        : { text: '新的图片回答', title }
    )
    await send(page, '建立一段历史')
    await page.getByText('新的图片回答', { exact: true }).waitFor()
    await idle(page)
    rejectContext = true
    await attachImages(page, [['carry.png', 640, 8192]])
    await send(page, '把这张长图带入新对话')
    await page.getByText('本轮请求超出上下文上限。').waitFor()
    await idle(page)
    await seedLegacyImages(page, title)
    await reopen(page, title)
    await page.getByRole('button', { name: '带上草稿和附件开启新对话' }).click()
    rejectContext = false
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('新的图片回答', { exact: true }).waitFor()
    await idle(page)
    assert.equal(uploads.length, 2)
    assert.deepEqual(pngDimensions(uploads[1].bytes), [320, 4096])
    assert.deepEqual(imageIds(chats.at(-1)), [uploads[1].id])
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await browser.close()
}
