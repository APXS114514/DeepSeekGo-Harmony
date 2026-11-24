// 定位、本地信息查询与自动图表端到端回归：
// 1. 按需模糊定位开关、权限拒绝/定位关闭/成功授权、仅发送城市和行政区、非本地或指定城市不触发定位、失败回退手动地区；
// 2. 结构化逐日天气查询（Open-Meteo）与失败时回退智能搜索、当地活动/营业时间自动联网查询、总开关关闭；
// 3. 折线/柱状/饼图渲染、摘要指标/统计口径/来源链接、点按与键盘查看数值、图表/数据表/代码切换、Mermaid 共存、纯文本分享转换、320px 深色无溢出。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const media = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
}

const sse = (text, title = '本地信息测试') =>
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

const WEATHER_CHART_REPLY = [
  '以下是杭州未来 5 天天气预报与气温趋势（来源：Open-Meteo）。',
  '',
  '```chart',
  JSON.stringify({
    type: 'line',
    title: '杭州未来 5 天气温走势',
    subtitle: '每日最高温与最低温对比',
    unit: '°C',
    categories: ['周一', '周二', '周三', '周四', '周五'],
    series: [
      { name: '最高温', values: [18, 21, 24, 19, 16] },
      { name: '最低温', values: [9, 11, 13, 10, 7] },
    ],
    metrics: [
      { label: '最高气温', value: '24°C', detail: '周三' },
      { label: '最低气温', value: '7°C', detail: '周五' },
      { label: '平均高温', value: '19.6°C' },
    ],
    note: '日最高/最低气温，摄氏度，当地时区',
    sources: [{ name: 'Open-Meteo', url: 'https://open-meteo.com/' }],
  }),
  '```',
].join('\n')

const BAR_PIE_MERMAID_REPLY = [
  '季度营收柱状图：',
  '',
  '```chart',
  JSON.stringify({
    type: 'bar',
    title: '2026 季度营收',
    unit: '万元',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: '营收', values: [120, 150, 180, 210] }],
    note: '口径：合并报表营收',
    sources: [{ name: '用户输入数据' }],
  }),
  '```',
  '',
  '渠道占比：',
  '',
  '```chart',
  JSON.stringify({
    type: 'pie',
    title: '渠道占比',
    unit: '%',
    categories: ['线上', '线下', '合作'],
    series: [{ name: '占比', values: [55, 30, 15] }],
  }),
  '```',
  '',
  '无效图表回退测试：',
  '',
  '```chart',
  '{invalid json',
  '```',
  '',
  '流程图仍使用 Mermaid：',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[定位] --> B[查询]',
  '```',
].join('\n')

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })

