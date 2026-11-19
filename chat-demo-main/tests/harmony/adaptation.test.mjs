// 1.3.0 回归：顶栏对齐、安全区、返回手势、字体缩放、快捷键与右键、无痕对话、后台完成通知。
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

const chats = []
const extractions = []
let hold = null
const sse = (text, title, stopReason = 'end_turn') =>
  [
    { type: 'message_start', message: { id: 'mock', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason, title } },
    { type: 'message_stop' },
  ]
    .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
    .join('')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })

const open = async ({
  width = 390,
  height = 844,
  mobile = true,
  features = {},
  storage = {},
  insets = { top: 31, right: 0, bottom: 18, left: 0 },
  refuseReply = false,
} = {}) => {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
  })
  await context.addInitScript(
    ({ features, storage, insets }) => {
      if (!sessionStorage.getItem('seeded')) {
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
        sessionStorage.setItem('seeded', '1')
      }
      window.deviceLog = []
      window.notifyStatus = 0
      window.addEventListener(
        'load',
        () => {
          const { port1, port2 } = new MessageChannel()
          const post = (message) => port1.postMessage(JSON.stringify(message))
          window.devicePost = post
          window.uiLog = []
          port1.onmessage = (event) => {
            const { id, operation, value } = JSON.parse(event.data)
            if (operation === 'window-ui') {
              window.lastWindowUi = JSON.parse(value)
              window.uiLog.push(window.lastWindowUi)
              post({
                type: 'window-layout',
                insets,
                nativeHeader: window.lastWindowUi.mobile && !window.lastWindowUi.covered,
              })
              return
            }
            window.deviceLog.push({ operation, value })
            if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
            if (operation === 'voice' && value === 'start') post({ id, status: 0, value: '' })
            if (operation === 'notify-permission')
              post({ id, status: window.notifyStatus, value: '' })
          }
          window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
          post({
            type: 'device-features',
            voice: true,
            scan: true,
            save: true,
            deviceType: 'phone',
            ...features,
          })
        },
        { once: true }
      )
    },
    { features, storage, insets }
  )
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
    const body = request.postDataJSON()
    if (body.system.startsWith('你负责维护用户的长期记忆')) {
      extractions.push(body)
      return route.fulfill({
        headers,
        contentType: 'text/event-stream',
        body: sse('{"add":[],"update":[],"remove":[]}'),
      })
    }
    chats.push(body)
    if (hold) await hold.promise
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: refuseReply
        ? sse('待审核的示例正文', undefined, 'refusal')
        : sse(`第 ${chats.length} 条：**加粗**和 \`code\`\n\n- 列表`, `测试会话 ${chats.length}`),
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('Content Security Policy')) errors.push(m.text())
  })
  await page.goto(origin + '/index.html')
  await page
    .getByText(/今天想聊什么|无痕对话/)
    .first()
    .waitFor()
  return { context, page, errors }
}

const back = (page) =>
  page.evaluate(() => window.devicePost({ type: 'window-action', action: 'back' }))
const canGoBack = (page) => page.evaluate(() => window.lastWindowUi.canGoBack)
const toast = (page, text) => page.getByText(text, { exact: true }).waitFor()
const send = async (page, text, reply) => {
  await page.locator('textarea:visible').first().fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText(reply).first().waitFor()
}
const waitFor = async (page, predicate, label) => {
  for (let i = 0; i < 60; i++) {
    if (await predicate()) return
    await page.waitForTimeout(100)
  }
  assert.fail(`timeout: ${label}`)
}

