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

const open = async ({
  width,
  height,
  scale,
  storage = {},
  mobile = true,
  colorScheme = 'light',
}) => {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme,
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
  // 折叠屏外屏和内屏设置可独立滚动，二级页的返回区与控件分开。
  for (const [width, height] of [
    [360, 600],
    [768, 680],
    [942, 680],
  ]) {
    const { context, page } = await open({
      width,
      height,
      scale: 1,
      storage: { ...quietMemory, 'chat-demo:sider-collapsed': 'true' },
      mobile: true,
      colorScheme: width < 768 ? 'dark' : 'light',
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
    const panel = dialog.getByRole('tabpanel')
    // 在首帧检查动效，避免设备或测试执行速度影响取样。
    const pausedMotion = await page.addStyleTag({
      content: '[role="tabpanel"], [role="tabpanel"] * { animation-play-state: paused !important }',
    })
    const assertMotion = async (selector, offset) => {
      const motion = await panel.evaluate(
        (node, targetSelector) => ({
          opacity: Number(getComputedStyle(node).opacity),
          transform: getComputedStyle(node).transform,
          offset: new DOMMatrix(getComputedStyle(node.querySelector(targetSelector)).transform).m41,
        }),
        selector
      )
      assert(motion.opacity > 0 && motion.opacity < 1, '设置页面应有淡入动效')
      assert.equal(motion.transform, 'none', '控件位置应保持稳定')
      assert.equal(Math.sign(motion.offset), Math.sign(offset), '进出动效的方向应相反')
    }
    const assertPanel = async (name) => {
      const metrics = await panel.evaluate((node) => {
        const scroll =
          [...node.children].find((child) => getComputedStyle(child).overflowY === 'auto') ?? node
        const header = node.querySelector('header')
        const headerBeforeScroll = header?.getBoundingClientRect().top
        scroll.scrollLeft = 100
        scroll.scrollTop = 100
        return {
          overflow: scroll.scrollWidth - scroll.clientWidth,
          x: scroll.scrollLeft,
          y: scroll.scrollTop,
          headerBeforeScroll,
          headerTop: header?.getBoundingClientRect().top,
          headerBottom: header?.getBoundingClientRect().bottom,
          scrollTopEdge: scroll.getBoundingClientRect().top,
        }
      })
      assert.equal(metrics.overflow, 0, `${width}px 下的${name}应完整显示`)
      assert.equal(metrics.x, 0)
      if (metrics.headerBottom !== undefined) {
        assert.equal(
          metrics.headerTop,
          metrics.headerBeforeScroll,
          `${width}px 下返回栏滚动后应保持原位`
        )
        assert(
          metrics.headerBottom <= metrics.scrollTopEdge + 1,
          `${width}px 下返回栏不能覆盖可滚动区域`
        )
      }
      if (name === '对话') assert(metrics.y > 0, '对话二级页仍能纵向滚动')
    }
    await assertPanel('通用设置')
    for (const name of ['外观', '对话', '语音']) {
      const entry = dialog.getByRole('button', { name, exact: true })
      await entry.click()
      await assertMotion('header h2', 1)
      await assertPanel(name)
      if (width < 768 && name === '对话') {
        const toggle = dialog.getByRole('switch', { name: '猜你想问' })
        await toggle.check()
        assert(await toggle.isChecked())
        await toggle.uncheck()
      }
      await dialog.getByRole('button', { name: '返回通用设置' }).click()
      await assertMotion('[data-settings-page] svg', -1)
      assert(await entry.evaluate((button) => button === document.activeElement))
    }
    await pausedMotion.evaluate((style) => style.remove())
    if (width < 768) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await dialog.getByRole('button', { name: '对话', exact: true }).click()
      assert.equal(await panel.evaluate((node) => node.getAnimations({ subtree: true }).length), 0)
      await dialog.getByRole('button', { name: '返回通用设置' }).click()
      assert.equal(await panel.evaluate((node) => node.getAnimations({ subtree: true }).length), 0)
    }
    const tablist = dialog.getByRole('tablist')
    // 在选中状态提交时记录底色，避免点击后的等待掩盖残留。
    await tablist.evaluate((list) => {
      const tabs = [...list.querySelectorAll('[role=tab]')]
      const selected = tabs.find((tab) => tab.ariaSelected === 'true')
      const selectedColor = getComputedStyle(selected).backgroundColor
      window.settingsTabChanges = []
      new MutationObserver(() => {
        const active = tabs.filter((tab) => tab.ariaSelected === 'true')
        const [current] = active
        const panel = document.getElementById(current?.getAttribute('aria-controls'))
        window.settingsTabChanges.push({
          names: active.map((tab) => tab.textContent.trim()),
          panelMatches: panel && panel.getAttribute('aria-labelledby') === current.id,
          panelText: panel?.textContent,
          tabStopsMatch: tabs.every((tab) => tab.tabIndex === (tab === current ? 0 : -1)),
          selectedColor,
          currentColor: current && getComputedStyle(current).backgroundColor,
          inactiveColors: tabs
            .filter((tab) => tab !== current)
            .map((tab) => getComputedStyle(tab).backgroundColor),
        })
      }).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] })
    })
    const tabVisits = [
      ['个性化', '自定义指令'],
      ['数据管理', 'API Key'],
      ['隐私', '位置信息'],
      ['通用设置', '语言'],
    ]
    // 从二级页进入其它页签，再连续点按四个页签。
    await dialog.getByRole('button', { name: '外观', exact: true }).tap()
    for (const [name] of tabVisits) {
      await tablist.getByRole('tab', { name, exact: true }).tap()
      await assertPanel(name)
    }
    // 触摸停在「通用设置」时用方向键切换，旧页签也应立即清除底色。
    const generalTab = tablist.getByRole('tab', { name: '通用设置' })
    await generalTab.press(width < 768 ? 'ArrowRight' : 'ArrowDown')
    assert(
      await tablist
        .getByRole('tab', { name: '个性化' })
        .evaluate((tab) => tab === document.activeElement)
    )
    const changes = await page.evaluate(() => window.settingsTabChanges)
    const expected = [...tabVisits, tabVisits[0]]
    assert.equal(changes.length, expected.length)
    for (const [index, [name, content]] of expected.entries()) {
      const change = changes[index]
      assert.deepEqual(change.names, [name])
      assert(change.panelMatches && change.panelText.includes(content), `${name}应立即显示对应面板`)
      assert(change.tabStopsMatch, `${name}应成为唯一的 Tab 键停靠点`)
      assert.notEqual(change.selectedColor, 'rgba(0, 0, 0, 0)')
      assert.deepEqual(
        change.inactiveColors,
        Array(3).fill('rgba(0, 0, 0, 0)'),
        `${name}切换后旧页签底色应立即清除`
      )
      assert.equal(change.currentColor, change.selectedColor, `${name}应立即显示选中底色`)
    }
    await context.close()
  }
  console.log('window sizes: OK')
} finally {
  await browser.close()
}
