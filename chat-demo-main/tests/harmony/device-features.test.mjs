// 1.1.0 鸿蒙独有功能回归：模拟 ArkWeb 消息通道，覆盖语音、识字、分享和导出。
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

const browser = await chromium.launch({
  ...launchOptions,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})

const newContext = async (features, initialShare) => {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await context.addInitScript(
    ({ features, initialShare }) => {
      window.deviceLog = []
      window.voiceStartStatus = 0
      window.scanReply = { status: 0, value: '' }
      window.saveStatus = 0
      window.shareStatus = 0
      window.speechStatus = 0
      window.allowTestMic = true
      if (features.apiVoice) {
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!window.allowTestMic) throw new DOMException('Denied', 'NotAllowedError')
          return getUserMedia(constraints)
        }
      }
      window.addEventListener(
        'load',
        () => {
          const { port1, port2 } = new MessageChannel()
          const post = (message) => port1.postMessage(JSON.stringify(message))
          window.devicePost = post
          window.mockWindowAction = (action) => post({ type: 'window-action', action })
          port1.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
              const view = new DataView(event.data)
              const length = view.getUint32(0, true)
              const header = JSON.parse(
                new TextDecoder().decode(new Uint8Array(event.data, 4, length))
              )
              const body = new Uint8Array(event.data, 4 + length)
              window.deviceLog.push({
                ...header,
                size: body.byteLength,
                magic: String.fromCharCode(body[0], body[1]),
                text:
                  header.operation === 'speak-text' ||
                  (header.operation === 'share-content' && header.value !== 'image')
                    ? new TextDecoder().decode(body)
                    : undefined,
              })
              const status =
                header.operation === 'speak-text'
                  ? window.speechStatus
                  : header.operation === 'share-content'
                    ? window.shareStatus
                    : window.saveStatus
              post({ id: header.id, status, value: '' })
              return
            }
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
            window.deviceLog.push({ operation, value })
            if (operation === 'read') post({ id, status: 0, value: 'test-local-key' })
            if (operation === 'save') post({ id, status: 0, value: '' })
            if (operation === 'voice' && value === 'start')
              post({ id, status: window.voiceStartStatus, value: '' })
            if (operation === 'scan') post({ id, ...window.scanReply })
          }
          window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
          post({ type: 'device-features', ...features })
          // 冷启动分享：端口刚连上就发，网页需要等 Key 读出后再处理。
          if (initialShare) post(initialShare)
        },
        { once: true }
      )
    },
    { features, initialShare }
  )
  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/index.html' && !nativePath.test(path)) return route.fulfill({ status: 404 })
    return route.fulfill({
      body: await readFile(assets + path),
      contentType: media[extname(path)],
      headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
    })
  })
  const asrRequests = []
  let asrFails = false
  let remoteReadAloudCalls = 0
  await context.route('https://api.deepseek.com/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, x-api-key, anthropic-version, anthropic-beta',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
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
    if (path === '/anthropic/v1/files') {
      return route.fulfill({
        headers,
        json: {
          id: 'file-1',
          type: 'file',
          size_bytes: 5,
          created_at: new Date().toISOString(),
          filename: 'note.txt',
          mime_type: 'text/plain',
        },
      })
    }
    if (path === '/v1/tools/asr') {
      asrRequests.push(request.postDataBuffer())
      return route.fulfill(
        asrFails
          ? { headers, status: 503, json: { error: { message: 'Mock ASR unavailable' } } }
          : { headers, json: { text: 'Recognized in the cloud' } }
      )
    }
    if (path === '/v1/tools/tts') {
      remoteReadAloudCalls++
      return route.fulfill({ headers, status: 400, body: 'Unexpected remote speech' })
    }
    assert.equal(path, '/anthropic/v1/messages')
    const frames = [
      { type: 'message_start', message: { id: 'mock', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '收到。' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', title: '测试会话' } },
      { type: 'message_stop' },
    ]
    return route.fulfill({
      headers,
      contentType: 'text/event-stream',
      body: frames
        .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
        .join(''),
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
  return {
    context,
    page,
    errors,
    asrRequests,
    setAsrFailure: (value) => {
      asrFails = value
    },
    getRemoteReadAloudCalls: () => remoteReadAloudCalls,
  }
}

const log = (page) => page.evaluate(() => window.deviceLog)
const toast = (page, text) => page.getByText(text, { exact: true }).waitFor()

try {
  // ---------- 冷启动分享 + 语音 + 识字 + 导出 ----------
  const share = {
    type: 'share',
    items: [
      { kind: 'text', text: '这段文字来自别的应用' },
      { kind: 'file', name: 'note.txt', data: Buffer.from('hello').toString('base64') },
    ],
    skipped: 1,
  }
  const { page, errors, context } = await newContext({ voice: true, scan: true, save: true }, share)
  await page.goto(origin + '/index.html')
  const textarea = page.locator('textarea')
  // 有 Key 时不应打开设置；分享内容进入新对话草稿。
  await page.waitForFunction(() =>
    document.querySelector('textarea')?.value.includes('这段文字来自别的应用')
  )
  assert.equal(await page.getByRole('dialog', { name: '设置' }).count(), 0)
  await toast(page, '已跳过 1 项过大或无法读取的内容')
  await page.getByText('note.txt').first().waitFor()
  if (shots) await page.screenshot({ path: join(shots, '1-share-cold-start.png') })

  // 语音（1.4.2 起为「按住说话」）：只在输入框为空时可用，识别结果追加到草稿
  const clearDraft = async () => {
    await page.waitForTimeout(100)
    await textarea.fill('')
    while (await page.getByRole('button', { name: '删除', exact: true }).count()) {
      await page.getByRole('button', { name: '删除', exact: true }).first().click()
    }
  }
  const voiceLog = () =>
    page.evaluate(() => window.deviceLog.filter((e) => e.operation === 'voice').map((e) => e.value))
  const toVoice = async () => {
    await page.getByRole('button', { name: '切换到按住说话', exact: true }).click()
    const speak = page.getByRole('button', { name: '按住说话', exact: true })
    const box = await speak.boundingBox()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const press = async (point) => {
    const before = (await voiceLog()).filter((value) => value === 'start').length
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.waitForFunction(
      (count) =>
        window.deviceLog.filter((e) => e.operation === 'voice' && e.value === 'start').length >
        count,
      before
    )
  }
  await clearDraft()
  assert.equal(await page.getByRole('button', { name: '语音输入', exact: true }).count(), 0)
  let point = await toVoice()
  await press(point)
  await page.getByRole('button', { name: '松开结束', exact: true }).waitFor()
  await page.getByText('上滑取消').waitFor()
  await page.evaluate(() => {
    window.devicePost({ type: 'voice', event: 'result', text: '今天', final: false, last: false })
    window.devicePost({
      type: 'voice',
      event: 'result',
      text: '今天天气',
      final: false,
      last: false,
    })
  })
  await page.getByText('今天天气', { exact: true }).waitFor()
  if (shots) await page.screenshot({ path: join(shots, '2-voice-live.png') })
  // 引擎先检测到停顿结束：等松手才写入草稿，松手前仍可上滑放弃
  await page.evaluate(() => {
    window.devicePost({
      type: 'voice',
      event: 'result',
      text: '今天天气不错',
      final: true,
      last: true,
    })
    window.devicePost({ type: 'voice', event: 'end' })
  })
  await page.waitForTimeout(200)
  assert.equal(await textarea.inputValue(), '')
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelector('textarea').value === '今天天气不错')
  // 有文字后回到键盘输入，右下角显示发送键
  await page.getByRole('button', { name: '发送', exact: true }).waitFor()
  assert.equal(await textarea.evaluate((el) => getComputedStyle(el).visibility), 'visible')

  // 松手时引擎还没结束：发送 stop，等最后结果；逐段结果会拼接
  await clearDraft()
  point = await toVoice()
  await press(point)
  await page.evaluate(() => {
    window.devicePost({
      type: 'voice',
      event: 'result',
      text: '第一句。',
      final: true,
      last: false,
    })
    window.devicePost({ type: 'voice', event: 'result', text: '第二', final: false, last: false })
  })
  await page.getByText('第一句。第二', { exact: true }).waitFor()
  await page.mouse.up()
  await page.waitForFunction(() =>
    window.deviceLog.some((e) => e.operation === 'voice' && e.value === 'stop')
  )
  await page.evaluate(() => {
    window.devicePost({ type: 'voice', event: 'result', text: '第二句。', final: true, last: true })
    window.devicePost({ type: 'voice', event: 'end' })
  })
  await page.waitForFunction(() => document.querySelector('textarea').value === '第一句。第二句。')

  // 上滑后松手取消，不写入草稿
  await clearDraft()
  point = await toVoice()
  await press(point)
  await page.evaluate(() =>
    window.devicePost({ type: 'voice', event: 'result', text: '不要了', final: false, last: false })
  )
  await page.mouse.move(point.x, point.y - 90, { steps: 4 })
  await page.getByRole('button', { name: '松开取消', exact: true }).waitFor()
  await page.mouse.up()
  await page.waitForFunction(
    () => window.deviceLog.filter((e) => e.operation === 'voice').at(-1)?.value === 'cancel'
  )
  await page.getByRole('button', { name: '按住说话', exact: true }).waitFor()
  assert.equal(await textarea.inputValue(), '')
  // 应用切后台由原生发 cancel：回到空闲且不提示
  await press(point)
  await page.evaluate(() => window.devicePost({ type: 'voice', event: 'cancel' }))
  await page.mouse.up()
  await page.getByRole('button', { name: '按住说话', exact: true }).waitFor()
  assert.equal(await textarea.inputValue(), '')

  // 拒绝麦克风、识别出错、没有识别到内容
  await page.evaluate(() => {
    window.voiceStartStatus = 2
  })
  await press(point)
  await page.mouse.up()
  await toast(page, '无法使用麦克风，请在系统设置中允许 Deepseek GO 访问麦克风')
  await page.evaluate(() => {
    window.voiceStartStatus = 0
  })
  await press(point)
  await page.evaluate(() => window.devicePost({ type: 'voice', event: 'error', code: 1002200006 }))
  await page.mouse.up()
  await toast(page, '语音识别失败，请稍后再试')
  await press(point)
  await page.mouse.up()
  await page.evaluate(() => window.devicePost({ type: 'voice', event: 'end' }))
  await toast(page, '未识别到语音内容')
  // 切回键盘
  await page.getByRole('button', { name: '切换到键盘', exact: true }).click()
  await textarea.waitFor({ state: 'visible' })

  // 识字：拍照成功插入光标处、图库取消无提示、空结果提示
  // 等语音插入后把光标移到末尾的那一帧过去，否则清空时的全选会被它打断
  await page.waitForTimeout(100)
  await textarea.fill('')
  const scan = page.getByRole('button', { name: '识别图片文字', exact: true })
  await page.evaluate(() => {
    window.scanReply = { status: 0, value: '  第一行\n第二行  ' }
  })
  await scan.click()
  if (shots) await page.screenshot({ path: join(shots, '3-scan-menu.png') })
  await page.getByRole('menuitem', { name: '拍照识字' }).click()
  await page.waitForFunction(() => document.querySelector('textarea').value === '第一行\n第二行')
  assert.deepEqual(
    (await log(page)).filter((e) => e.operation === 'scan').map((e) => e.value),
    ['camera']
  )
  await page.evaluate(() => {
    window.scanReply = { status: 1, value: '' }
  })
  await scan.click()
  await page.getByRole('menuitem', { name: '从图库识字' }).click()
  await page.waitForFunction(
    () => window.deviceLog.filter((e) => e.operation === 'scan').length === 2
  )
  assert.equal(await textarea.inputValue(), '第一行\n第二行')
  await page.evaluate(() => {
    window.scanReply = { status: 0, value: '   ' }
  })
  await scan.click()
  await page.getByRole('menuitem', { name: '从图库识字' }).click()
  await toast(page, '图片中没有识别到文字')
  await page.evaluate(() => {
    window.scanReply = { status: 13900042, value: '' }
  })
  await scan.click()
  await page.getByRole('menuitem', { name: '拍照识字' }).click()
  await toast(page, '文字识别失败，请换一张图片再试')

  // 发送一条消息，产生可导出的会话
  await textarea.fill('你好')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText('收到。', { exact: true }).waitFor()

  // 运行中收到分享：回到新对话，接在已有新对话草稿后面
  await page.evaluate(() =>
    window.devicePost({
      type: 'share',
      items: [{ kind: 'text', text: 'https://example.com/a' }],
      skipped: 0,
    })
  )
  await page.getByText('今天想聊什么？', { exact: true }).waitFor()
  await page.waitForFunction(
    () => document.querySelector('textarea').value === 'https://example.com/a'
  )
  await toast(page, '已填入新对话')
  await page.evaluate(() =>
    window.devicePost({ type: 'share', items: [{ kind: 'text', text: '第二次分享' }], skipped: 0 })
  )
  await page.waitForFunction(
    () => document.querySelector('textarea').value === 'https://example.com/a\n\n第二次分享'
  )

  // 导出：系统文件选择器保存
  await page.evaluate(() => window.mockWindowAction('sidebar'))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.getByRole('tab', { name: '数据管理' }).click()
  const save = settings.getByRole('button', { name: '保存', exact: true })
  if (shots) await page.screenshot({ path: join(shots, '4-export-setting.png') })
  await save.click()
  await toast(page, '已保存到所选位置')
  const frame = (await log(page)).find((e) => e.operation === 'save-file')
  assert.match(frame.value, /^deepseek_data-.+\.zip$/)
  assert.equal(frame.magic, 'PK')
  assert(frame.size > 100)
  await page.evaluate(() => {
    window.saveStatus = 1
  })
  await save.click()
  await page.waitForFunction(
    () => window.deviceLog.filter((e) => e.operation === 'save-file').length === 2
  )
  assert.equal(await settings.getByText('保存失败，请重新选择位置').count(), 0)
  await page.evaluate(() => {
    window.saveStatus = 13900020
  })
  await save.click()
  await settings.getByText('保存失败，请重新选择位置').waitFor()
  assert.deepEqual(errors, [])
  await context.close()

  // 1.5.0 搜索、分享与双语音路径从真实界面入口验证。
  const experience = await newContext({ voice: true, apiVoice: true, readAloud: true, share: true })
  const featurePage = experience.page
  await featurePage.goto(origin + '/index.html')
  const openSider = () => featurePage.evaluate(() => window.mockWindowAction('sidebar'))
  const openSettings = async () => {
    await openSider()
    await featurePage.getByRole('button', { name: '设置', exact: true }).click()
    return featurePage.getByRole('dialog', { name: '设置', exact: true })
  }
  const general = await openSettings()
  const inputChoice = general.getByRole('button', { name: '语音输入', exact: true })
  assert.match(await inputChoice.innerText(), /本地识别/)
  await inputChoice.focus()
  await featurePage.keyboard.press('Enter')
  await featurePage.getByRole('option', { name: '本地识别' }).waitFor()
  await featurePage.keyboard.press('ArrowDown')
  await featurePage.keyboard.press('Enter')
  assert.match(await inputChoice.innerText(), /DeepSeek API/)
  assert.equal(await inputChoice.evaluate((element) => document.activeElement === element), true)
  const ttsChoice = general.getByRole('button', { name: '朗读音色', exact: true })
  await ttsChoice.click()
  await featurePage.getByRole('option', { name: '本机离线朗读' }).click()
  await featurePage.reload()
  await featurePage.getByText('今天想聊什么？', { exact: true }).waitFor()
  const featureInput = featurePage.locator('textarea')
  await featurePage.getByRole('button', { name: '切换到按住说话' }).click()
  const recordControl = featurePage.getByRole('button', { name: '按住说话', exact: true })
  const bounds = await recordControl.boundingBox()
  const pressApi = async () => {
    await featurePage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await featurePage.mouse.down()
    await featurePage.getByRole('button', { name: '松开结束', exact: true }).waitFor()
  }
  await featurePage.evaluate(() => {
    window.allowTestMic = false
  })
  await featurePage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await featurePage.mouse.down()
  await toast(featurePage, '无法使用麦克风，请在系统设置中允许 Deepseek GO 访问麦克风')
  await featurePage.mouse.up()
  assert.equal(experience.asrRequests.length, 0)
  await featurePage.evaluate(() => {
    window.allowTestMic = true
  })
  await pressApi()
  await featurePage.waitForTimeout(360)
  await featurePage.mouse.move(bounds.x + bounds.width / 2, bounds.y - 90, { steps: 4 })
  await featurePage.getByRole('button', { name: '松开取消', exact: true }).waitFor()
  await featurePage.mouse.up()
  assert.equal(experience.asrRequests.length, 0)
  assert.equal(await featureInput.inputValue(), '')
  experience.setAsrFailure(true)
  await pressApi()
  await featurePage.waitForTimeout(600)
  assert.equal(experience.asrRequests.length, 0)
  await featurePage.mouse.up()
  await toast(featurePage, '语音识别失败，请稍后再试')
  assert.equal(await featureInput.inputValue(), '')
  experience.setAsrFailure(false)
  // 键盘开始、结束和取消，使用同一个录音入口。
  await recordControl.focus()
  await featurePage.keyboard.press('Space')
  await featurePage.getByRole('button', { name: '结束录音' }).waitFor()
  await featurePage.keyboard.press('Escape')
  await recordControl.waitFor()
  assert.equal(experience.asrRequests.length, 1)
  await featurePage.keyboard.press('Enter')
  await featurePage.getByRole('button', { name: '结束录音' }).waitFor()
  await featurePage.waitForTimeout(600)
  await featurePage.keyboard.press('Enter')
  await featurePage.waitForFunction(
    () => document.querySelector('textarea')?.value === 'Recognized in the cloud'
  )
  assert.equal(experience.asrRequests.length, 2)
  assert(experience.asrRequests[1].includes(Buffer.from('RIFF')))
  assert.equal(
    (await log(featurePage)).some((entry) => entry.operation === 'voice'),
    false
  )

  await featureInput.fill('这是用于搜索的独特消息 1+1')
  await featurePage.getByRole('button', { name: '发送', exact: true }).click()
  await featurePage.getByText('收到。', { exact: true }).waitFor()
  const play = featurePage.getByRole('button', { name: '朗读', exact: true })
  await featurePage.evaluate(() => {
    window.speechStatus = 3
  })
  await play.click()
  await toast(featurePage, '此设备暂不支持本机朗读，可在设置中选择 API 音色。')
  await featurePage.evaluate(() => {
    window.speechStatus = 0
  })
  await play.click()
  const stop = featurePage.getByRole('button', { name: '停止朗读', exact: true })
  await stop.click()
  await featurePage.waitForFunction(() =>
    window.deviceLog.some((entry) => entry.operation === 'speak-stop')
  )
  const speech = (await log(featurePage)).filter((entry) => entry.operation === 'speak-text')
  assert.equal(speech.length, 2)
  assert.equal(speech[1].text, '收到。')
  assert.equal(experience.getRemoteReadAloudCalls(), 0)
  await play.click()
  await stop.waitFor()
  await featurePage.waitForFunction(
    () => window.deviceLog.filter((entry) => entry.operation === 'speak-text').length === 3
  )
  await featurePage.evaluate(() => {
    const token = window.deviceLog.filter((entry) => entry.operation === 'speak-text').at(-1).value
    window.devicePost({ type: 'read-aloud', token, status: 0 })
  })
  await play.waitFor()

  const preview = featurePage.getByRole('dialog', { name: '分享预览' })
  const sendShare = preview.getByRole('button', { name: '打开系统分享' })
  const answerShare = featurePage.getByRole('button', { name: '分享回答' })
  await answerShare.click()
  await preview.getByText('收到。', { exact: true }).waitFor()
  await featurePage.evaluate(() => {
    window.shareStatus = -1
  })
  await sendShare.click()
  await preview.getByRole('alert').getByText('分享失败，请重试。').waitFor()
  await featurePage.evaluate(() => {
    window.shareStatus = 0
  })
  await sendShare.click()
  await preview.waitFor({ state: 'hidden' })
  await answerShare.click()
  await preview.getByLabel('分享格式').selectOption('image')
  await sendShare.click()
  await preview.waitFor({ state: 'hidden' })
  const shareFrames = (await log(featurePage)).filter(
    (entry) => entry.operation === 'share-content'
  )
  assert.equal(shareFrames[0].text, '收到。')
  assert.equal(shareFrames[2].value, 'image')
  assert.equal(shareFrames[2].magic.charCodeAt(0), 137)
  assert.equal(shareFrames[2].magic[1], 'P')

  await openSider()
  await featurePage
    .getByRole('navigation')
    .getByRole('button', { name: '更多', exact: true })
    .click()
  await featurePage.getByRole('menuitem', { name: '分享对话' }).click()
  await preview.getByLabel('分享格式').selectOption('markdown')
  await sendShare.click()
  await preview.waitFor({ state: 'hidden' })
  const markdown = (await log(featurePage))
    .filter((entry) => entry.operation === 'share-content')
    .at(-1)
  assert.equal(markdown.value, 'markdown')
  assert.match(markdown.text, /# 测试会话[\s\S]*独特消息 1\+1[\s\S]*收到。/)

  await featurePage.reload()
  await featurePage.getByText('今天想聊什么？', { exact: true }).waitFor()
  await openSider()
  const history = featurePage.getByRole('button', { name: '搜索历史对话', exact: true })
  await featurePage.emulateMedia({ forcedColors: 'active' })
  await history.focus()
  await featurePage.keyboard.press('Enter')
  const search = featurePage.getByRole('dialog', { name: '搜索历史对话' })
  const searchField = search.getByRole('searchbox')
  assert.equal(await searchField.evaluate((element) => document.activeElement === element), true)
  await searchField.fill('没有这样的对话')
  await search.getByRole('status').getByText('没有找到相关对话').waitFor()
  await searchField.fill('测试会话')
  await search.getByRole('button', { name: '测试会话', exact: true }).waitFor()
  await searchField.fill('1+1')
  const result = search.getByRole('button', { name: /独特消息 1\+1/ })
  await result.focus()
  // 最后一个控件 Tab 回到对话框内，Esc 还原到侧栏入口。
  await featurePage.keyboard.press('Tab')
  assert.equal(
    await search
      .getByRole('button', { name: '关闭', exact: true })
      .evaluate((element) => document.activeElement === element),
    true
  )
  assert.equal(
    await search
      .getByRole('button', { name: '关闭', exact: true })
      .evaluate((element) => getComputedStyle(element).outlineStyle),
    'solid'
  )
  await featurePage.keyboard.press('Escape')
  await search.waitFor({ state: 'hidden' })
  assert.equal(await history.evaluate((element) => document.activeElement === element), true)
  await history.click()
  await searchField.fill('1+1')
  await result.click()
  await featurePage.waitForFunction(
    () =>
      document.activeElement?.hasAttribute('data-history-message') &&
      document.activeElement.textContent.includes('独特消息 1+1')
  )
  assert.deepEqual(experience.errors, [])
  await experience.context.close()

  // ---------- 设备不支持时隐藏入口 ----------
  const fallback = await newContext({ voice: false, scan: false, save: true })
  await fallback.page.goto(origin + '/index.html')
  await fallback.page.getByText('今天想聊什么？', { exact: true }).waitFor()
  // 不支持语音时，空输入框的右下角不放语音切换键；有内容后才出现发送键
  await fallback.page.locator('textarea').waitFor()
  assert.equal(
    await fallback.page.getByRole('button', { name: '切换到按住说话', exact: true }).count(),
    0
  )
  await fallback.page.locator('textarea').fill('你好')
  await fallback.page.getByRole('button', { name: '发送', exact: true }).waitFor()
  assert.equal(
    await fallback.page.getByRole('button', { name: '识别图片文字', exact: true }).count(),
    0
  )
  assert.deepEqual(fallback.errors, [])
  await fallback.context.close()
  console.log('harmony features regression: OK')
} finally {
  await browser.close()
}
