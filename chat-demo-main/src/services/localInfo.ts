import { create } from 'zustand'
import { formatDate } from '../utils/format.js'
import {
  DeviceStatus,
  LOCATION_SWITCH_OFF,
  requestDeviceLocation,
  type CoarseDeviceLocation,
} from './harmony.js'
import {
  formatCoarseLocation,
  getUserLocationQuery,
  matchCityInText,
  type UserLocation,
} from './location.js'
import type { Locale } from './settings.js'

export type LocalInfoIntent =
  | 'weather'
  | 'events'
  | 'hours'
  | 'nearby'
  | 'route'
  | 'transit'
  | 'local'

export type LocationFallbackReason = 'denied' | 'switch_off' | 'unsupported' | 'failed'

export type ResolvedPlace = {
  /** 展示与发给模型的地名（仅限城市与行政区，不含精确坐标和街道）。 */
  label: string
  /** 用于结构化天气地名检索的城市词。 */
  query: string
  countryCode?: string
  admin?: string
  source: 'auto' | 'manual' | 'query'
}

export type LocalDataSource = {
  name: string
  url?: string
}

export type DailyWeatherDay = {
  date: string
  weekday: string
  weatherCode: number
  condition: string
  tempMax: number
  tempMin: number
  precipProb: number | null
  precipSum: number | null
}

export type StructuredWeatherData = {
  kind: 'weather_forecast'
  locationLabel: string
  timezone: string
  localDate: string
  current?: {
    temperature: number
    apparentTemperature: number | null
    weatherCode: number
    condition: string
    humidity: number | null
    windSpeed: number | null
  }
  daily: DailyWeatherDay[]
  source: LocalDataSource
  fetchedAt: string
}

export type StructuredLocalInfo = StructuredWeatherData

export type LocalInfoProviderCapability = {
  id: string
  intents: readonly LocalInfoIntent[]
  available: () => boolean
}

export interface LocalInfoProvider extends LocalInfoProviderCapability {
  lookup(params: {
    place: ResolvedPlace
    intent: LocalInfoIntent
    locale: Locale
    localDate: string
    signal: AbortSignal
  }): Promise<StructuredLocalInfo | null>
}

export type ReplyLocalContext = {
  locationLabel?: string
  locationSource?: 'auto' | 'manual' | 'query'
  locationFallback?: LocationFallbackReason
  intent?: LocalInfoIntent
  autoSearch?: boolean
  /** 提问涉及汇率等实时行情但未开启智能搜索时，提醒用户开启智能搜索。 */
  searchRecommended?: 'live_data'
  structuredSource?: LocalDataSource
  /** 仅附加到该轮请求用户消息末尾的上下文说明，保证历史前缀缓存稳定且不污染气泡展示。 */
  turnContext?: string
}

const DEVICE_LOCATION_TTL_MS = 5 * 60 * 1000
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000
const WEATHER_TIMEOUT_MS = 4500
const OPEN_METEO_SOURCE: LocalDataSource = { name: 'Open-Meteo', url: 'https://open-meteo.com/' }

type DeviceLocationState = {
  location: CoarseDeviceLocation | null
  updatedAt: number
  busy: boolean
  lastFallback: LocationFallbackReason | null
}

export const useDeviceLocationState = create<DeviceLocationState>(() => ({
  location: null,
  updatedAt: 0,
  busy: false,
  lastFallback: null,
}))

export const clearDeviceLocationCache = () => {
  useDeviceLocationState.setState({ location: null, updatedAt: 0, lastFallback: null })
}

const mapLocationFailure = (status: number): LocationFallbackReason => {
  if (status === DeviceStatus.denied) {
    return 'denied'
  }
  if (status === LOCATION_SWITCH_OFF) {
    return 'switch_off'
  }
  if (status === DeviceStatus.unsupported) {
    return 'unsupported'
  }
  return 'failed'
}

