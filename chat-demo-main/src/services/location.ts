import { cityNames, regionCodes, regionNameOverrides, provinceNames } from './locationData.js'

export { regionCodes } from './locationData.js'

export const provinces = Object.entries(provinceNames).map(([code, name]) => ({
  code,
  name,
  cities: Object.entries(cityNames)
    .filter(([city]) => city.startsWith(code.slice(0, 2)))
    .map(([code, name]) => ({ code, name })),
}))

export type UserLocation = {
  region: string
  province?: string
  city?: string
}

export type CoarseLocation = {
  countryCode: string
  countryName: string
  province: string
  city: string
  district: string
}

const regions = new Set(regionCodes)
const regionNames = {
  'zh-CN': new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  'en-US': new Intl.DisplayNames(['en-US'], { type: 'region' }),
}

export const getRegionName = (code: string, locale: 'zh-CN' | 'en-US'): string =>
  regions.has(code)
    ? (regionNameOverrides[locale][code] ?? regionNames[locale].of(code) ?? code)
    : ''

export const normalizeLocation = (value: unknown): UserLocation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const location = value as Record<string, unknown>
  const { region, province, city } = location
  if (typeof region !== 'string' || !regions.has(region)) {
    return null
  }
  if (region !== 'CN') {
    return { region }
  }
  if (province === undefined) {
    return city === undefined ? { region } : null
  }
  const selectedProvince = provinces.find((item) => item.code === province)
  if (!selectedProvince) {
    return null
  }
  if (city === undefined) {
    return { region, province: selectedProvince.code }
  }
  const selectedCity = selectedProvince.cities.find((item) => item.code === city)
  return selectedCity ? { region, province: selectedProvince.code, city: selectedCity.code } : null
}

/** 将模糊定位结果整理为「城市 + 行政区」文本，去掉重复直辖市名。 */
export const formatCoarseLocation = (
  location: CoarseLocation,
  locale: 'zh-CN' | 'en-US'
): string => {
  const parts: string[] = []
  const pushUnique = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !parts.includes(trimmed)) {
      parts.push(trimmed)
    }
  }
  if (locale === 'zh-CN') {
    if (location.countryCode && location.countryCode !== 'CN') {
      pushUnique(getRegionName(location.countryCode, locale) || location.countryName)
    }
    pushUnique(location.province)
    pushUnique(location.city)
    pushUnique(location.district)
    if (parts.length === 0) {
      pushUnique(
        (location.countryCode ? getRegionName(location.countryCode, locale) : '') ||
          location.countryName
      )
    }
    return parts.join('')
  }
  pushUnique(location.district)
  pushUnique(location.city)
  pushUnique(location.province)
  if (parts.length === 0 || (location.countryCode && location.countryCode !== 'US')) {
    pushUnique(
      (location.countryCode ? getRegionName(location.countryCode, locale) : '') ||
        location.countryName
    )
  }
  return parts.join(', ')
}

export const formatUserLocation = (
  location: UserLocation | null,
  locale: 'zh-CN' | 'en-US'
): string => {
  if (!location) {
    return ''
  }
  if (location.region === 'CN' && locale === 'zh-CN') {
    const province = provinces.find((item) => item.code === location.province)
    const city = province?.cities.find((item) => item.code === location.city)
    return city?.name ?? province?.name ?? getRegionName('CN', locale)
  }
  if (location.region === 'CN') {
    const province = provinces.find((item) => item.code === location.province)
    const city = province?.cities.find((item) => item.code === location.city)
    const name = city?.name ?? province?.name
    return name ? `${name}, ${getRegionName('CN', locale)}` : getRegionName('CN', locale)
  }
  return getRegionName(location.region, locale)
}

export const getUserLocationQuery = (
  location: UserLocation | null,
  locale: 'zh-CN' | 'en-US'
): { query: string; label: string; countryCode: string; admin?: string } | null => {
  if (!location) {
    return null
  }
  const label = formatUserLocation(location, locale)
  if (location.region === 'CN') {
    const province = provinces.find((item) => item.code === location.province)
    const city = province?.cities.find((item) => item.code === location.city)
    const query = city?.name ?? province?.name ?? ''
    return {
      query,
      label,
      countryCode: 'CN',
      admin: province?.name,
    }
  }
  return {
    query: '',
    label,
    countryCode: location.region,
  }
}

