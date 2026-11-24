import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { repoRoot } from './support.mjs'

const entry = join(repoRoot, 'harmony/entry/src/main')
const ability = await readFile(join(entry, 'ets/entryability/EntryAbility.ets'), 'utf8')
const work = await mkdtemp(join(tmpdir(), 'deepseek-orientation-test-'))
let outputText
try {
  const input = join(work, 'entry-ability.cts')
  await writeFile(input, ability.replace(/^import .*;\r?\n/gm, ''))
  execFileSync(process.execPath, [
    join(repoRoot, 'chat-demo-main/node_modules/typescript/bin/tsc'),
    '--ignoreConfig',
    '--noCheck',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    input,
  ])
  outputText = await readFile(join(work, 'entry-ability.cjs'), 'utf8')
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
