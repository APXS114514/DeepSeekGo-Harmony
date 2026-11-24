import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(repoRoot, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
const hapticsSource = await readFile(
  join(repoRoot, 'harmony/entry/src/main/ets/services/Haptics.ets'),
  'utf8'
)
const moduleJson = JSON.parse(
  await readFile(join(repoRoot, 'harmony/entry/src/main/module.json5'), 'utf8')
)

assert(
  moduleJson.module.requestPermissions.some((item) => item.name === 'ohos.permission.VIBRATE'),
  'module.json5 must declare ohos.permission.VIBRATE'
)
assert(
  hapticsSource.includes("usage: 'touch'"),
  'Haptics must use touch usage to obey system settings'
)
assert(
  hapticsSource.includes("canIUse('SystemCapability.Sensors.MiscDevice')"),
  'Haptics must check MiscDevice capability'
)

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

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const runScenario = async (hapticsEnabled) => {
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    await context.addInitScript((enabled) => {
      sessionStorage.setItem('mockDeviceKey', 'test-haptics-key')
      localStorage.setItem(
        'chat-demo:memory',
        JSON.stringify({ enabled: true, auto: false, items: [] })
      )
      localStorage.setItem('chat-demo:thinking', 'true')
      window.hapticsLog = []
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
      window.addEventListener(
        'load',
        () => {
          const { port1, port2 } = new MessageChannel()
          const post = (message) => port1.postMessage(JSON.stringify(message))
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
            if (operation === 'haptic') {
              window.hapticsLog.push(value)
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
            if (operation === 'voice' && value === 'start') {
              port1.postMessage(JSON.stringify({ id, status: 0, value: '' }))
              return
            }
            if (operation === 'voice' && (value === 'cancel' || value === 'stop')) {
              post({ type: 'voice', event: value === 'cancel' ? 'cancel' : 'end' })
              return
            }
          }
          window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
          post({
            type: 'device-features',
            voice: true,
            apiVoice: false,
            readAloud: false,
            share: false,
            scan: true,
            immersiveScanMenu: false,
            save: true,
            location: false,
            haptics: enabled,
            windowPrivacy: false,
            deviceType: 'phone',
          })
        },
        { once: true }
      )
    }, hapticsEnabled)

    await context.route(origin + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        body: await readFile(assets + path),
        contentType: media[extname(path)],
        headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
      })
    })
    await context.route('https://api.deepseek.com/**', async (route) => {
      const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'authorization',
      }
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    })

    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))

    await page.goto(origin + '/index.html')
    const composer = page.getByPlaceholder('请输入消息')
    await composer.waitFor()

    // 1. 菜单弹出触感（添加附件菜单）
    await page.getByRole('button', { name: '添加附件', exact: true }).click()
    await page.getByRole('menuitem', { name: '拍照识字', exact: true }).waitFor()
    await page.keyboard.press('Escape')

    // 2. 按住说话 + 上滑取消触感
    await page.getByRole('button', { name: '切换到按住说话', exact: true }).click()
    const holdBtn = page.getByRole('button', { name: '按住说话', exact: true })
    await holdBtn.waitFor()
    const box = await holdBtn.boundingBox()
    assert(box)
    await holdBtn.evaluate((el, b) => {
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          isPrimary: true,
          button: 0,
          pointerId: 1,
          clientX: x,
          clientY: y,
        })
      )
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          isPrimary: true,
          pointerId: 1,
          clientX: x,
          clientY: y - 72,
        })
      )
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          isPrimary: true,
          pointerId: 1,
          clientX: x,
          clientY: y - 90,
        })
      )
      el.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          isPrimary: true,
          pointerId: 1,
          clientX: x,
          clientY: y - 90,
        })
      )
    }, box)

    await page.getByRole('button', { name: '切换到键盘', exact: true }).click()

    // 3. 深度思考完成 + 流式回答首字到达触感
    await composer.fill('测试触感反馈')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.waitForFunction(() => window.streams.length > 0)
    await page.evaluate(
      (chunk) => {
        const s = window.streams[0]
        s.controller.enqueue(new TextEncoder().encode(chunk))
        s.controller.close()
      },
      [
        sseEvent('message_start', {
          message: {
            id: 'msg_h',
            type: 'message',
            role: 'assistant',
            model: 'deepseek-flash',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        }),
        sseEvent('content_block_start', {
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        }),
        sseEvent('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: '分析中' },
        }),
        sseEvent('content_block_stop', { index: 0 }),
        sseEvent('content_block_start', { index: 1, content_block: { type: 'text', text: '' } }),
        sseEvent('content_block_delta', { index: 1, delta: { type: 'text_delta', text: '首字' } }),
        sseEvent('content_block_delta', { index: 1, delta: { type: 'text_delta', text: '后续' } }),
        sseEvent('content_block_stop', { index: 1 }),
        sseEvent('message_delta', {
          delta: { stop_reason: 'end_turn', title: '触感测试' },
          usage: { output_tokens: 10 },
        }),
        sseEvent('message_stop', {}),
      ].join('')
    )
    await page.getByText('首字后续').waitFor()

    // 4. 复制成功触感
    const copyBtns = page.getByRole('button', { name: '复制', exact: true })
    await copyBtns.last().click()
    await page.waitForTimeout(100)

    const log = await page.evaluate(() => window.hapticsLog)
    assert.deepEqual(runtimeErrors, [])
    await context.close()
    return log
  }

  const enabledLog = await runScenario(true)
  assert.deepEqual(enabledLog, [
    'menu',
    'voice-start',
    'voice-cancel',
    'thinking-done',
    'reply-first-token',
    'copy',
  ])

  const disabledLog = await runScenario(false)
  assert.deepEqual(disabledLog, [])

  console.log('haptics: PASS')
} finally {
  await browser.close()
}
