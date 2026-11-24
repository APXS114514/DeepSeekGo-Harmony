import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(repoRoot, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')

// 1. 静态快捷方式配置与资源核对
const moduleJson = JSON.parse(
  await readFile(join(repoRoot, 'harmony/entry/src/main/module.json5'), 'utf8')
)
const ability = moduleJson.module.abilities.find((item) => item.name === 'EntryAbility')
assert(
  ability?.metadata?.some(
    (item) =>
      item.name === 'ohos.ability.shortcuts' && item.resource === '$profile:shortcuts_config'
  ),
  'EntryAbility must declare ohos.ability.shortcuts metadata'
)

const shortcutsConfig = JSON.parse(
  await readFile(
    join(repoRoot, 'harmony/entry/src/main/resources/base/profile/shortcuts_config.json'),
    'utf8'
  )
)
assert.equal(shortcutsConfig.shortcuts.length, 4)
const zhStrings = JSON.parse(
  await readFile(
    join(repoRoot, 'harmony/entry/src/main/resources/base/element/string.json'),
    'utf8'
  )
).string
const enStrings = JSON.parse(
  await readFile(
    join(repoRoot, 'harmony/entry/src/main/resources/en_US/element/string.json'),
    'utf8'
  )
).string

const expectedActions = ['new-chat', 'voice', 'scan', 'incognito']
for (const [index, shortcut] of shortcutsConfig.shortcuts.entries()) {
  assert.equal(shortcut.wants[0].bundleName, 'com.pocketchat.deepseek')
  assert.equal(shortcut.wants[0].abilityName, 'EntryAbility')
  assert.equal(shortcut.wants[0].parameters.pocketChatShortcut, expectedActions[index])
  const labelKey = shortcut.label.replace('$string:', '')
  assert(
    zhStrings.some((item) => item.name === labelKey),
    `Missing zh string ${labelKey}`
  )
  assert(
    enStrings.some((item) => item.name === labelKey),
    `Missing en string ${labelKey}`
  )
  const mediaName = shortcut.icon.replace('$media:', '')
  await access(join(repoRoot, `harmony/entry/src/main/resources/base/media/${mediaName}.svg`))
}

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

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const createContext = async (coldShortcut, features = { voice: true, scan: true }) => {
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    await context.addInitScript(
      ({ initialShortcut, deviceFeatures }) => {
        sessionStorage.setItem('mockDeviceKey', 'test-shortcut-key')
        localStorage.setItem(
          'chat-demo:memory',
          JSON.stringify({ enabled: true, auto: false, items: [] })
        )
        window.addEventListener(
          'load',
          () => {
            const { port1, port2 } = new MessageChannel()
            const post = (message) => port1.postMessage(JSON.stringify(message))
            window.triggerShortcut = (action) =>
              post({ type: 'window-action', action: 'shortcut', value: action })
            port1.onmessage = (event) => {
              const { id, operation } = JSON.parse(event.data)
              if (operation === 'window-ui') {
                post({
                  type: 'window-layout',
                  insets: { top: 0, right: 0, bottom: 0, left: 0 },
                  nativeHeader: false,
                })
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
              }
            }
            window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
            post({
              type: 'device-features',
              voice: deviceFeatures.voice,
              apiVoice: false,
              readAloud: false,
              share: false,
              scan: deviceFeatures.scan,
              immersiveScanMenu: false,
              save: true,
              location: false,
              haptics: false,
              windowPrivacy: false,
              deviceType: 'phone',
            })
            if (initialShortcut) {
              post({ type: 'window-action', action: 'shortcut', value: initialShortcut })
            }
          },
          { once: true }
        )
      },
      { initialShortcut: coldShortcut, deviceFeatures: features }
    )
    await context.route(origin + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        body: await readFile(assets + path),
        contentType: media[extname(path)],
        headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
      })
    })
    return context
  }

  // 2. 冷启动直达「无痕对话」
  {
    const context = await createContext('incognito')
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    await page.goto(origin + '/index.html')
    await page.getByRole('button', { name: '退出无痕对话', exact: true }).waitFor()

    // 3. 热启动直达「语音提问」-> 退出无痕并进入按住说话模式
    await page.evaluate(() => window.triggerShortcut('voice'))
    await page.getByRole('button', { name: '按住说话', exact: true }).waitFor()
    await page.getByRole('button', { name: '无痕对话', exact: true }).waitFor()

    // 4. 热启动直达「识别图片文字」-> 直接打开拍照/图库选择（不含上传文件项）
    await page.evaluate(() => window.triggerShortcut('scan'))
    await page.getByRole('menuitem', { name: '拍照识字', exact: true }).waitFor()
    await page.getByRole('menuitem', { name: '从图库识字', exact: true }).waitFor()
    assert.equal(
      await page.getByRole('menuitem', { name: '上传图片或文件', exact: true }).count(),
      0
    )
    await page.keyboard.press('Escape')

    // 5. 热启动直达「新对话」-> 恢复普通欢迎页
    await page.evaluate(() => window.triggerShortcut('incognito'))
    await page.getByRole('button', { name: '退出无痕对话', exact: true }).waitFor()
    await page.evaluate(() => window.triggerShortcut('new-chat'))
    await page.getByRole('button', { name: '无痕对话', exact: true }).waitFor()
    await context.close()
  }

  // 6. 冷启动直达「语音提问」（设备不支持语音时优雅提示）
  {
    const context = await createContext('voice', { voice: false, scan: false })
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    await page.goto(origin + '/index.html')
    await page.getByText('当前设备暂不支持语音输入').waitFor()
    await page.evaluate(() => window.triggerShortcut('scan'))
    await page.getByText('当前设备暂不支持识别图片文字').waitFor()
    await context.close()
  }

  console.log('quick-shortcuts: PASS')
} finally {
  await browser.close()
}