const createHarness = async ({
  viewport = { width: 390, height: 844 },
  scheme = 'light',
  storage = {},
} = {}) => {
  const chats = []
  const weatherCalls = []
  let nextReply = '收到。'
  let weatherMode = 'ok'

  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport,
    isMobile: viewport.width < 768,
    hasTouch: viewport.width < 768,
    colorScheme: scheme,
    deviceScaleFactor: 2,
  })

  await context.addInitScript((initStorage) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(
        'chat-demo:memory',
        JSON.stringify({ enabled: true, auto: false, items: [] })
      )
      for (const [k, v] of Object.entries(initStorage)) localStorage.setItem(k, v)
      sessionStorage.setItem('seeded', '1')
    }
    window.__locationRequests = []
    window.__openedLinks = []
    window.__nextLocationReply = {
      status: 0,
      value: JSON.stringify({
        countryCode: 'CN',
        countryName: '中国',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
      }),
    }
    window.addEventListener(
      'load',
      () => {
        const { port1, port2 } = new MessageChannel()
        const post = (m) => port1.postMessage(JSON.stringify(m))
        window.devicePost = post
        port1.onmessage = (event) => {
          const { id, operation, value } = JSON.parse(event.data)
          if (operation === 'window-ui') {
            post({
              type: 'window-layout',
              insets: { top: 0, right: 0, bottom: 0, left: 0 },
              nativeHeader: false,
            })
          } else if (operation === 'read') {
            post({ id, status: 0, value: 'test-local-key' })
          } else if (operation === 'open') {
            window.__openedLinks.push(value)
          } else if (operation === 'location') {
            window.__locationRequests.push(JSON.parse(value || '{}'))
            post({ id, ...window.__nextLocationReply })
          }
        }
        window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
        post({
          type: 'device-features',
          voice: true,
          scan: true,
          save: true,
          share: true,
          location: true,
          deviceType: 'phone',
        })
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

  await context.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.searchParams.get('name') ?? ''
    weatherCalls.push({ kind: 'geocode', name })
    if (weatherMode === 'fail') {
      return route.fulfill({ status: 503, json: { error: true } })
    }
    const headers = { 'access-control-allow-origin': origin }
    if (/tokyo|东京/i.test(name)) {
      return route.fulfill({
        headers,
        json: {
          results: [
            {
              name: 'Tokyo',
              country_code: 'JP',
              admin1: 'Tokyo',
              latitude: 35.68,
              longitude: 139.69,
            },
          ],
        },
      })
    }
    return route.fulfill({
      headers,
      json: {
        results: [
          {
            name: '杭州',
            country_code: 'CN',
            admin1: '浙江省',
            latitude: 30.27,
            longitude: 120.15,
          },
        ],
      },
    })
  })

  await context.route('https://api.open-meteo.com/**', async (route) => {
    weatherCalls.push({ kind: 'forecast', url: route.request().url() })
    if (weatherMode === 'fail') {
      return route.fulfill({ status: 503, json: { error: true } })
    }
    return route.fulfill({
      headers: { 'access-control-allow-origin': origin },
      json: {
        timezone: 'Asia/Shanghai',
        current: {
          temperature_2m: 16.4,
          apparent_temperature: 15.2,
          relative_humidity_2m: 62,
          weather_code: 2,
          wind_speed_10m: 9.5,
        },
        daily: {
          time: ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
          weather_code: [1, 2, 0, 61, 3],
          temperature_2m_max: [18, 21, 24, 19, 16],
          temperature_2m_min: [9, 11, 13, 10, 7],
          precipitation_probability_max: [10, 20, 5, 75, 30],
          precipitation_sum: [0, 0, 0, 4.2, 0.5],
        },
      },
    })
  })

  await context.route('https://api.deepseek.com/**', async (route) => {
    const request = route.request()
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const pathname = new URL(request.url()).pathname
    if (pathname === '/models') {
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    }
    if (pathname === '/user/balance') {
      return route.fulfill({
        headers,
        json: { is_available: true, balance_infos: [] },
      })
    }
    chats.push(request.postDataJSON())
    return route.fulfill({ headers, contentType: 'text/event-stream', body: sse(nextReply) })
  })

  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  await page.goto(origin + '/index.html')
  await page.getByText('今天想聊什么？').waitFor()
  return {
    context,
    page,
    chats,
    weatherCalls,
    setReply: (value) => {
      nextReply = value
    },
    setWeatherMode: (mode) => {
      weatherMode = mode
    },
  }
}

const openGeneralSettings = async (page) => {
  await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置' })
  await dialog.waitFor()
  return dialog
}

const closeSettings = async (page, dialog) => {
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.mouse.click(360, 400)
  await page.waitForFunction(() => document.querySelector('main')?.inert === false)
}