/** 仅在前台请求鸿蒙模糊定位，默认使用短时内存缓存避免连续追问重复定位。 */
export const resolveDeviceLocation = async ({
  locale,
  openSettings = false,
  forceRefresh = false,
}: {
  locale: Locale
  openSettings?: boolean
  forceRefresh?: boolean
}): Promise<{
  location: CoarseDeviceLocation | null
  fallback: LocationFallbackReason | null
  status: number
}> => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return { location: null, fallback: 'failed', status: DeviceStatus.cancelled }
  }
  const state = useDeviceLocationState.getState()
  if (!forceRefresh && state.location && Date.now() - state.updatedAt < DEVICE_LOCATION_TTL_MS) {
    return { location: state.location, fallback: null, status: DeviceStatus.ok }
  }
  useDeviceLocationState.setState({ busy: true })
  try {
    const result = await requestDeviceLocation({ locale, openSettings })
    if (result.status === DeviceStatus.ok && result.location) {
      useDeviceLocationState.setState({
        location: result.location,
        updatedAt: Date.now(),
        busy: false,
        lastFallback: null,
      })
      return { location: result.location, fallback: null, status: DeviceStatus.ok }
    }
    const fallback = mapLocationFailure(result.status)
    useDeviceLocationState.setState({ busy: false, lastFallback: fallback })
    return { location: null, fallback, status: result.status }
  } catch {
    useDeviceLocationState.setState({ busy: false, lastFallback: 'failed' })
    return { location: null, fallback: 'failed', status: DeviceStatus.failed }
  }
}

// ---------- 本地问题与图表意图识别 ----------

const SELF_LOCATION_RE =
  /我这里|我这儿|我这边|我这|这边|本地|当地|附近|周边|周围|离我最近|我附近|当前城市|所在城市|所在地区|\b(?:here|near me|nearby|around me|around here|my city|my area|my location|locally|local weather|local events?)\b/i

const WEATHER_RE =
  /天气|气温|温度|预报|下雨|降雨|降雪|下雪|空气质量|紫外线|穿什么|带伞|湿度|风力|台风|寒潮|升温|降温|\b(?:weather|forecast|temperature|rain|snow|humidity|uv index|wind|umbrella)\b/i

const MULTI_DAY_WEATHER_RE =
  /未来\s*\d*\s*天|这周|本周|下周|一周|七天|7天|5天|五天|三天|3天|逐日|几天|走势|变化|\b(?:weekly|next\s+\d+\s+days?|7[- ]?day|5[- ]?day|daily|forecast|this week|trend)\b/i

const EVENTS_RE =
  /活动|展览|展讯|演出|演唱会|音乐节|话剧|集市|市集|漫展|节庆|灯会|庙会|赛事|周末去哪|周末干嘛|好玩|\b(?:events?|concerts?|exhibitions?|festivals?|shows?|things to do)\b/i

const HOURS_RE =
  /营业时间|开放时间|几点开门|几点关门|几点营业|几点打烊|闭馆|开不开|营业吗|开门吗|关门时间|\b(?:opening hours|business hours|open now|closing time|what time does .* (?:open|close))\b/i

const NEARBY_RE = /附近|周边|周围|离我最近|我附近|\b(?:nearby|near me|around me|around here)\b/i

const ROUTE_RE =
  /路线|怎么去|怎么走|导航|自驾|步行多久|开车多久|\b(?:directions?|route to|how to get to)\b/i

const TRANSIT_RE =
  /实时公交|公交|地铁|首班车|末班车|换乘|几路车|轻轨|\b(?:live bus|transit|bus schedule|subway|metro)\b/i

const EXPLICIT_CHART_RE =
  /折线图|柱状图|条形图|面积图|饼图|环形图|图表|画(?:个|一张|出)?图|绘(?:制|图)|趋势图|对比图|可视化|\b(?:line chart|bar chart|area chart|pie chart|donut chart|chart|plot|graph|visuali[sz]e)\b/i

