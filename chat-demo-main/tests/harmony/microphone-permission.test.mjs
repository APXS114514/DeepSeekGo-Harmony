import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from './support.mjs'

// 使用实际 ArkTS 授权逻辑，替换平台模块以检查弹窗、系统权限和持久化之间的交互。
const mocks = `
const GRANTED = 0
const DENIED = -1
export const system = {
  granted: true,
  nextGrant: false,
  dialogShown: true,
  settingsGrant: false,
  checkFails: false,
  checks: 0,
  requests: 0,
  settings: 0,
}
export const consent = new Map()
export const ProtectedResourceType = { AUDIO_CAPTURE: 'audio', VIDEO_CAPTURE: 'video' }
const canIUse = () => true
const hilog = { warn() {} }
const bundleManager = {
  BundleFlag: { GET_BUNDLE_INFO_WITH_APPLICATION: 1 },
  getBundleInfoForSelfSync: () => ({ appInfo: { accessTokenId: 123 } }),
}
const abilityAccessCtrl = {
  GrantStatus: { PERMISSION_GRANTED: GRANTED },
  createAtManager: () => ({
    checkAccessTokenSync: () => {
      system.checks++
      if (system.checkFails) throw new Error('mock permission check failure')
      return system.granted ? GRANTED : DENIED
    },
    requestPermissionsFromUser: async () => {
      system.requests++
      system.granted = system.nextGrant
      return { authResults: [system.granted ? GRANTED : DENIED], dialogShownResults: [system.dialogShown] }
    },
    requestPermissionOnSetting: async () => {
      system.settings++
      system.granted = system.settingsGrant
      return [system.granted ? GRANTED : DENIED]
    },
  }),
}
const preferences = {
  getPreferencesSync: () => ({
    getSync: (key, defaultValue) => consent.get(key) ?? defaultValue,
    putSync: (key, value) => consent.set(key, value),
    flush: async () => {},
  }),
}
`

const work = await mkdtemp(join(tmpdir(), 'deepseek-microphone-test-'))
try {
  const native = await readFile(
    join(repoRoot, 'harmony/entry/src/main/ets/services/Microphone.ets'),
    'utf8'
  )
  const input = join(work, 'microphone.mts')
  await writeFile(input, mocks + native.replace(/^import .* from '@kit\.[^']+';\r?\n/gm, ''))
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
  const { WebMicrophonePermission, ProtectedResourceType, requestMicrophone, system, consent } =
    await import(pathToFileURL(join(work, 'microphone.mjs')).href)

  const origin = 'https://deepseek.local.invalid'
  const { AUDIO_CAPTURE, VIDEO_CAPTURE } = ProtectedResourceType
  const current = () => true
  const request = (source = origin, resources = [AUDIO_CAPTURE]) => ({
    outcomes: [],
    getOrigin: () => source,
    getAccessibleResource: () => resources,
    grant(allowed) {
      assert.deepEqual(allowed, [AUDIO_CAPTURE])
      this.outcomes.push('granted')
    },
    deny() {
      this.outcomes.push('denied')
    },
  })
  let confirmations = 0
  const accept = async () => {
    confirmations++
    return true
  }
  const web = new WebMicrophonePermission({}, origin, accept)
  const first = request()
  const second = request(origin + '/')
  await web.authorize(first, current)
  await web.authorize(second, current)
  assert.deepEqual(first.outcomes, ['granted'])
  assert.deepEqual(second.outcomes, ['granted'])
  assert.equal(confirmations, 1)
  assert.equal(system.checks, 2)
  assert.equal(system.requests, 0)
  assert.equal(consent.get(origin), true)

  // 重建页面仍复用同意。系统撤销后先恢复系统授权，站点同意不能绕过它。
  const reopened = new WebMicrophonePermission({}, origin, accept)
  system.granted = false
  const revoked = request()
  await reopened.authorize(revoked, current)
  assert.deepEqual(revoked.outcomes, ['denied'])
  assert.equal(system.requests, 1)
  assert.equal(confirmations, 1)
  system.dialogShown = false
  system.settingsGrant = true
  const restored = request()
  await reopened.authorize(restored, current)
  assert.deepEqual(restored.outcomes, ['granted'])
  assert.equal(system.requests, 2)
  assert.equal(system.settings, 1)
  assert.equal(confirmations, 1)

  // 未同意、请求页面失效或资源超出范围时，仍然需要有效的下一次授权。
  consent.clear()
  const decline = new WebMicrophonePermission({}, origin, async () => false)
  const declined = request()
  await decline.authorize(declined, current)
  assert.deepEqual(declined.outcomes, ['denied'])
  assert.equal(consent.has(origin), false)
  assert.equal(system.requests, 2)
  let allow
  let activePort = true
  const delayed = new WebMicrophonePermission(
    {},
    origin,
    () =>
      new Promise((resolve) => {
        allow = resolve
      })
  )
  const stale = request()
  const pending = delayed.authorize(stale, () => activePort)
  const duplicate = request()
  await delayed.authorize(duplicate, current)
  assert.deepEqual(duplicate.outcomes, ['denied'])
  activePort = false
  allow(true)
  await pending
  assert.deepEqual(stale.outcomes, ['denied'])
  assert.equal(consent.has(origin), false)
  const before = system.checks
  for (const invalid of [
    request('https://example.org'),
    request(origin, [AUDIO_CAPTURE, VIDEO_CAPTURE]),
  ]) {
    await web.authorize(invalid, current)
    assert.deepEqual(invalid.outcomes, ['denied'])
  }
  assert.equal(system.checks, before)
  system.granted = false
  system.nextGrant = true
  system.dialogShown = true
  const retried = request()
  await new WebMicrophonePermission({}, origin, accept).authorize(retried, current)
  assert.deepEqual(retried.outcomes, ['granted'])
  assert.equal(confirmations, 2)
  assert.equal(system.requests, 3)
  assert.equal(consent.get(origin), true)

  // 系统权限查询失败仍可由系统授权流程恢复。
  system.checkFails = true
  assert.equal(await requestMicrophone({}), true)
  assert.equal(system.requests, 4)
} finally {
  await rm(work, { recursive: true, force: true })
}