const stripAdminSuffix = (name: string) =>
  name.replace(/(?:特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|自治州|地区|盟|市|省)$/, '')

const chineseCityEntries = (() => {
  const list: { stem: string; full: string; province: string }[] = []
  const seen = new Set<string>()
  for (const province of provinces) {
    for (const city of province.cities) {
      const stem = stripAdminSuffix(city.name)
      if (stem.length >= 2 && !seen.has(stem)) {
        seen.add(stem)
        list.push({ stem, full: city.name, province: province.name })
      }
    }
    const provinceStem = stripAdminSuffix(province.name)
    if (provinceStem.length >= 2 && !seen.has(provinceStem)) {
      seen.add(provinceStem)
      list.push({ stem: provinceStem, full: province.name, province: province.name })
    }
  }
  // 较长的地名优先匹配，避免子串误判。
  return list.sort((a, b) => b.stem.length - a.stem.length)
})()

const majorWorldCities: {
  patterns: string[]
  query: string
  zh: string
  en: string
  countryCode: string
}[] = [
  { patterns: ['东京', 'tokyo'], query: 'Tokyo', zh: '东京', en: 'Tokyo', countryCode: 'JP' },
  { patterns: ['大阪', 'osaka'], query: 'Osaka', zh: '大阪', en: 'Osaka', countryCode: 'JP' },
  { patterns: ['京都', 'kyoto'], query: 'Kyoto', zh: '京都', en: 'Kyoto', countryCode: 'JP' },
  { patterns: ['首尔', 'seoul'], query: 'Seoul', zh: '首尔', en: 'Seoul', countryCode: 'KR' },
  {
    patterns: ['新加坡', 'singapore'],
    query: 'Singapore',
    zh: '新加坡',
    en: 'Singapore',
    countryCode: 'SG',
  },
  { patterns: ['曼谷', 'bangkok'], query: 'Bangkok', zh: '曼谷', en: 'Bangkok', countryCode: 'TH' },
  {
    patterns: ['纽约', 'new york'],
    query: 'New York',
    zh: '纽约',
    en: 'New York',
    countryCode: 'US',
  },
  {
    patterns: ['洛杉矶', 'los angeles'],
    query: 'Los Angeles',
    zh: '洛杉矶',
    en: 'Los Angeles',
    countryCode: 'US',
  },
  {
    patterns: ['旧金山', 'san francisco'],
    query: 'San Francisco',
    zh: '旧金山',
    en: 'San Francisco',
    countryCode: 'US',
  },
  {
    patterns: ['西雅图', 'seattle'],
    query: 'Seattle',
    zh: '西雅图',
    en: 'Seattle',
    countryCode: 'US',
  },
  {
    patterns: ['芝加哥', 'chicago'],
    query: 'Chicago',
    zh: '芝加哥',
    en: 'Chicago',
    countryCode: 'US',
  },
  {
    patterns: ['多伦多', 'toronto'],
    query: 'Toronto',
    zh: '多伦多',
    en: 'Toronto',
    countryCode: 'CA',
  },
  {
    patterns: ['温哥华', 'vancouver'],
    query: 'Vancouver',
    zh: '温哥华',
    en: 'Vancouver',
    countryCode: 'CA',
  },
  {
    patterns: ['蒙特利尔', 'montreal'],
    query: 'Montreal',
    zh: '蒙特利尔',
    en: 'Montreal',
    countryCode: 'CA',
  },
  { patterns: ['伦敦', 'london'], query: 'London', zh: '伦敦', en: 'London', countryCode: 'GB' },
  { patterns: ['巴黎', 'paris'], query: 'Paris', zh: '巴黎', en: 'Paris', countryCode: 'FR' },
  { patterns: ['柏林', 'berlin'], query: 'Berlin', zh: '柏林', en: 'Berlin', countryCode: 'DE' },
  { patterns: ['悉尼', 'sydney'], query: 'Sydney', zh: '悉尼', en: 'Sydney', countryCode: 'AU' },
  {
    patterns: ['墨尔本', 'melbourne'],
    query: 'Melbourne',
    zh: '墨尔本',
    en: 'Melbourne',
    countryCode: 'AU',
  },
  { patterns: ['台北', 'taipei'], query: 'Taipei', zh: '台北', en: 'Taipei', countryCode: 'TW' },
  {
    patterns: ['香港', 'hong kong'],
    query: 'Hong Kong',
    zh: '香港',
    en: 'Hong Kong',
    countryCode: 'HK',
  },
  {
    patterns: ['澳门', 'macau', 'macao'],
    query: 'Macau',
    zh: '澳门',
    en: 'Macau',
    countryCode: 'MO',
  },
  {
    patterns: ['北京', 'beijing'],
    query: 'Beijing',
    zh: '北京市',
    en: 'Beijing',
    countryCode: 'CN',
  },
  {
    patterns: ['上海', 'shanghai'],
    query: 'Shanghai',
    zh: '上海市',
    en: 'Shanghai',
    countryCode: 'CN',
  },
  {
    patterns: ['广州', 'guangzhou'],
    query: 'Guangzhou',
    zh: '广州市',
    en: 'Guangzhou',
    countryCode: 'CN',
  },
  {
    patterns: ['深圳', 'shenzhen'],
    query: 'Shenzhen',
    zh: '深圳市',
    en: 'Shenzhen',
    countryCode: 'CN',
  },
  {
    patterns: ['杭州', 'hangzhou'],
    query: 'Hangzhou',
    zh: '杭州市',
    en: 'Hangzhou',
    countryCode: 'CN',
  },
  {
    patterns: ['成都', 'chengdu'],
    query: 'Chengdu',
    zh: '成都市',
    en: 'Chengdu',
    countryCode: 'CN',
  },
  {
    patterns: ['重庆', 'chongqing'],
    query: 'Chongqing',
    zh: '重庆市',
    en: 'Chongqing',
    countryCode: 'CN',
  },
  { patterns: ['武汉', 'wuhan'], query: 'Wuhan', zh: '武汉市', en: 'Wuhan', countryCode: 'CN' },
  {
    patterns: ['南京', 'nanjing'],
    query: 'Nanjing',
    zh: '南京市',
    en: 'Nanjing',
    countryCode: 'CN',
  },
  { patterns: ['苏州', 'suzhou'], query: 'Suzhou', zh: '苏州市', en: 'Suzhou', countryCode: 'CN' },
  {
    patterns: ['西安', "xi'an", 'xian'],
    query: "Xi'an",
    zh: '西安市',
    en: "Xi'an",
    countryCode: 'CN',
  },
]