const LIVE_MARKET_DATA_RE =
  /汇率|外汇|兑人民币|兑美元|兑欧元|兑日元|兑港币|兑英镑|兑加元|金价|黄金价格|银价|油价|股价|股票价格|实时行情|币价|比特币价格|\b(?:exchange rates?|currency rates?|fx rates?|usd\s*(?:to|\/)\s*cny|cny\s*(?:to|\/)\s*usd|eur\s*(?:to|\/)\s*usd|jpy\s*(?:to|\/)\s*cny|gold price|stock price|share price|oil price|bitcoin price)\b/i

const DATA_FILE_RE = /\.(?:csv|tsv|xlsx|xls|json)$/i

const hasTabularOrSeriesData = (text: string): boolean => {
  if (/\|[^|\n]+\|[^|\n]+\|\s*\n\s*\|(?:\s*:?-+:?\s*\|)+/.test(text)) {
    return true
  }
  const numberTokens = text.match(
    /(?:^|[\s:：,，;；/(-])\d+(?:\.\d+)?(?:\s*(?:%|万|亿|元|美元|℃|°C|kg|km|GB|MB))?/g
  )
  return (numberTokens?.length ?? 0) >= 4 && /[:：,，\n\t|]/.test(text)
}

export type LocalQueryAnalysis = {
  needsSelfLocation: boolean
  explicitPlace: { query: string; label: string; countryCode?: string; admin?: string } | null
  intent: LocalInfoIntent | null
  explicitChartRequest: boolean
  wantsChart: boolean
  needsLiveWebData: boolean
}

export const analyzeLocalQuery = (
  text: string,
  locale: Locale,
  files: { name: string }[] = []
): LocalQueryAnalysis => {
  const trimmed = text.trim()
  const hasSelfReference = SELF_LOCATION_RE.test(trimmed)
  const explicitPlace = matchCityInText(trimmed, locale)

  let intent: LocalInfoIntent | null = null
  if (WEATHER_RE.test(trimmed)) {
    intent = 'weather'
  } else if (TRANSIT_RE.test(trimmed)) {
    intent = 'transit'
  } else if (ROUTE_RE.test(trimmed)) {
    intent = 'route'
  } else if (HOURS_RE.test(trimmed)) {
    intent = 'hours'
  } else if (EVENTS_RE.test(trimmed)) {
    intent = 'events'
  } else if (NEARBY_RE.test(trimmed)) {
    intent = 'nearby'
  } else if (hasSelfReference) {
    intent = 'local'
  }

  // 用户明确提及其他城市且未提「我这里/附近」时，不触发本机定位。
  const needsSelfLocation =
    hasSelfReference ||
    (!explicitPlace && (intent === 'weather' || intent === 'nearby' || intent === 'transit'))

  const explicitChartRequest = EXPLICIT_CHART_RE.test(trimmed)
  const wantsChart =
    explicitChartRequest ||
    (intent === 'weather' && MULTI_DAY_WEATHER_RE.test(trimmed)) ||
    hasTabularOrSeriesData(trimmed) ||
    files.some((file) => DATA_FILE_RE.test(file.name))

  const needsLiveWebData = LIVE_MARKET_DATA_RE.test(trimmed)

  return {
    needsSelfLocation,
    explicitPlace,
    intent,
    explicitChartRequest,
    wantsChart,
    needsLiveWebData,
  }
}

// ---------- WMO 天气代码与 Open-Meteo 结构化天气查询 ----------

const describeWmoCode = (code: number, locale: Locale): string => {
  const zh: Record<number, string> = {
    0: '晴',
    1: '大部晴朗',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '冻雾',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '浓毛毛雨',
    56: '轻冻雨',
    57: '冻雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '轻冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小阵雨',
    81: '中阵雨',
    82: '强阵雨',
    85: '小阵雪',
    86: '强阵雪',
    95: '雷阵雨',
    96: '雷阵雨伴小冰雹',
    99: '雷阵雨伴冰雹',
  }
  const en: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Freezing drizzle',
    61: 'Light rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers',
    81: 'Showers',
    82: 'Heavy showers',
    85: 'Light snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Severe thunderstorm with hail',
  }
  return (locale === 'zh-CN' ? zh[code] : en[code]) ?? (locale === 'zh-CN' ? '未知' : 'Unknown')
}

