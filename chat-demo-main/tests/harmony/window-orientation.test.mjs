import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { repoRoot } from './support.mjs'

const entry = join(repoRoot, 'harmony/entry/src/main')
const ability = await readFile(join(entry, 'ets/entryability/EntryAbility.ets'), 'utf8')
const page = await readFile(join(entry, 'ets/pages/Index.ets'), 'utf8')
const fold = await readFile(join(entry, 'ets/window/FoldHover.ets'), 'utf8')
// FoldSplitContainer 强制将内屏切到不受系统锁定约束的 AUTO_ROTATION。
assert.doesNotMatch(page + fold, /\bFoldSplitContainer\b/)
const work = await mkdtemp(join(tmpdir(), 'deepseek-orientation-test-'))
let outputText
let foldOutput
try {
  const input = join(work, 'entry-ability.cts')
  const foldInput = join(work, 'fold-hover.cts')
  await writeFile(input, ability.replace(/^import .*;\r?\n/gm, ''))
  await writeFile(foldInput, fold.replace(/^import .*;\r?\n/gm, ''))
  execFileSync(process.execPath, [
    join(repoRoot, 'chat-demo-main/node_modules/typescript/bin/tsc'),
    '--ignoreConfig',
    '--noCheck',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    input,
    foldInput,
  ])
  outputText = await readFile(join(work, 'entry-ability.cjs'), 'utf8')
  foldOutput = await readFile(join(work, 'fold-hover.cjs'), 'utf8')
} finally {
  await rm(work, { recursive: true, force: true })
}

// 从实际的 Ability 窗口入口检查方向配置，系统锁定与传感器的行为由真机验证。
const startWindow = async (deviceType, isFoldable) => {
  const events = []
  const warnings = []
  const exports = {}
  runInNewContext(outputText, {
    exports,
    UIAbility: class {
      context = { config: {} }
    },
    deviceInfo: { deviceType },
    display: { isFoldable },
    window: { Orientation: { AUTO_ROTATION_RESTRICTED: 'auto_rotation_restricted' } },
    WindowPrivacy: { instance: { attach: async () => {} } },
    systemBarProperties: () => ({}),
    ConfigurationConstant: { ColorMode: { COLOR_MODE_DARK: 0 } },
    hilog: { warn: (_domain, _tag, _message, code) => warnings.push(code) },
  })
  const mainWindow = {
    setPreferredOrientation: async (orientation) => events.push(orientation),
    setWindowLayoutFullScreen: async () => events.push('full-screen'),
    setWindowSystemBarProperties: async () => events.push('system-bars'),
  }
  await new exports.default().onWindowStageCreate({
    getMainWindowSync: () => mainWindow,
    loadContent: (page) => events.push(page),
  })
  return { events, warnings }
}

const foldable = await startWindow('phone', () => true)
assert.deepEqual(foldable.events, ['full-screen', 'system-bars', 'pages/Index'])
assert.deepEqual(foldable.warnings, [])

const manifest = JSON.parse(await readFile(join(entry, 'module.json5'), 'utf8'))
assert.equal(
  manifest.module.abilities.find((item) => item.name === 'EntryAbility').orientation,
  'follow_desktop'
)

for (const deviceType of ['phone', 'tablet']) {
  const regular = await startWindow(deviceType, () => false)
  assert.deepEqual(regular.events, [
    'auto_rotation_restricted',
    'full-screen',
    'system-bars',
    'pages/Index',
  ])
  assert.deepEqual(regular.warnings, [])
}

const unavailable = await startWindow('phone', () => {
  throw Object.assign(new Error('Display service unavailable'), { code: 1400003 })
})
assert.deepEqual(unavailable.events, foldable.events)
assert.deepEqual(unavailable.warnings, [1400003])

const desktop = await startWindow('2in1', () => assert.fail('2in1 queried foldability'))
assert.deepEqual(desktop.events, ['system-bars', 'pages/Index'])
assert.deepEqual(desktop.warnings, [])

const foldExports = {}
const screen = { id: 0, width: 1600, height: 1000, rotation: 1 }
const windowRect = { width: 1600, height: 1000 }
const nativeDevice = { sdkApiVersion: 26 }
const nativeDisplay = {
  FoldStatus: { FOLD_STATUS_HALF_FOLDED: 'half' },
  getFoldStatus: () => 'half',
  getDisplayByIdSync: (id) => {
    assert.equal(id, screen.id)
    return screen
  },
  getCurrentFoldCreaseRegion: () => ({
    displayId: screen.id,
    creaseRects: [{ left: 450, top: 0, width: 40, height: 1600 }],
  }),
}
runInNewContext(foldOutput, {
  exports: foldExports,
  display: nativeDisplay,
  window: { WindowStatusType: { FULL_SCREEN: 'full' } },
  deviceInfo: nativeDevice,
  canIUse: () => true,
})
const hoverWindow = {
  getWindowStatus: () => 'full',
  getWindowProperties: () => ({ windowRect, displayId: 0 }),
}
const readFold = () => {
  const bounds = foldExports.readFoldBounds(hoverWindow, { px2vp: (px) => px / 2 })
  return bounds ? { upper: bounds.upper, lower: bounds.lower } : null
}
screen.getLiveCreaseRegion = () => ({
  displayId: screen.id,
  creaseRects: [{ left: 0, top: 460, width: 1600, height: 40 }],
})
assert.deepEqual(readFold(), { upper: 230, lower: 250 })
hoverWindow.getWindowStatus = () => 'floating'
assert.equal(readFold(), null)
hoverWindow.getWindowStatus = () => 'full'
nativeDisplay.getFoldStatus = () => 'expanded'
assert.equal(readFold(), null)
nativeDisplay.getFoldStatus = () => 'half'
windowRect.height = 800
assert.equal(readFold(), null)
windowRect.height = 1000

nativeDevice.sdkApiVersion = 12
screen.getLiveCreaseRegion = () => assert.fail('API 12 queried live crease geometry')
assert.deepEqual(readFold(), { upper: 225, lower: 245 })
screen.rotation = 3
assert.deepEqual(readFold(), { upper: 255, lower: 275 })
screen.rotation = 0
assert.equal(readFold(), null)

nativeDevice.sdkApiVersion = 26
screen.rotation = 1
screen.getLiveCreaseRegion = () => {
  throw new Error('Live crease unavailable')
}
assert.deepEqual(readFold(), { upper: 225, lower: 245 })
