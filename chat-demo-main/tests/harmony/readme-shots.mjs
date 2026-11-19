// 为 README 生成截图：加载鸿蒙版网页资源，接口与设备消息通道使用模拟数据。
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
// 默认输出到 README 使用的截图目录
const out = process.argv[2] ?? join(repoRoot, 'assets/images/screenshots')
await mkdir(out, { recursive: true })
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

const answers = [
  {
    title: 'TypeScript 防抖函数',
    thinking:
      '用户想要一个类型安全的防抖函数。需要保留参数类型，用泛型约束函数签名；再说明定时器在连续触发时如何被重置，以及适合的使用场景。',
    text: `下面是一个保留参数类型的防抖函数：

\`\`\`ts
export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}
\`\`\`

**原理**：每次调用都会清掉上一次的定时器，只有停止触发超过 \`wait\` 毫秒后才真正执行。

适合的场景：

- 搜索框输入联想
- 窗口尺寸变化后重新布局
- 表单自动保存`,
  },
  {
    title: '周末杭州一日游路线',
    thinking: '',
    text: '上午西湖断桥、白堤骑行，中午去河坊街，下午灵隐寺，傍晚回到湖滨看音乐喷泉。',
  },
  { title: '护理交接班要点', thinking: '', text: '按 SBAR 结构交接：现状、背景、评估、建议。' },
]

const pickAnswer = (body) => {
  const text = JSON.stringify(body.messages.at(-1)?.content ?? '')
  return text.includes('杭州') ? answers[1] : text.includes('护理') ? answers[2] : answers[0]
}

const sse = (answer, index) => {
  const frames = [{ type: 'message_start', message: { id: `mock-${index}`, content: [] } }]
  let block = 0
  if (answer.thinking) {
    frames.push(
      {
        type: 'content_block_start',
        index: block,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      {
        type: 'content_block_delta',
        index: block,
        delta: { type: 'thinking_delta', thinking: answer.thinking },
      },
      {
        type: 'content_block_delta',
        index: block,
        delta: { type: 'signature_delta', signature: 'sig' },
      },
      { type: 'content_block_stop', index: block }
    )
    block++
  }
  frames.push(
    { type: 'content_block_start', index: block, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: block, delta: { type: 'text_delta', text: answer.text } },
    { type: 'content_block_stop', index: block },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', title: answer.title } },
    { type: 'message_stop' }
  )
  return frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join('')
}

const browser = await chromium.launch(launchOptions)

const open = async ({ width, height, scale, storage = {}, mobile = true }) => {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
  })
  await context.addInitScript((storage) => {
    if (!sessionStorage.getItem('seeded')) {
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
      sessionStorage.setItem('seeded', '1')
    }
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (message) => port1.postMessage(JSON.stringify(message))
        window.devicePost = post
        window.mockWindowAction = (action) => post({ type: 'window-action', action })
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
          if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
          if (operation === 'voice' && value === 'start') post({ id, status: 0, value: '' })
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({ type: 'device-features', voice: true, scan: true, save: true })
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
  let sent = 0
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
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: sse(pickAnswer(request.postDataJSON()), sent++),
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.goto(origin + '/index.html')
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  return { context, page }
}

const send = async (page, text, waitFor) => {
  await page.locator('textarea').fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText(waitFor).first().waitFor()
  await page.waitForTimeout(500)
}

const quietMemory = {
  'chat-demo:memory': JSON.stringify({ enabled: true, auto: false, items: [] }),
}

try {
  // 手机：欢迎页
  {
    const { context, page } = await open({
      width: 390,
      height: 844,
      scale: 2,
      storage: quietMemory,
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(out, 'phone-welcome.png') })

    // 按住说话：按住时实时显示识别文字，截图后上滑取消
    await page.getByRole('button', { name: '切换到按住说话', exact: true }).click()
    const speak = await page.getByRole('button', { name: '按住说话', exact: true }).boundingBox()
    const point = { x: speak.x + speak.width / 2, y: speak.y + speak.height / 2 }
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.evaluate(() =>
      window.devicePost({
        type: 'voice',
        event: 'result',
        text: '帮我把明天上午的会议要点整理成清单',
        final: false,
        last: false,
      })
    )
    await page.getByText('帮我把明天上午的会议要点整理成清单').waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, 'phone-voice.png') })
    await page.mouse.move(point.x, point.y - 90, { steps: 4 })
    await page.mouse.up()
    await page.getByRole('button', { name: '切换到键盘', exact: true }).click()
    await page.locator('textarea').fill('')

    // 识别图片文字菜单
    await page.getByRole('button', { name: '识别图片文字', exact: true }).click()
    await page.getByRole('menuitem', { name: '拍照识字' }).waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, 'phone-scan.png') })
    await page.keyboard.press('Escape')
    await page.mouse.click(195, 300)

    // 对话：深度思考 + Markdown 代码
    await page.getByRole('button', { name: '深度思考' }).click()
    await send(page, '用 TypeScript 写一个防抖函数，并解释原理', '适合的场景')
    // 回到对话开头，露出提问和「已思考」
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('*')) {
        const style = getComputedStyle(element)
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
          element.scrollTop = 0
        }
      }
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(out, 'phone-chat.png') })
    await context.close()
  }

  // 手机：个性化设置
  {
    const now = Date.now()
    const { context, page } = await open({
      width: 390,
      height: 844,
      scale: 2,
      storage: {
        'chat-demo:custom-instructions': JSON.stringify({
          aboutUser: '我是一名前端工程师，常用 TypeScript 和 ArkTS。',
          responseStyle: '先给结论再展开，代码注释用中文。',
          enabled: true,
        }),
        'chat-demo:memory': JSON.stringify({
          enabled: true,
          auto: true,
          items: [
            {
              id: 'm1',
              text: '用户在开发鸿蒙应用',
              source: 'auto',
              createdAt: now - 86400000,
              updatedAt: now - 86400000,
            },
            {
              id: 'm2',
              text: '用户周末喜欢去杭州周边徒步',
              source: 'auto',
              createdAt: now - 3600000,
              updatedAt: now - 3600000,
            },
            {
              id: 'm3',
              text: '用户希望回答尽量简洁',
              source: 'manual',
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      },
    })
    await page.evaluate(() => window.mockWindowAction('sidebar'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('tab', { name: '个性化' }).click()
    await settings.getByText('已保存的记忆（3）').waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(out, 'phone-personalization.png') })
    await settings.getByText('已保存的记忆（3）').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, 'phone-memory.png') })
    await context.close()
  }

  // 平板：深色主题，宽屏常驻侧栏
  {
    const { context, page } = await open({
      width: 1280,
      height: 800,
      scale: 1.5,
      mobile: false,
      storage: {
        ...quietMemory,
        'chat-demo:theme-preference': 'dark',
        'chat-demo:sider-collapsed': 'false',
      },
    })
    await send(page, '护理交接班有哪些要点？', 'SBAR')
    await page.getByRole('button', { name: '新对话' }).first().click()
    await send(page, '周末在杭州怎么安排一日游？', '音乐喷泉')
    await page.getByRole('button', { name: '新对话' }).first().click()
    await page.getByRole('button', { name: '深度思考' }).click()
    await send(page, '用 TypeScript 写一个防抖函数，并解释原理', '适合的场景')
    await page.screenshot({ path: join(out, 'tablet-dark.png') })
    await context.close()
  }
  console.log('readme shots: OK')
} finally {
  await browser.close()
}
