import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import type { ChatModel, ThinkingEffort } from './api/types.js'
import { readDeviceApiKey, saveDeviceApiKey } from './harmony.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type VoiceInputMode = 'local' | 'api'
export type ReadAloudVoice = TtsVoice | 'local'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

export const OUTPUT_LIMITS = [8192, 32768, 65536, 131072, 393216] as const

export type GenerationOptions = {
  model: ChatModel
  readLinks: boolean
  effort: ThinkingEffort | null
  maxTokens: number | null
}

export const DEFAULT_GENERATION: GenerationOptions = {
  model: 'deepseek-flash',
  readLinks: true,
  effort: null,
  maxTokens: null,
}

/** 本机设置，鸿蒙端的 API Key 由系统资产服务保管。 */
type Settings = {
  apiKey: string | null
  apiKeyTemporary: boolean
  locale: Locale
  themePreference: ThemePreference
  accentColor: string | null
  immersiveLight: boolean
  hideComposerOnScroll: boolean
  location: UserLocation | null
  /** 鸿蒙版：按需在前台使用模糊定位（默认关闭，用户开启后生效） */
  autoLocation: boolean
  /** 结合城市与当地日期自动查询天气、活动和营业时间等本地信息 */
  autoLocalInfo: boolean
  /** 开启后由模型自行决定何时在回答中生成图表；关闭后仅在用户明确要求时生成 */
  proactiveCharts: boolean
  ttsVoice: ReadAloudVoice
  voiceInputMode: VoiceInputMode
  thinking: boolean
  search: boolean
  generation: GenerationOptions
  suggestedQuestions: boolean
  siderCollapsed: boolean
  /** 鸿蒙版：应用在后台时回答完成后发通知 */
  replyNotify: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  autoLocation: 'chat-demo:auto-location',
  autoLocalInfo: 'chat-demo:auto-local-info',
  proactiveCharts: 'chat-demo:proactive-charts',
  themePreference: 'chat-demo:theme-preference',
  accentColor: 'chat-demo:accent-color',
  immersiveLight: 'chat-demo:immersive-light',
  hideComposerOnScroll: 'chat-demo:hide-composer-on-scroll',
  ttsVoice: 'chat-demo:tts-voice',
  voiceInputMode: 'chat-demo:voice-input-mode',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  generation: 'chat-demo:generation',
  suggestedQuestions: 'chat-demo:suggested-questions',
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
    // 任何语言的用户都可以选择任意国家或地区，只有中国需要细化到省市。
    return normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 鸿蒙版默认主题色；未选择过主题色时使用 */
export const DEFAULT_ACCENT = '#66ccff'

export const normalizeAccentColor = (value: string): string | null => {
  const color = value.trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : null
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): ReadAloudVoice => {
  const saved = read(KEYS.ttsVoice)
  return saved === 'tide' || (__HARMONY_APP__ && saved === 'local') ? saved : 'stella'
}

const initialGeneration = (): GenerationOptions => {
  try {
    const saved = JSON.parse(read(KEYS.generation) ?? 'null')
    const effort = saved?.effort
    return {
      model: saved?.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : DEFAULT_GENERATION.model,
      readLinks: saved?.readLinks !== false,
      effort: effort === 'low' || effort === 'high' || effort === 'max' ? effort : null,
      maxTokens: OUTPUT_LIMITS.find((limit) => limit === saved?.maxTokens) ?? null,
    }
  } catch {
    return DEFAULT_GENERATION
  }
}

export const useSettings = create<Settings>(() => ({
  apiKey: __HARMONY_APP__ ? null : read(KEYS.apiKey),
  apiKeyTemporary: false,
  locale: initialLocale(),
  // 鸿蒙版改由定位开关按需获取城市和行政区，不再使用旧版手动地区设置。
  location: __HARMONY_APP__ ? null : initialLocation(),
  autoLocation: read(KEYS.autoLocation) === 'true',
  autoLocalInfo: read(KEYS.autoLocalInfo) !== 'false',
  proactiveCharts: read(KEYS.proactiveCharts) !== 'false',
  themePreference: initialThemePreference(),
  accentColor: normalizeAccentColor(read(KEYS.accentColor) ?? ''),
  immersiveLight: read(KEYS.immersiveLight) !== 'false',
  hideComposerOnScroll: read(KEYS.hideComposerOnScroll) === 'true',
  ttsVoice: initialTtsVoice(),
  voiceInputMode: read(KEYS.voiceInputMode) === 'api' ? 'api' : 'local',
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  generation: initialGeneration(),
  suggestedQuestions: read(KEYS.suggestedQuestions) === 'true',
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

export const setAutoLocation = (autoLocation: boolean) => {
  write(KEYS.autoLocation, String(autoLocation))
  useSettings.setState({ autoLocation })
}

export const setAutoLocalInfo = (autoLocalInfo: boolean) => {
  write(KEYS.autoLocalInfo, String(autoLocalInfo))
  useSettings.setState({ autoLocalInfo })
}

export const setProactiveCharts = (proactiveCharts: boolean) => {
  write(KEYS.proactiveCharts, String(proactiveCharts))
  useSettings.setState({ proactiveCharts })
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

export const setHideComposerOnScroll = (hideComposerOnScroll: boolean) => {
  write(KEYS.hideComposerOnScroll, String(hideComposerOnScroll))
  useSettings.setState({ hideComposerOnScroll })
}

export const setVoiceInputMode = (voiceInputMode: VoiceInputMode) => {
  write(KEYS.voiceInputMode, voiceInputMode)
  useSettings.setState({ voiceInputMode })
}

export const setTtsVoice = (ttsVoice: ReadAloudVoice) => {
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

export const setGenerationOptions = (options: Partial<GenerationOptions>) => {
  const generation = { ...useSettings.getState().generation, ...options }
  write(KEYS.generation, JSON.stringify(generation))
  useSettings.setState({ generation })
}

export const setSuggestedQuestions = (suggestedQuestions: boolean) => {
  write(KEYS.suggestedQuestions, String(suggestedQuestions))
  useSettings.setState({ suggestedQuestions })
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
