import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from './support.mjs'

// 直接运行 LocationService.ets，替换平台模块验证模糊定位权限、前后台守卫、粗粒度脱敏和回退。
const mocks = `
const GRANTED = 0
const DENIED = -1
export const env = {
  supported: true,
  granted: false,
  nextGrant: false,
  dialogShown: true,
  settingsGrant: false,
  locationEnabled: true,
  geocoderAvailable: true,
  currentError: null,
  lastLocation: null,
  address: {
    countryCode: 'cn',
    countryName: '中国',
    administrativeArea: '浙江省',
    locality: '杭州市',
    subLocality: '西湖区',
    roadName: '文三路',
    placeName: '文三路 90 号',
    latitude: 30.2741,
    longitude: 120.1551,
  },
  onLocate: null,
  requests: 0,
  settings: 0,
  lastReverseLocale: '',
}
const canIUse = () => env.supported
const hilog = { warn() {} }
const bundleManager = {
  BundleFlag: { GET_BUNDLE_INFO_WITH_APPLICATION: 1 },
  getBundleInfoForSelfSync: () => ({ appInfo: { accessTokenId: 123 } }),
}
const abilityAccessCtrl = {
  GrantStatus: { PERMISSION_GRANTED: GRANTED },
  createAtManager: () => ({
    checkAccessTokenSync: () => (env.granted ? GRANTED : DENIED),
    requestPermissionsFromUser: async () => {
      env.requests++
      env.granted = env.nextGrant
      return {
        authResults: [env.granted ? GRANTED : DENIED],
        dialogShownResults: [env.dialogShown],
      }
    },
    requestPermissionOnSetting: async () => {
      env.settings++
      env.granted = env.settingsGrant
      return [env.granted ? GRANTED : DENIED]
    },
  }),
}
const geoLocationManager = {
  LocatingPriority: { PRIORITY_LOCATING_SPEED: 0x502 },
  isLocationEnabled: () => env.locationEnabled,
  isGeocoderAvailable: () => env.geocoderAvailable,
  getCurrentLocation: async () => {
    if (env.onLocate) env.onLocate()
    if (env.currentError) throw env.currentError
    return { latitude: 30.2741, longitude: 120.1551, timeStamp: Date.now() }
  },
  getLastLocation: () => {
    if (!env.lastLocation) throw { code: 3301200 }
    return env.lastLocation
  },
  getAddressesFromLocation: async (req) => {
    env.lastReverseLocale = req.locale ?? ''
    return env.address ? [env.address] : []
  },
}
`

const work = await mkdtemp(join(tmpdir(), 'deepseek-location-test-'))
try {
  const statusSrc = await readFile(
    join(repoRoot, 'harmony/entry/src/main/ets/services/DeviceStatus.ets'),
    'utf8'
  )
  const locationSrc = await readFile(
    join(repoRoot, 'harmony/entry/src/main/ets/services/LocationService.ets'),
    'utf8'
  )
  await writeFile(join(work, 'DeviceStatus.mts'), statusSrc)
  const input = join(work, 'location.mts')
  await writeFile(
    input,
    mocks +
      locationSrc
        .replace(/^import .* from '@kit\.[^']+';\r?\n/gm, '')
        .replace("from './DeviceStatus'", "from './DeviceStatus.mjs'")
  )
  execFileSync(process.execPath, [
    join(repoRoot, 'chat-demo-main/node_modules/typescript/bin/tsc'),
    '--ignoreConfig',
    '--noCheck',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    join(work, 'DeviceStatus.mts'),
    input,
  ])
  const { DeviceStatus } = await import(pathToFileURL(join(work, 'DeviceStatus.mjs')).href)
  const { LocationService, extractCoarseRegion, env } = await import(
    pathToFileURL(join(work, 'location.mjs')).href
  )

  // 1. 粗粒度脱敏：绝不暴露坐标、道路、门牌等精细字段。
  const coarse = extractCoarseRegion(env.address)
  assert.deepEqual(coarse, {
    countryCode: 'CN',
    countryName: '中国',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
  })
  assert.equal('latitude' in coarse, false)
  assert.equal('roadName' in coarse, false)
  assert.equal('placeName' in coarse, false)

  const service = new LocationService({})

  // 2. 后台调用立即取消，不触发系统权限弹窗。
  service.setForeground(false)
  const bg = await service.locate('zh-CN', true)
  assert.equal(bg.status, DeviceStatus.CANCELLED)
  assert.equal(env.requests, 0)
  service.setForeground(true)

  // 3. 聊天按需定位被拒且不弹系统设置二次弹窗；设置页主动开启才引导系统设置。
  env.granted = false
  env.nextGrant = false
  env.dialogShown = false
  const deniedChat = await service.locate('zh-CN', false)
  assert.equal(deniedChat.status, DeviceStatus.DENIED)
  assert.equal(env.requests, 1)
  assert.equal(env.settings, 0)

  env.settingsGrant = true
  const grantedSettings = await service.locate('en-US', true)
  assert.equal(grantedSettings.status, DeviceStatus.OK)
  assert.equal(env.settings, 1)
  assert.equal(env.lastReverseLocale, 'en')
  assert.deepEqual(JSON.parse(grantedSettings.value), {
    countryCode: 'CN',
    countryName: '中国',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
  })

  // 4. 定位中途退到后台时丢弃结果。
  env.onLocate = () => service.setForeground(false)
  const midBg = await service.locate('zh-CN', false)
  assert.equal(midBg.status, DeviceStatus.CANCELLED)
  env.onLocate = null
  service.setForeground(true)

  // 5. 系统定位总开关关闭返回 3301100；地理编码不可用返回 UNSUPPORTED。
  env.locationEnabled = false
  assert.equal((await service.locate('zh-CN', false)).status, 3301100)
  env.locationEnabled = true
  env.geocoderAvailable = false
  assert.equal((await service.locate('zh-CN', false)).status, DeviceStatus.UNSUPPORTED)
  env.geocoderAvailable = true

  // 6. 单次定位临时失败时，30 分钟内的缓存定位可回退，过期缓存不使用。
  env.currentError = { code: 3301200 }
  env.lastLocation = {
    latitude: 30.2741,
    longitude: 120.1551,
    timeStamp: Date.now() - 5 * 60 * 1000,
  }
  const fromRecent = await service.locate('zh-CN', false)
  assert.equal(fromRecent.status, DeviceStatus.OK)

  env.lastLocation = {
    latitude: 30.2741,
    longitude: 120.1551,
    timeStamp: Date.now() - 60 * 60 * 1000,
  }
  const fromStale = await service.locate('zh-CN', false)
  assert.equal(fromStale.status, DeviceStatus.FAILED)

  console.log('location-service: OK')
} finally {
  await rm(work, { recursive: true, force: true })
}
