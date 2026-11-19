// 为 README 生成截图：加载鸿蒙版网页资源，接口与设备消息通道使用模拟数据。
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const root = repoRoot
// 悬浮窗、上下分屏、平板三分之一分屏、中等横向小窗和很矮的窗口
const out = process.argv[2] ?? tmpdir()
const sizes = process.argv[3]
  ? JSON.parse(process.argv[3])
  : [
      [320, 568],
      [360, 420],
      [400, 800],
      [700, 500],
      [480, 320],
    ]
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
  for (const [width, height] of sizes) {
    const { context, page } = await open({
      width,
      height,
      scale: 1,
      storage: quietMemory,
      mobile: width < 600,
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, `w${width}x${height}-welcome.png`) })
    await page.getByRole('button', { name: '深度思考' }).click()
    await send(page, '用 TypeScript 写一个防抖函数，并解释原理', '适合的场景')
    const overflow = await page.evaluate(() => {
      const issues = []
      const vw = innerWidth,
        vh = innerHeight
      for (const el of document.querySelectorAll('button, textarea, [role=menuitem]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue
        if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1)
          issues.push(
            `${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12)} @${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`
          )
      }
      return { pageScrollW: document.documentElement.scrollWidth - vw, issues }
    })
    console.log(width, height, JSON.stringify(overflow))
    await page.screenshot({ path: join(out, `w${width}x${height}-chat.png`) })
    await context.close()
  }
  // Pura X Max 展开时的桌面式设置不能因位置说明过宽而横向滚动。
  for (const width of [768, 942]) {
    const { context, page } = await open({
      width,
      height: 680,
      scale: 1,
      storage: { ...quietMemory, 'chat-demo:sider-collapsed': 'true' },
      mobile: true,
    })
    const welcome = page.getByText('今天想聊什么？', { exact: true })
    await page.evaluate(() =>
      window.devicePost({
        type: 'window-layout',
        insets: { top: 42, right: 0, bottom: 16, left: 0 },
        nativeHeader: false,
      })
    )
    const bounds = await welcome.boundingBox()
    assert(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 1, '欢迎信息应以窗口为中心')
    await page.getByRole('button', { name: '打开边栏' }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    for (const name of ['通用设置', '个性化', '数据管理']) {
      await dialog.getByRole('tab', { name, exact: true }).click()
      const panel = dialog.getByRole('tabpanel')
      const metrics = await panel.evaluate((node) => {
        const width = node.clientWidth
        const scrollWidth = node.scrollWidth
        node.scrollLeft = 100
        node.scrollTop = 100
        return { overflow: scrollWidth - width, x: node.scrollLeft, y: node.scrollTop }
      })
      assert.equal(metrics.overflow, 0, `${width}px 下的${name}应完整显示`)
      assert.equal(metrics.x, 0)
      if (name === '通用设置') assert(metrics.y > 0, '设置仍能纵向滚动')
    }
    await context.close()
  }
  console.log('window sizes: OK')
} finally {
  await browser.close()
}