const fetchJsonWithTimeout = async <T>(url: string, signal: AbortSignal): Promise<T | null> => {
  const timeoutController = new AbortController()
  const onAbort = () => timeoutController.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => timeoutController.abort(), WEATHER_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: timeoutController.signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

type GeocodeResult = {
  name?: string
  country_code?: string
  admin1?: string
  latitude?: number
  longitude?: number
}

type OpenMeteoForecast = {
  timezone?: string
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: (number | null)[]
    precipitation_sum?: (number | null)[]
  }
}

const weatherCache = new Map<string, { expiresAt: number; data: StructuredWeatherData }>()

export const clearLocalInfoCache = () => {
  weatherCache.clear()
}

const normalizeGeocodeQuery = (query: string) =>
  query.replace(/(?:市|区|县|省|自治区|特别行政区)$/, '').trim() || query.trim()

const pickGeocodeCandidate = (
  results: GeocodeResult[],
  countryCode?: string,
  admin?: string
): GeocodeResult | undefined => {
  const valid = results.filter(
    (item) => typeof item.latitude === 'number' && typeof item.longitude === 'number'
  )
  if (valid.length === 0) {
    return undefined
  }
  const byCountry = countryCode
    ? valid.filter((item) => item.country_code?.toUpperCase() === countryCode.toUpperCase())
    : valid
  const pool = byCountry.length > 0 ? byCountry : valid
  if (admin) {
    const stem = admin.replace(/(?:省|市|自治区|特别行政区)$/, '')
    const matched = pool.find(
      (item) => item.admin1 && (item.admin1.includes(stem) || stem.includes(item.admin1))
    )
    if (matched) {
      return matched
    }
  }
  return pool[0]
}

const formatWeekdayFromIso = (isoDate: string, locale: Locale): string => {
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return isoDate
  }
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
}

