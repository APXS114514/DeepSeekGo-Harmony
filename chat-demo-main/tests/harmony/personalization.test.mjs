// 1.2.0 自定义指令与跨对话记忆回归：模拟 ArkWeb 端口与 DeepSeek API。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
const shots = process.argv[2]
const origin = 'https://deepseek.local.invalid'
const assets = join(root, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(root, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
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
const nativePath =
  /^\/static\/(?:js|css|media)\/(?:async\/)?[a-zA-Z0-9._-]+\.(?:js|css|woff2?|ttf|png)$/

const chats = []
const extractions = []
const consolidations = []
let nextExtraction = '{"add":[],"update":[],"remove":[]}'
let nextConsolidation = ''

const sse = (text, title) => {
  const frames = [
    { type: 'message_start', message: { id: 'mock', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', ...(title ? { title } : {}) } },
    { type: 'message_stop' },
  ]
  return frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join('')
}

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await context.addInitScript(() => {
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        window.mockWindowAction = (action) => post({ type: 'window-action', action })
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
          if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({ type: 'device-features', voice: true, scan: true, save: true })
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
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, x-api-key, anthropic-version, anthropic-beta',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(request.url()).pathname
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
    if (path === '/models')
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    assert.equal(path, '/anthropic/v1/messages')
    const body = request.postDataJSON()
    assert.equal(request.headers()['x-api-key'], 'test-local-key')
    if (body.system.startsWith('你负责维护用户的长期记忆')) {
      extractions.push(body)
      assert.equal(body.thinking.type, 'disabled')
      assert.deepEqual(body.tools, [])
      return route.fulfill({ headers, contentType: 'text/event-stream', body: sse(nextExtraction) })
    }
    if (body.system.startsWith('你负责整理用户的长期记忆列表')) {
      consolidations.push(body)
      return route.fulfill({
        headers,
        contentType: 'text/event-stream',
        body: sse(nextConsolidation),
      })
    }
    chats.push(body)
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: sse(`第 ${chats.length} 条回复。`, '测试会话'),
    })
  })

  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy'))
      errors.push(message.text())
  })
  const toast = (text) => page.getByText(text, { exact: true }).waitFor()
  const stored = (key) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), key)
  const settings = page.getByRole('dialog', { name: '设置' })
  const openPersonal = async () => {
    await page.evaluate(() => window.mockWindowAction('sidebar'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await settings.getByRole('tab', { name: '个性化' }).click()
  }
  const closeSettings = async () => {
    await settings.getByRole('button', { name: '关闭', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    // 设置是从侧栏抽屉打开的，点主区域收起抽屉
    if (await page.evaluate(() => document.querySelector('main')?.inert)) {
      await page.mouse.click(360, 400)
      await page.waitForFunction(() => !document.querySelector('main')?.inert)
    }
  }
  const send = async (text, reply) => {
    const before = extractions.length
    await page.locator('textarea').fill(text)
    try {
      await page.getByRole('button', { name: '发送', exact: true }).click({ timeout: 3000 })
    } catch (error) {
      await page.screenshot({ path: join(shots, 'fail.png') })
      console.log(
        await page.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value))
      )
      throw error
    }
    await page.getByText(reply, { exact: true }).waitFor()
    return before
  }
  const waitExtraction = (count) =>
    page
      .waitForFunction(() => true)
      .then(async () => {
        for (let i = 0; i < 50 && extractions.length < count; i++) await page.waitForTimeout(100)
        assert.equal(extractions.length, count)
      })

  await page.goto(origin + '/index.html')
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()

  // ---------- 自定义指令 ----------
  await openPersonal()
  const about = settings.getByLabel('希望 DeepSeek 了解你的哪些背景？')
  const style = settings.getByLabel('希望 DeepSeek 怎样回复？')
  const saveInstructions = settings.getByRole('button', { name: '保存', exact: true })
  assert(await saveInstructions.isDisabled())
  await about.fill('  我在杭州做嵌入式开发。  ')
  await style.fill('先给结论，再给步骤。')
  await saveInstructions.click()
  await toast('自定义指令已保存，将用于之后发送的消息')
  assert.deepEqual(await stored('chat-demo:custom-instructions'), {
    aboutUser: '我在杭州做嵌入式开发。',
    responseStyle: '先给结论，再给步骤。',
    enabled: true,
  })
  assert.equal(await about.inputValue(), '我在杭州做嵌入式开发。')
  assert(await saveInstructions.isDisabled())

  // ---------- 手动添加记忆 ----------
  const memoryInput = settings.getByRole('textbox', { name: '手动添加一条记忆' })
  await memoryInput.fill('用户喜欢简洁的回答')
  await settings.getByRole('button', { name: '添加', exact: true }).click()
  await settings.getByText('已保存的记忆（1）').waitFor()
  await settings.getByText('用户喜欢简洁的回答', { exact: true }).waitFor()
  await settings.getByText(/手动添加$/).waitFor()
  await memoryInput.fill('用户喜欢简洁的回答')
  await memoryInput.press('Enter')
  await toast('这条记忆已经存在')
  if (shots) await page.screenshot({ path: join(shots, '1-personal-settings.png') })
  await closeSettings()

  // ---------- 发送时注入，回复后自动提炼 ----------
  nextExtraction = '```json\n{"add":["用户叫小林，是一名护士"],"update":[],"remove":[]}\n```'
  let before = await send('你好，我叫小林，是一名护士', '第 1 条回复。')
  const system1 = chats[0].system
  assert(system1.startsWith('该助手为DeepSeek，由深度求索公司创造。'))
  assert(system1.includes('## 用户提供的背景信息\n我在杭州做嵌入式开发。'))
  assert(system1.includes('## 用户希望的回复方式\n先给结论，再给步骤。'))
  assert(system1.includes('## 关于用户的记忆\n'))
  assert(system1.includes('- 用户喜欢简洁的回答'))
  await waitExtraction(before + 1)
  const extractInput = extractions.at(-1).messages[0].content
  assert(extractInput.includes('1. 用户喜欢简洁的回答'))
  assert(extractInput.includes('你好，我叫小林，是一名护士'))
  assert(extractInput.includes('第 1 条回复。'))
  await toast('已更新记忆')
  let memory = await stored('chat-demo:memory')
  assert.deepEqual(
    memory.items.map((item) => [item.text, item.source]),
    [
      ['用户喜欢简洁的回答', 'manual'],
      ['用户叫小林，是一名护士', 'auto'],
    ]
  )

  // 同一会话沿用首轮记忆，系统提示词不变以便命中前缀缓存；疑似密钥不被记住
  nextExtraction = '{"add":["用户的 API key 是 sk-abcdefghijklmnopqrst"],"update":[],"remove":[]}'
  before = await send('帮我记一下 sk-abcdefghijklmnopqrst', '第 2 条回复。')
  assert.equal(chats[1].system, system1)
  assert(!chats[1].system.includes('用户叫小林'))
  await waitExtraction(before + 1)
  await page.waitForTimeout(300)
  assert.equal((await stored('chat-demo:memory')).items.length, 2)

  // 更新与删除按序号对应快照
  nextExtraction =
    '{"add":[],"update":[{"index":2,"text":"用户叫小林，是一名 ICU 护士"}],"remove":[1]}'
  before = await send('我其实在 ICU，另外忘掉我喜欢简洁回答这件事', '第 3 条回复。')
  await waitExtraction(before + 1)
  await toast('已更新记忆')
  memory = await stored('chat-demo:memory')
  assert.deepEqual(
    memory.items.map((item) => item.text),
    ['用户叫小林，是一名 ICU 护士']
  )

  // 模型返回无效内容：不提示、不报错、不改动
  nextExtraction = '抱歉，我无法处理'
  before = await send('今天天气怎么样', '第 4 条回复。')
  // 已删除的记忆立即停用，会话中途改写的记忆仍留到下一个对话
  assert(!chats[3].system.includes('## 关于用户的记忆'))
  assert(chats[3].system.includes('## 用户提供的背景信息'))
  await waitExtraction(before + 1)
  assert.deepEqual(
    (await stored('chat-demo:memory')).items.map((item) => item.text),
    ['用户叫小林，是一名 ICU 护士']
  )
  // 太短的消息不触发提炼；新对话使用最新的记忆
  await page.evaluate(() => window.mockWindowAction('new-chat'))
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  before = await send('嗯', '第 5 条回复。')
  assert(chats[4].system.includes('## 关于用户的记忆\n'))
  assert(chats[4].system.includes('- 用户叫小林，是一名 ICU 护士'))
  assert(!chats[4].system.includes('用户喜欢简洁的回答'))
  await page.waitForTimeout(500)
  assert.equal(extractions.length, before)

  // ---------- 记忆管理：编辑、整理与撤销、删除、清空 ----------
  await openPersonal()
  await settings.getByRole('textbox', { name: '手动添加一条记忆' }).fill('用户正在学日语')
  await settings.getByRole('button', { name: '添加', exact: true }).click()
  await settings.getByRole('textbox', { name: '手动添加一条记忆' }).fill('用户在学习日语')
  await settings.getByRole('button', { name: '添加', exact: true }).click()
  await settings.getByText('已保存的记忆（3）').waitFor()
  // 列表最新在上，编辑第一条
  await settings.getByRole('button', { name: '编辑记忆' }).first().click()
  const edit = settings.getByRole('textbox', { name: '编辑记忆' })
  await edit.fill('用户在学习日语，目标 N2')
  await edit.press('Escape')
  assert(await settings.isVisible())
  await settings.getByText('用户在学习日语', { exact: true }).waitFor()
  await settings.getByRole('button', { name: '编辑记忆' }).first().click()
  await settings.getByRole('textbox', { name: '编辑记忆' }).fill('用户在学习日语，目标 N2')
  await settings.getByRole('button', { name: '保存', exact: true }).last().click()
  await settings.getByText('用户在学习日语，目标 N2', { exact: true }).waitFor()

  nextConsolidation = '{"memories":["用户叫小林，是一名 ICU 护士","用户在学习日语，目标 N2"]}'
  await settings.getByRole('button', { name: '整理', exact: true }).click()
  await toast('已整理为 2 条记忆')
  assert(consolidations.at(-1).messages[0].content.includes('3. 用户在学习日语，目标 N2'))
  memory = await stored('chat-demo:memory')
  assert.deepEqual(
    memory.items.map((item) => item.text),
    ['用户叫小林，是一名 ICU 护士', '用户在学习日语，目标 N2']
  )
  if (shots) await page.screenshot({ path: join(shots, '2-memory-organized.png') })
  await settings.getByRole('button', { name: '撤销整理', exact: true }).click()
  await toast('已恢复整理前的记忆')
  assert.equal((await stored('chat-demo:memory')).items.length, 3)
  nextConsolidation = 'not json'
  await settings.getByRole('button', { name: '整理', exact: true }).click()
  await toast('整理失败，原有记忆未改动')
  assert.equal((await stored('chat-demo:memory')).items.length, 3)

  await settings.getByRole('button', { name: '删除记忆' }).first().click()
  await settings.getByText('已保存的记忆（2）').waitFor()

  // ---------- 开关：关闭指令和记忆后不再发送、不再提炼 ----------
  await settings.getByRole('switch', { name: '用于所有对话' }).uncheck()
  await settings.getByRole('switch', { name: '参考记忆' }).uncheck()
  assert(await settings.getByRole('switch', { name: '自动记住新信息' }).isDisabled())
  await closeSettings()
  before = await send('再聊一句，我最近在学日语', '第 6 条回复。')
  assert(chats.at(-1).system.startsWith('该助手为DeepSeek，由深度求索公司创造。'))
  assert(!chats.at(-1).system.includes('## 用户提供的背景信息'))
  assert(!chats.at(-1).system.includes('## 用户希望的回复方式'))
  assert(!chats.at(-1).system.includes('## 关于用户的记忆'))
  await page.waitForTimeout(500)
  assert.equal(extractions.length, before)

  // 重新打开后开关和内容都还在；清空需要确认
  await page.reload()
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  await openPersonal()
  assert(!(await settings.getByRole('switch', { name: '用于所有对话' }).isChecked()))
  assert(!(await settings.getByRole('switch', { name: '参考记忆' }).isChecked()))
  assert.equal(
    await settings.getByLabel('希望 DeepSeek 了解你的哪些背景？').inputValue(),
    '我在杭州做嵌入式开发。'
  )
  await settings.getByRole('switch', { name: '参考记忆' }).check()
  await settings.getByRole('button', { name: '清空', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '清空所有记忆？' })
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await stored('chat-demo:memory')).items.length, 2)
  await settings.getByRole('button', { name: '清空', exact: true }).click()
  await confirm.getByRole('button', { name: '清空', exact: true }).click()
  await toast('记忆已清空')
  await settings
    .getByText('还没有记忆。在对话中告诉 DeepSeek「记住……」，或在上面手动添加。')
    .waitFor()
  assert.deepEqual((await stored('chat-demo:memory')).items, [])
  if (shots) await page.screenshot({ path: join(shots, '3-memory-empty.png') })
  assert.deepEqual(errors, [])
  console.log(
    `personalization regression: OK (${chats.length} chats, ${extractions.length} extractions, ${consolidations.length} consolidations)`
  )
} finally {
  await browser.close()
}
