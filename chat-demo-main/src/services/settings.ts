import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { readDeviceApiKey, saveDeviceApiKey } from './harmony.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，鸿蒙端的 API Key 由系统资产服务保管。 */
type Settings = {
  apiKey: string | null
  apiKeyTemporary: boolean
  locale: Locale
  themePreference: ThemePreference
  accentColor: string | null
  immersiveLight: boolean
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 鸿蒙版：应用在后台时回答完成后发通知 */
  replyNotify: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  accentColor: 'chat-demo:accent-color',
  immersiveLight: 'chat-demo:immersive-light',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  replyNotify: 'chat-demo:reply-notify',
  replyNotifyAsked: 'chat-demo:reply-notify-asked',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

export const normalizeAccentColor = (value: string): string | null => {
  const color = value.trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : null
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

export const useSettings = create<Settings>(() => ({
  apiKey: __HARMONY_APP__ ? null : read(KEYS.apiKey),
  apiKeyTemporary: false,
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  accentColor: normalizeAccentColor(read(KEYS.accentColor) ?? ''),
  immersiveLight: read(KEYS.immersiveLight) !== 'false',
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  replyNotify: read(KEYS.replyNotify) !== 'false',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setAccentColor = (value: string | null) => {
  const accentColor = value === null ? null : normalizeAccentColor(value)
  if (value !== null && accentColor === null) {
    return
  }
  write(KEYS.accentColor, accentColor)
  useSettings.setState({ accentColor })
}

export const setImmersiveLight = (immersiveLight: boolean) => {
  write(KEYS.immersiveLight, String(immersiveLight))
  useSettings.setState({ immersiveLight })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const loadDeviceApiKey = async () => {
  const apiKey = await readDeviceApiKey()
  if (apiKey && !useSettings.getState().apiKey) {
    useSettings.setState({ apiKey })
  }
}

export const setApiKeyForSession = (apiKey: string) => {
  useSettings.setState({ apiKey, apiKeyTemporary: true })
}

export const setApiKey = async (apiKey: string | null): Promise<string | null> => {
  if (__HARMONY_APP__) {
    const error = await saveDeviceApiKey(apiKey)
    if (error !== null) {
      return error
    }
  } else {
    write(KEYS.apiKey, apiKey)
  }
  useSettings.setState({ apiKey, apiKeyTemporary: false })
  return null
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

export const setReplyNotify = (replyNotify: boolean) => {
  write(KEYS.replyNotify, String(replyNotify))
  useSettings.setState({ replyNotify })
}

/** 首次生成回答时请求一次通知授权，之后由设置里的开关重新请求。 */
export const takeReplyNotifyPrompt = (): boolean => {
  if (read(KEYS.replyNotifyAsked) === 'true') {
    return false
  }
  write(KEYS.replyNotifyAsked, 'true')
  return true
}