const openMeteoWeatherProvider: LocalInfoProvider = {
  id: 'open-meteo-weather',
  intents: ['weather'],
  available: () => true,
  async lookup({ place, locale, localDate, signal }) {
    const searchName = normalizeGeocodeQuery(place.query)
    if (!searchName) {
      return null
    }
    const cacheKey = `${searchName.toLowerCase()}|${place.countryCode ?? ''}|${locale}|${localDate}`
    const cached = weatherCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }
    const lang = locale === 'zh-CN' ? 'zh' : 'en'
    const geocodeUrl =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchName)}` +
      `&count=5&language=${lang}&format=json`
    const geo = await fetchJsonWithTimeout<{ results?: GeocodeResult[] }>(geocodeUrl, signal)
    const candidate = pickGeocodeCandidate(geo?.results ?? [], place.countryCode, place.admin)
    if (!candidate || candidate.latitude === undefined || candidate.longitude === undefined) {
      return null
    }
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${candidate.latitude}&longitude=${candidate.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' +
      '&timezone=auto&forecast_days=7'
    const forecast = await fetchJsonWithTimeout<OpenMeteoForecast>(forecastUrl, signal)
    if (!forecast?.daily) {
      return null
    }
    const times = forecast.daily.time
    const maxTemps = forecast.daily.temperature_2m_max
    const minTemps = forecast.daily.temperature_2m_min
    const codes = forecast.daily.weather_code
    if (
      !Array.isArray(times) ||
      !Array.isArray(maxTemps) ||
      !Array.isArray(minTemps) ||
      !Array.isArray(codes) ||
      times.length === 0
    ) {
      return null
    }
    const precipProbs = forecast.daily.precipitation_probability_max ?? []
    const precipSums = forecast.daily.precipitation_sum ?? []
    const daily: DailyWeatherDay[] = []
    for (let i = 0; i < times.length; i++) {
      const date = times[i]
      const tempMax = maxTemps[i]
      const tempMin = minTemps[i]
      const weatherCode = codes[i]
      if (
        typeof date !== 'string' ||
        typeof tempMax !== 'number' ||
        typeof tempMin !== 'number' ||
        typeof weatherCode !== 'number'
      ) {
        continue
      }
      daily.push({
        date,
        weekday: formatWeekdayFromIso(date, locale),
        weatherCode,
        condition: describeWmoCode(weatherCode, locale),
        tempMax: Math.round(tempMax * 10) / 10,
        tempMin: Math.round(tempMin * 10) / 10,
        precipProb:
          typeof precipProbs[i] === 'number' ? Math.round(precipProbs[i] as number) : null,
        precipSum:
          typeof precipSums[i] === 'number'
            ? Math.round((precipSums[i] as number) * 10) / 10
            : null,
      })
    }
    if (daily.length === 0) {
      return null
    }
    const current =
      forecast.current && typeof forecast.current.temperature_2m === 'number'
        ? {
            temperature: Math.round(forecast.current.temperature_2m * 10) / 10,
            apparentTemperature:
              typeof forecast.current.apparent_temperature === 'number'
                ? Math.round(forecast.current.apparent_temperature * 10) / 10
                : null,
            weatherCode: forecast.current.weather_code ?? 0,
            condition: describeWmoCode(forecast.current.weather_code ?? 0, locale),
            humidity:
              typeof forecast.current.relative_humidity_2m === 'number'
                ? Math.round(forecast.current.relative_humidity_2m)
                : null,
            windSpeed:
              typeof forecast.current.wind_speed_10m === 'number'
                ? Math.round(forecast.current.wind_speed_10m * 10) / 10
                : null,
          }
        : undefined
    const data: StructuredWeatherData = {
      kind: 'weather_forecast',
      locationLabel: place.label || candidate.name || searchName,
      timezone: forecast.timezone ?? 'auto',
      localDate,
      current,
      daily,
      source: OPEN_METEO_SOURCE,
      fetchedAt: new Date().toISOString(),
    }
    weatherCache.set(cacheKey, { expiresAt: Date.now() + WEATHER_CACHE_TTL_MS, data })
    return data
  },
}

const providers: LocalInfoProvider[] = [openMeteoWeatherProvider]

/** 注册可扩展的本地信息数据源（如后续接入地图地点、路线与实时公交服务）。 */
export const registerLocalInfoProvider = (provider: LocalInfoProvider) => {
  const index = providers.findIndex((item) => item.id === provider.id)
  if (index >= 0) {
    providers[index] = provider
  } else {
    providers.push(provider)
  }
}

export const getLocalInfoCapabilities = (): LocalInfoProviderCapability[] =>
  providers.map(({ id, intents, available }) => ({ id, intents, available }))

// ---------- 图表格式指引与单轮本地上下文拼装 ----------

export const getProactiveChartSystemPrompt = (locale: Locale): string =>
  locale === 'zh-CN'
    ? [
        '## 主动数据图表',
        '当回答包含 3 个及以上可对比的数值趋势、周期变化（如近日天气、近期汇率、价格/营收对比、构成占比）或用户提供的一组数据时，自主判断是否用 ```chart 代码块附带交互图表；普通问答或单点数值不要画图，流程图/时序图/架构图继续使用 ```mermaid。',
        'JSON 结构：{"type":"line|bar|area|pie","title":"标题","unit":"单位","categories":["项1","项2","项3"],"series":[{"name":"系列名","values":[10,20,15]}],"metrics":[{"label":"指标名","value":"20","detail":"说明"}],"note":"统计口径说明","sources":[{"name":"来源名","url":"https://..."}]}',
        '原则：必须使用用户提供、结构化天气或联网搜索查到的真实数值，严禁编造实时汇率或行情数据；若未开启智能搜索导致无法获取最新实时数据，请明确提醒用户开启「智能搜索」。附带简明的 metrics、note 和 sources。',
      ].join('\n')
    : [
        '## Proactive data charts',
        'When your answer covers 3 or more comparable numeric points (such as multi-day weather, recent exchange rates, rankings, trends, proportions, or user-provided data), decide on your own whether to include an interactive ```chart JSON block. Skip charts for plain prose or single values, and keep flowcharts/sequence diagrams in ```mermaid.',
        'JSON schema: {"type":"line|bar|area|pie","title":"Title","unit":"Unit","categories":["A","B","C"],"series":[{"name":"Series","values":[10,20,15]}],"metrics":[{"label":"Metric","value":"20","detail":"Note"}],"note":"Calculation note","sources":[{"name":"Source","url":"https://..."}]}',
        'Rules: Only chart real data from the user, structured weather data, or web search results—never fabricate live exchange rates or market prices. If web search is off and recent real-time data is needed, clearly tell the user that Web Search is currently off. Include concise metrics, note, and sources.',
      ].join('\n')

export const getChartFormatGuide = (locale: Locale): string =>
  locale === 'zh-CN'
    ? [
        '【图表输出规范】',
        '用户要求展示图表，请使用 ```chart 代码块输出合法 JSON（流程、时序、架构图请继续使用 ```mermaid）：',
        '{"type":"line|bar|area|pie","title":"标题","unit":"单位","categories":["项1","项2"],"series":[{"name":"系列名","values":[10,20]}],"metrics":[{"label":"指标名","value":"20","detail":"说明"}],"note":"统计口径说明","sources":[{"name":"来源名","url":"https://..."}]}',
        '要求：提供简明的 metrics 摘要指标、note 统计口径和 sources 来源（无外部链接时可只写 name），严禁编造实时数据。',
      ].join('\n')
    : [
        '[Chart format]',
        'The user asked for a chart. Output valid JSON in a ```chart code block (keep flowcharts and sequence diagrams in ```mermaid):',
        '{"type":"line|bar|area|pie","title":"Title","unit":"Unit","categories":["A","B"],"series":[{"name":"Series","values":[10,20]}],"metrics":[{"label":"Metric","value":"20","detail":"Note"}],"note":"Calculation note","sources":[{"name":"Source","url":"https://..."}]}',
        'Include concise summary metrics, calculation notes in `note`, and `sources` (omit `url` if no link applies). Never fabricate real-time numbers.',
      ].join('\n')

const getLiveSearchOffNotice = (locale: Locale): string =>
  locale === 'zh-CN'
    ? '【联网提示】当前未开启「智能搜索」，无法获取最新汇率或实时行情数据。请在回答中明确提醒用户当前未开启智能搜索，不要编造近期数值或走势图，并建议开启智能搜索后再查询。'
    : '[Web search notice] Web Search is currently off, so live exchange rates or recent market quotes cannot be fetched. Clearly inform the user that Web Search is off, do not fabricate recent values or charts, and suggest enabling Web Search.'

const formatStructuredWeatherPrompt = (
  weather: StructuredWeatherData,
  locale: Locale,
  allowChart: boolean
): string => {
  const lines: string[] = []
  if (locale === 'zh-CN') {
    lines.push(
      `【本地结构化天气数据】城市/区域：${weather.locationLabel}；当地日期：${weather.localDate}；时区：${weather.timezone}；数据来源：${weather.source.name}${weather.source.url ? ` (${weather.source.url})` : ''}`
    )
    if (weather.current) {
      const parts = [
        `${weather.current.condition}`,
        `气温 ${weather.current.temperature}°C`,
        ...(weather.current.apparentTemperature !== null
          ? [`体感 ${weather.current.apparentTemperature}°C`]
          : []),
        ...(weather.current.humidity !== null ? [`湿度 ${weather.current.humidity}%`] : []),
        ...(weather.current.windSpeed !== null ? [`风速 ${weather.current.windSpeed} km/h`] : []),
      ]
      lines.push(`当前实况：${parts.join('，')}`)
    }
    lines.push('逐日预报：')
    for (const day of weather.daily) {
      const rain =
        day.precipProb !== null
          ? `，降水概率 ${day.precipProb}%${day.precipSum ? `（${day.precipSum}mm）` : ''}`
          : ''
      lines.push(
        `- ${day.date}（${day.weekday}）：${day.condition}，${day.tempMin}°C ~ ${day.tempMax}°C${rain}`
      )
    }
    lines.push(
      allowChart
        ? '请在回答中基于上述数据作答并标明来源；若涉及近日或多日天气趋势，可附带一个 ```chart 折线图。'
        : '请在回答中基于上述数据作答并标明来源。'
    )
  } else {
    lines.push(
      `[Structured local weather] Area: ${weather.locationLabel}; Local date: ${weather.localDate}; Timezone: ${weather.timezone}; Source: ${weather.source.name}${weather.source.url ? ` (${weather.source.url})` : ''}`
    )
    if (weather.current) {
      const parts = [
        weather.current.condition,
        `${weather.current.temperature}°C`,
        ...(weather.current.apparentTemperature !== null
          ? [`feels like ${weather.current.apparentTemperature}°C`]
          : []),
        ...(weather.current.humidity !== null ? [`humidity ${weather.current.humidity}%`] : []),
        ...(weather.current.windSpeed !== null ? [`wind ${weather.current.windSpeed} km/h`] : []),
      ]
      lines.push(`Current: ${parts.join(', ')}`)
    }
    lines.push('Daily forecast:')
    for (const day of weather.daily) {
      const rain =
        day.precipProb !== null
          ? `, precip ${day.precipProb}%${day.precipSum ? ` (${day.precipSum}mm)` : ''}`
          : ''
      lines.push(
        `- ${day.date} (${day.weekday}): ${day.condition}, ${day.tempMin}°C to ${day.tempMax}°C${rain}`
      )
    }
    lines.push(
      allowChart
        ? 'Answer using this data and cite the source. Include a ```chart line chart when showing multi-day forecasts.'
        : 'Answer using this data and cite the source.'
    )
  }
  return lines.join('\n')
}