try {
  // ---------- 1. 按需自动定位设置、授权失败与成功、结构化天气与折线图 ----------
  {
    const h = await createHarness()
    const { page, chats, weatherCalls } = h
    const dialog = await openGeneralSettings(page)
    assert.equal(await dialog.getByRole('button', { name: '请选择国家或地区' }).count(), 0)
    const autoLoc = dialog.getByRole('switch', { name: '位置信息' })
    assert.equal(await autoLoc.isChecked(), false, 'auto location defaults off')

    // 权限被拒时保持关闭并提示
    await page.evaluate(() => {
      window.__nextLocationReply = { status: 2, value: '' }
    })
    await autoLoc.click()
    await page.getByText('未获得位置权限，请在系统设置中允许 Deepseek GO 访问位置信息。').waitFor()
    assert.equal(await autoLoc.isChecked(), false)

    // 系统定位总开关关闭时保持关闭并提示
    await page.evaluate(() => {
      window.__nextLocationReply = { status: 3301100, value: '' }
    })
    await autoLoc.click()
    await page.getByText('系统定位服务未开启，请先打开系统定位开关。').waitFor()
    assert.equal(await autoLoc.isChecked(), false)

    // 授权成功：开启开关、展示仅含城市和行政区的识别结果
    await page.evaluate(() => {
      window.__nextLocationReply = {
        status: 0,
        value: JSON.stringify({
          countryCode: 'CN',
          countryName: '中国',
          province: '浙江省',
          city: '杭州市',
          district: '西湖区',
          latitude: 30.2741,
          roadName: '不应透出',
        }),
      }
    })
    await autoLoc.click()
    await page.getByText('已开启定位（浙江省杭州市西湖区）').waitFor()
    assert.equal(await autoLoc.isChecked(), true)
    assert.equal(await page.evaluate(() => localStorage.getItem('chat-demo:auto-location')), 'true')
    await closeSettings(page, dialog)

    // 1a. 普通非本地问题不触发定位，也不查询天气
    const locCountBeforeGeneral = await page.evaluate(() => window.__locationRequests.length)
    await page.locator('textarea').fill('帮我写一个快速排序算法')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('收到。').waitFor()
    assert.equal(await page.evaluate(() => window.__locationRequests.length), locCountBeforeGeneral)
    assert.equal(weatherCalls.length, 0)

    // 1b. 指定其他城市不触发本机定位，但查询该城市结构化天气
    h.setReply('东京明天晴转多云。')
    await page.locator('textarea').fill('东京明天天气怎么样')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('东京明天晴转多云。').waitFor()
    assert.equal(await page.evaluate(() => window.__locationRequests.length), locCountBeforeGeneral)
    assert(weatherCalls.some((c) => c.kind === 'geocode' && c.name === 'Tokyo'))

    // 1c. 「我这里」多日天气 -> 使用模糊定位（仅城市行政区）、Open-Meteo 结构化天气、图表规范与互动折线图
    h.setReply(WEATHER_CHART_REPLY)
    await page.locator('textarea').fill('我这里未来5天天气怎么样')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('杭州未来 5 天气温走势').waitFor()

    const lastReq = chats.at(-1)
    const reminder = lastReq.messages.findLast((m) => m.role === 'latest_reminder')?.content ?? ''
    assert(
      reminder.includes('浙江省杭州市西湖区'),
      `expected coarse area in reminder, got ${reminder}`
    )
    assert(!JSON.stringify(lastReq).includes('30.2741'), 'must never send coordinates to model')
    assert(!JSON.stringify(lastReq).includes('不应透出'), 'must never send street address to model')
    const lastUser = lastReq.messages.findLast((m) => m.role === 'user')?.content ?? ''
    assert(lastUser.includes('本地结构化天气数据') && lastUser.includes('Open-Meteo'))
    assert(lastUser.includes('```chart'))

    // 回复上方显示模糊定位与结构化数据来源标注
    await page.getByText('模糊定位：浙江省杭州市西湖区').waitFor()
    await page
      .locator('[data-local-context]')
      .last()
      .getByRole('link', { name: 'Open-Meteo' })
      .waitFor()

    // 图表交互：摘要指标、口径、来源链接、点按查看数值、键盘切换、数据表/代码切换
    await page.getByText('24°C').waitFor()
    await page.getByText('日最高/最低气温，摄氏度，当地时区').waitFor()
    await page.locator('[data-chart-point="2"]').click()
    const readout = await page.locator('[data-chart-readout]').textContent()
    assert(
      readout.includes('周三') && readout.includes('24°C') && readout.includes('13°C'),
      `unexpected readout: ${readout}`
    )

    await page.locator('[data-chart-point="2"]').focus()
    await page.keyboard.press('ArrowRight')
    const readoutNext = await page.locator('[data-chart-readout]').textContent()
    assert(
      readoutNext.includes('周四') && readoutNext.includes('19°C'),
      `keyboard nav failed: ${readoutNext}`
    )

    // 点击图表来源链接通过原生通道打开
    await page.locator('[data-chart-type="line"]').getByRole('link', { name: 'Open-Meteo' }).click()
    await page.waitForFunction(() => window.__openedLinks.includes('https://open-meteo.com/'))

    // 切换数据表与代码
    await page.getByRole('button', { name: '数据表', exact: true }).click()
    await page.locator('table').getByText('周三').waitFor()
    await page.getByRole('button', { name: '代码', exact: true }).click()
    await page
      .locator('pre')
      .filter({ hasText: '"type": "line"' })
      .or(page.locator('pre').filter({ hasText: '"type":"line"' }))
      .first()
      .waitFor()
    await page.getByRole('button', { name: '图表', exact: true }).click()
    await page.locator('[data-chart-type="line"] svg').waitFor()

    // 分享预览将图表转为可读纯文字，而非原始 JSON
    await page.getByRole('button', { name: '分享回答' }).last().click()
    const shareDialog = page.getByRole('dialog', { name: '分享预览' })
    await shareDialog.waitFor()
    const preview = await shareDialog
      .locator('textarea, pre, [role="textbox"]')
      .first()
      .inputValue()
      .catch(() => shareDialog.textContent())
    assert(
      preview.includes('杭州未来 5 天气温走势') &&
        preview.includes('周三') &&
        !preview.includes('"series"')
    )
    await shareDialog.getByRole('button', { name: '关闭', exact: true }).click()
    await shareDialog.waitFor({ state: 'detached' })

    // 1d. 当地活动与营业时间 -> 自动启用 deepseek_web_search 且不需用户手动打开搜索开关
    h.setReply('本周末西湖区有多场展览活动。')
    await page.locator('textarea').fill('我这里周末有什么展览活动')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('本周末西湖区有多场展览活动。').waitFor()
    const eventsReq = chats.at(-1)
    assert(
      eventsReq.tools.some((tool) => tool.type === 'deepseek_web_search'),
      'local events should auto-enable web search'
    )
    assert.equal(eventsReq.model, 'deepseek-flash')

    // 1e. 结构化天气接口失败时自动回退到 deepseek_web_search
    h.setWeatherMode('fail')
    h.setReply('已通过联网搜索获取宁波天气。')
    await page.locator('textarea').fill('宁波明天天气怎么样')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByText('已通过联网搜索获取宁波天气。').waitFor()
    assert(
      chats.at(-1).tools.some((tool) => tool.type === 'deepseek_web_search'),
      'weather API failure should fallback to web search'
    )

    await h.context.close()
  }

  // ---------- 2. 定位失效回退手动地区 + 柱状图/饼图/无效图表/Mermaid 共存 + 320px 深色无横向溢出 ----------
  {
    const h = await createHarness({
      viewport: { width: 320, height: 640 },
      scheme: 'dark',
      storage: { 'chat-demo:auto-location': 'true' },
    })
    const { page } = h
    await page.evaluate(() => {
      window.__nextLocationReply = { status: 2, value: '' }
    })
    h.setReply(BAR_PIE_MERMAID_REPLY)
    await page.locator('textarea').fill('附近博物馆营业时间，顺便帮我画个柱状图和饼图对比一下')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByRole('heading', { name: '2026 季度营收' }).waitFor()
    await page.getByRole('heading', { name: '渠道占比' }).waitFor()
    await page.getByText('图表数据格式无效，可切换为代码查看原文。').waitFor()
    await page.locator('.md-mermaid-diagram svg').waitFor()

    // 定位权限被拒时显示提示与「前往设置」快捷入口
    await page.getByText('未获得定位权限，未能识别当前地区').waitFor()

    // 柱状图自动计算摘要指标（最高 210万元）且点按显示数值
    await page.locator('[data-chart-type="bar"]').getByText('210万元').first().waitFor()
    await page.locator('[data-chart-type="bar"] [data-chart-point="3"]').click()
    const barReadout = await page
      .locator('[data-chart-type="bar"] [data-chart-readout]')
      .textContent()
    assert(barReadout.includes('Q4') && barReadout.includes('210'))

    // 饼图点按切片更新中心数值与读数条
    await page.locator('[data-chart-type="pie"] [data-chart-point="1"]').click()
    const pieReadout = await page
      .locator('[data-chart-type="pie"] [data-chart-readout]')
      .textContent()
    assert(pieReadout.includes('线下') && pieReadout.includes('30%'))

    // 320px 窄窗深色下无整页横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    assert(overflow <= 1, `unexpected horizontal overflow on 320px viewport: ${overflow}px`)

    // 点击提示中的「前往设置」打开设置页
    await page.getByRole('button', { name: '前往设置', exact: true }).click()
    await page.getByRole('dialog', { name: '设置' }).waitFor()

    await h.context.close()
  }

  console.log('local-info-charts: OK')
} finally {
  await browser.close()
}