try {
  // ---------- 手机：顶栏对齐、返回手势、字体缩放、安全区 ----------
  {
    const { context, page, errors } = await open({
      storage: {
        'chat-demo:memory': JSON.stringify({
          enabled: true,
          auto: true,
          items: [{ id: 'm1', text: '用户是护士', source: 'manual', createdAt: 1, updatedAt: 1 }],
        }),
        'chat-demo:custom-instructions': JSON.stringify({
          aboutUser: '我在杭州',
          responseStyle: '',
          enabled: true,
        }),
      },
    })

    // 网页顶栏与原生 ChatHeader 一致：标题起点 10+44+8，15px Medium，三条横线图标
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.waitForFunction(() => window.lastWindowUi.covered)
    const header = await page.evaluate(() => {
      const title = [...document.querySelectorAll('[class^="title-"]')].find(
        (el) => el.textContent === 'Deepseek GO' && el.closest('[class^="header-"]')
      )
      const style = getComputedStyle(title)
      const main = document.querySelector('main').getBoundingClientRect()
      return {
        left: title.getBoundingClientRect().left - main.left,
        size: style.fontSize,
        weight: style.fontWeight,
        paths: title.parentElement.querySelector('button svg').querySelectorAll('path').length,
        d: title.parentElement.querySelector('button svg path').getAttribute('d'),
      }
    })
    assert.equal(header.left, 62)
    assert.equal(header.size, '15px')
    assert.equal(header.weight, '500')
    assert.match(header.d, /M3.5 5.5H18.5M3.5 11H18.5M3.5 16.5H18.5/)

    // 返回：抽屉 → 设置 → 返回关设置 → 返回关抽屉 → 无可关层
    assert.equal(await canGoBack(page), true)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.waitFor()
    // 设置里打开下拉，返回先关下拉
    await settings
      .getByRole('button', { name: '语言' })
      .click()
      .catch(() => {})
    await back(page)
    await page.waitForTimeout(300)
    if (await settings.isVisible()) {
      await back(page)
    }
    await settings.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelector('main').inert === true)
    await back(page)
    await page.waitForFunction(() => document.querySelector('main').inert === false)
    await page.waitForFunction(() => window.lastWindowUi.canGoBack === false)

    // 字体缩放：1.5 倍
    await page.evaluate(() => window.devicePost({ type: 'font-scale', scale: 1.5 }))
    await page.waitForFunction(
      () => document.body.style.getPropertyValue('--app-font-scale') === '1.5'
    )
    assert.equal(
      await page.locator('textarea').evaluate((el) => getComputedStyle(el).fontSize),
      '24px'
    )

    // 发送：系统提示词含指令和记忆；完成通知；generating 状态
    hold = Promise.withResolvers()
    await page.locator('textarea').fill('你好，我想聊聊排班')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.waitForFunction(() => window.lastWindowUi.generating === true)
    // 首次生成时请求一次通知授权
    await page.waitForFunction(() =>
      window.deviceLog.some((e) => e.operation === 'notify-permission')
    )
    hold.resolve()
    hold = null
    await page.getByText('第 1 条').first().waitFor()
    await page.waitForFunction(() => window.lastWindowUi.generating === false)
    assert(chats[0].system.includes('我在杭州') && chats[0].system.includes('- 用户是护士'))
    assert.equal(Object.hasOwn(chats[0], 'safety_check'), false)
    await page.waitForFunction(() => window.deviceLog.some((e) => e.operation === 'reply-done'))
    const done = JSON.parse(
      (await page.evaluate(() => window.deviceLog.find((e) => e.operation === 'reply-done'))).value
    )
    assert.equal(done.title, '测试会话 1')
    assert.equal(done.text, '第 1 条： 加粗 和 code 列表')
    const savedId = done.sessionId
    const md = await page
      .locator('[class*="markdown"] p')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)
    assert.equal(md, '24px')
    const bubble = await page
      .getByText('你好，我想聊聊排班')
      .evaluate((el) => getComputedStyle(el).fontSize)
    assert.equal(bubble, '24px')
    await waitFor(page, async () => extractions.length === 1, 'memory extraction for saved chat')
    assert.deepEqual(extractions[0].safety_check, { level: 'high' })

    // 消息编辑：返回取消编辑
    await page.getByText('你好，我想聊聊排班').hover()
    await page
      .getByRole('button', { name: /编辑/ })
      .first()
      .click()
    await page.waitForFunction(() => window.lastWindowUi.canGoBack === true)
    await back(page)
    await page.waitForFunction(() => window.lastWindowUi.canGoBack === false)

    // 键盘弹起时视口偏移，顶部安全区保持完整
    await page.locator('textarea').focus()
    await page.evaluate(() => {
      Object.defineProperties(window.visualViewport, {
        height: { configurable: true, value: 520 },
        offsetTop: { configurable: true, value: 40 },
      })
      window.visualViewport.dispatchEvent(new Event('resize'))
    })
    await page.waitForTimeout(200)
    assert.equal(
      await page.locator('[class^="frame-"]').evaluate((el) => getComputedStyle(el).paddingTop),
      '31px'
    )
    await page.evaluate(() => {
      delete window.visualViewport.height
      delete window.visualViewport.offsetTop
      window.visualViewport.dispatchEvent(new Event('resize'))
    })
    await page.locator('textarea').blur()

    // ---------- 无痕对话 ----------
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'new-chat' }))
    await page.getByText('今天想聊什么？', { exact: true }).waitFor()
    await page.getByRole('button', { name: '无痕对话', exact: true }).click()
    await page.getByText('本对话不保存记录，也不使用或更新记忆。').waitFor()
    if (shots) await page.screenshot({ path: join(shots, 'incognito-welcome.png') })
    const extractionsBefore = extractions.length
    await send(page, '这是一个秘密问题', '第 2 条')
    assert(chats[1].system.includes('我在杭州'), 'instructions still apply')
    assert(!chats[1].system.includes('用户是护士'), 'memory not sent in incognito')
    await page.getByText('本对话不会保存记录，也不会使用或更新记忆').waitFor()
    await page.waitForFunction(() => window.lastWindowUi.title === '无痕对话')
    if (shots) await page.screenshot({ path: join(shots, 'incognito-chat.png') })
    const doneIncognito = JSON.parse(
      (
        await page.evaluate(() =>
          window.deviceLog.filter((e) => e.operation === 'reply-done').at(-1)
        )
      ).value
    )
    assert.equal(doneIncognito.title, '无痕对话')
    assert.equal(doneIncognito.text, '回答已生成完成')
    await page.waitForTimeout(600)
    assert.equal(extractions.length, extractionsBefore, 'no memory extraction in incognito')
    // 侧栏没有无痕会话
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByText('测试会话 1').waitFor()
    assert.equal(await page.getByText('测试会话 2').count(), 0)
    // 选已保存的会话：退出无痕，无痕内容被丢弃
    await page.getByText('测试会话 1').click()
    await page.getByText('第 1 条').first().waitFor()
    assert.equal(
      await page.evaluate(() => document.body.innerText.includes('这是一个秘密问题')),
      false
    )
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'new-chat' }))
    await page.getByText('今天想聊什么？', { exact: true }).waitFor()
    assert.equal(
      await page
        .getByRole('button', { name: '无痕对话', exact: true })
        .getAttribute('aria-pressed'),
      'false'
    )

    // 通知点击：打开对应会话
    await page.evaluate(
      (id) => window.devicePost({ type: 'window-action', action: 'open-session', value: id }),
      savedId
    )
    await page.getByText('第 1 条').first().waitFor()

    // 关闭通知开关后不再上报
    const doneCount = await page.evaluate(
      () => window.deviceLog.filter((e) => e.operation === 'reply-done').length
    )
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const notify = settings.getByRole('switch', { name: '回答完成通知' })
    assert(await notify.isChecked())
    await notify.uncheck()
    await page.evaluate(() => {
      window.notifyStatus = 2
    })
    await notify.check()
    await toast(page, '通知未开启，请在系统设置中允许 Deepseek GO 发送通知')
    await notify.uncheck()
    await back(page)
    await settings.waitFor({ state: 'detached' })
    await back(page)
    await page.waitForFunction(() => window.lastWindowUi.canGoBack === false)
    await send(page, '再问一句', '第 3 条')
    await page.waitForTimeout(400)
    assert.equal(
      await page.evaluate(
        () => window.deviceLog.filter((e) => e.operation === 'reply-done').length
      ),
      doneCount
    )
    // 重新加载后无痕会话不存在，已保存会话还在
    await page.reload()
    await page.getByText('今天想聊什么？', { exact: true }).waitFor()
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByText('测试会话 1').waitFor()
    assert.equal(
      await page.evaluate(() => document.body.innerText.includes('这是一个秘密问题')),
      false
    )
    // 语音收音：返回取消
    await page.mouse.click(360, 400)
    await page.waitForFunction(() => document.querySelector('main').inert === false)
    // 1.4.2 起为按住说话：按住收音时执行返回手势，只取消收音
    await page.getByRole('button', { name: '切换到按住说话', exact: true }).click()
    const speak = await page.getByRole('button', { name: '按住说话', exact: true }).boundingBox()
    await page.mouse.move(speak.x + speak.width / 2, speak.y + speak.height / 2)
    await page.mouse.down()
    await page.waitForFunction(() =>
      window.deviceLog.some((e) => e.operation === 'voice' && e.value === 'start')
    )
    await page.waitForFunction(() => window.lastWindowUi.canGoBack === true)
    await back(page)
    await page.waitForFunction(() =>
      window.deviceLog.some((e) => e.operation === 'voice' && e.value === 'cancel')
    )
    await page.mouse.up()
    await page.getByRole('button', { name: '按住说话', exact: true }).waitFor()
    assert.equal(await page.locator('textarea').inputValue(), '')
    assert.deepEqual(errors, [])
    await context.close()
  }

  // ---------- 2in1：快捷键、提示、右键菜单 ----------
  {
    const { context, page, errors } = await open({
      width: 1280,
      height: 800,
      mobile: false,
      features: { deviceType: '2in1' },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    await send(page, '桌面端测试', '第 ')
    const collapse = page.getByRole('button', { name: '收起边栏（Ctrl+B）' })
    await collapse.waitFor()
    await page.keyboard.press('Control+b')
    await page.getByRole('button', { name: '打开边栏（Ctrl+B）' }).waitFor()
    await page.keyboard.press('Control+b')
    await collapse.waitFor()
    await page.keyboard.press('Control+n')
    await page.getByText('今天想聊什么？', { exact: true }).waitFor()
    await page.keyboard.press('Control+,')
    await page.getByRole('dialog', { name: '设置' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: '设置' }).waitFor({ state: 'detached' })
    // 右键会话打开菜单
    const item = page
      .locator('[class*="item-"]')
      .filter({ hasText: /测试会话/ })
      .first()
    await item.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '重命名' }).waitFor()
    if (shots) await page.screenshot({ path: join(shots, 'desktop-context-menu.png') })
    await back(page)
    await page.getByRole('menuitem', { name: '重命名' }).waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    await context.close()
  }

  // 非 2in1 不显示快捷键提示
  {
    const { context, page } = await open({
      width: 1280,
      height: 800,
      mobile: false,
      features: { deviceType: 'tablet' },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    await page.getByRole('button', { name: '收起边栏', exact: true }).waitFor()
    await context.close()
  }

  // 无痕联网请求使用服务端默认检查，仍处理流式响应结尾的拒答。
  {
    const { context, page, errors } = await open({ refuseReply: true })
    await page.getByRole('button', { name: '无痕对话', exact: true }).click()
    await page.getByRole('button', { name: '智能搜索', exact: true }).click()
    await send(page, '测试一条联网请求', '这个问题我暂时答不上来，换个话题吧。')
    const request = chats.at(-1)
    assert.equal(Object.hasOwn(request, 'safety_check'), false)
    assert.deepEqual(
      request.tools.map(({ type }) => type),
      ['deepseek_read_url', 'deepseek_web_search']
    )
    assert.equal(await page.getByText('待审核的示例正文', { exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log(`1.3 regression: OK (${chats.length} chats, ${extractions.length} extractions)`)
} finally {
  await browser.close()
}