const formatLocalLookupGuidance = (
  place: ResolvedPlace | null,
  intent: LocalInfoIntent,
  localDate: string,
  locale: Locale
): string => {
  const area = place?.label || (locale === 'zh-CN' ? '未指定地区' : 'unspecified area')
  const isMapOrTransit = intent === 'nearby' || intent === 'route' || intent === 'transit'
  if (locale === 'zh-CN') {
    const parts = [
      `【本地信息查询上下文】地区：${area}；当地日期：${localDate}。请结合该城市和当地日期查询最新信息，并在回答中标明信息来源。`,
    ]
    if (isMapOrTransit) {
      parts.push(
        '若缺少实时地图或公交接口数据，请基于公开网页结果说明，并如实提示实时路况或到站时间需以地图/交通应用为准。'
      )
    }
    return parts.join('\n')
  }
  const parts = [
    `[Local lookup context] Area: ${area}; Local date: ${localDate}. Use this city and local date when searching and cite your sources in the answer.`,
  ]
  if (isMapOrTransit) {
    parts.push(
      'If live map or transit API data is unavailable, rely on web results and note that real-time routing or arrivals should be checked in a map or transit app.'
    )
  }
  return parts.join('\n')
}

export type TurnLocalPreparation = {
  locationOverride: string | null
  autoSearch: boolean
  localContext?: ReplyLocalContext
}