export const matchCityInText = (
  text: string,
  locale: 'zh-CN' | 'en-US'
): { query: string; label: string; countryCode?: string; admin?: string } | null => {
  const lower = text.toLowerCase()
  for (const city of majorWorldCities) {
    for (const pattern of city.patterns) {
      if (/^[a-z]/i.test(pattern)) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
          return {
            query: city.query,
            label: locale === 'zh-CN' ? city.zh : city.en,
            countryCode: city.countryCode,
          }
        }
      } else if (text.includes(pattern)) {
        return {
          query: city.query,
          label: locale === 'zh-CN' ? city.zh : city.en,
          countryCode: city.countryCode,
        }
      }
    }
  }
  for (const entry of chineseCityEntries) {
    if (text.includes(entry.full) || text.includes(entry.stem)) {
      return {
        query: entry.full,
        label: entry.full,
        countryCode: 'CN',
        admin: entry.province,
      }
    }
  }
  // 英文问题中常见 "weather in Boston" / "events in Austin"
  const inMatch = text.match(
    /\b(?:weather|forecast|events|hours|temperature|rain)\s+(?:in|for|at)\s+([A-Z][a-zA-Z-]+(?:\s+[A-Z][a-zA-Z-]+){0,2})/
  )
  if (inMatch?.[1]) {
    const place = inMatch[1].trim()
    if (!/^(?:My|The|This|Today|Tomorrow|Here)$/i.test(place)) {
      return { query: place, label: place }
    }
  }
  return null
}