/**
 * 每轮发送前的本地信息协调：
 * 1. 按需在前台调用鸿蒙模糊定位（仅取城市与行政区），未授权或失败时回退手动地区；
 * 2. 结合城市与当地日期查询结构化天气，或按需启用联网搜索查询活动、营业时间与本地信息；
 * 3. 在数据展示/图表问题或多日天气预报时，补充 ```chart 输出规范。
 */
export const prepareTurnLocalContext = async ({
  text,
  files,
  locale,
  manualLocation,
  autoLocation,
  autoLocalInfo,
  proactiveCharts,
  deviceLocationSupported,
  searchAlreadyOn,
  signal,
  now = new Date(),
}: {
  text: string
  files: { name: string }[]
  locale: Locale
  manualLocation: UserLocation | null
  autoLocation: boolean
  autoLocalInfo: boolean
  proactiveCharts: boolean
  deviceLocationSupported: boolean
  searchAlreadyOn: boolean
  signal: AbortSignal
  now?: Date
}): Promise<TurnLocalPreparation> => {
  const analysis = analyzeLocalQuery(text, locale, files)
  const localDate = formatDate(now) ?? now.toISOString().slice(0, 10)
  let place: ResolvedPlace | null = null
  let locationOverride: string | null = null
  let locationFallback: LocationFallbackReason | undefined

  if (
    analysis.needsSelfLocation &&
    autoLocation &&
    __HARMONY_APP__ &&
    deviceLocationSupported &&
    (typeof document === 'undefined' || document.visibilityState === 'visible')
  ) {
    const resolved = await resolveDeviceLocation({ locale })
    signal.throwIfAborted()
    if (resolved.location) {
      const label = formatCoarseLocation(resolved.location, locale)
      if (label) {
        locationOverride = label
        place = {
          label,
          query:
            resolved.location.city ||
            resolved.location.district ||
            resolved.location.province ||
            label,
          countryCode: resolved.location.countryCode || undefined,
          admin: resolved.location.province || undefined,
          source: 'auto',
        }
      }
    } else if (resolved.fallback) {
      locationFallback = resolved.fallback
    }
  }

  if (!place && analysis.explicitPlace) {
    place = { ...analysis.explicitPlace, source: 'query' }
  }

  if (!place && manualLocation) {
    const manual = getUserLocationQuery(manualLocation, locale)
    if (manual) {
      place = { ...manual, source: 'manual' }
    }
  }

  // 安全守卫：带附件或长文本时不自动开启联网搜索，避免触发 32K 工具输入限制。
  const safeForAutoLookup = files.length === 0 && text.length < 12_000
  let structured: StructuredLocalInfo | null = null
  let autoSearch = false

  if (autoLocalInfo && analysis.intent && safeForAutoLookup) {
    if (place?.query) {
      for (const provider of providers) {
        if (provider.intents.includes(analysis.intent) && provider.available()) {
          structured = await provider.lookup({
            place,
            intent: analysis.intent,
            locale,
            localDate,
            signal,
          })
          signal.throwIfAborted()
          if (structured) {
            break
          }
        }
      }
    }
    if (
      !structured &&
      !searchAlreadyOn &&
      (place !== null ||
        analysis.intent === 'events' ||
        analysis.intent === 'hours' ||
        analysis.intent === 'weather')
    ) {
      autoSearch = true
    }
  }

  const searchRecommended =
    analysis.needsLiveWebData && !searchAlreadyOn && !autoSearch
      ? ('live_data' as const)
      : undefined

  const promptParts: string[] = []
  if (structured) {
    promptParts.push(
      formatStructuredWeatherPrompt(
        structured,
        locale,
        proactiveCharts || analysis.explicitChartRequest
      )
    )
  } else if (autoLocalInfo && analysis.intent && (autoSearch || searchAlreadyOn || place)) {
    promptParts.push(formatLocalLookupGuidance(place, analysis.intent, localDate, locale))
  }
  if (searchRecommended) {
    promptParts.push(getLiveSearchOffNotice(locale))
  }
  // 主动模式下图表规范已写入会话 system（保住前缀缓存）；按需模式仅在用户明确提出画图时附带规范。
  if (!proactiveCharts && analysis.explicitChartRequest) {
    promptParts.push(getChartFormatGuide(locale))
  }

  const turnContext = promptParts.length > 0 ? promptParts.join('\n\n') : undefined
  const hasMetadata = Boolean(
    locationOverride ||
    locationFallback ||
    structured ||
    autoSearch ||
    searchRecommended ||
    turnContext
  )

  return {
    locationOverride,
    autoSearch,
    localContext: hasMetadata
      ? {
          ...(place ? { locationLabel: place.label, locationSource: place.source } : {}),
          ...(locationFallback ? { locationFallback } : {}),
          ...(analysis.intent ? { intent: analysis.intent } : {}),
          ...(autoSearch ? { autoSearch: true } : {}),
          ...(searchRecommended ? { searchRecommended } : {}),
          ...(structured ? { structuredSource: structured.source } : {}),
          ...(turnContext ? { turnContext } : {}),
        }
      : undefined,
  }
}
