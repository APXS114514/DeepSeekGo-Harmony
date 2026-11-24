export type ChartType = 'line' | 'bar' | 'area' | 'pie'

export type ChartMetric = {
  label: string
  value: string
  detail?: string
}

export type ChartSeries = {
  name: string
  values: (number | null)[]
  unit?: string
  color?: string
}

export type ChartSource = {
  name: string
  url?: string
}

export type ChartSpec = {
  type: ChartType
  title: string
  subtitle?: string
  unit?: string
  xLabel?: string
  yLabel?: string
  categories: string[]
  series: ChartSeries[]
  metrics: ChartMetric[]
  note?: string
  sources: ChartSource[]
  stacked?: boolean
  yMin?: number
  yMax?: number
}

const MAX_CATEGORIES = 60
const MAX_SERIES = 8
const MAX_METRICS = 6
const MAX_SOURCES = 8

const safeString = (value: unknown, max = 160): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '')
    if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
      return null
    }
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const sanitizeHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

const sanitizeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const color = value.trim()
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined
}

const normalizeType = (value: unknown): ChartType | null => {
  if (typeof value !== 'string') {
    return null
  }
  switch (value.trim().toLowerCase()) {
    case 'line':
      return 'line'
    case 'bar':
    case 'column':
      return 'bar'
    case 'area':
      return 'area'
    case 'pie':
    case 'donut':
    case 'doughnut':
      return 'pie'
    default:
      return null
  }
}

const parseJsonForgiving = (raw: string): unknown => {
  const trimmed = raw.trim().replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    // 兼容模型偶发输出的对象/数组尾逗号。
    try {
      return JSON.parse(trimmed.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
    }
  }
}

const parseSources = (rawSources: unknown, rawSource: unknown): ChartSource[] => {
  const list: unknown[] = Array.isArray(rawSources)
    ? rawSources
    : rawSource !== undefined
      ? [rawSource]
      : []
  const sources: ChartSource[] = []
  for (const item of list) {
    if (sources.length >= MAX_SOURCES) {
      break
    }
    if (typeof item === 'string') {
      const text = safeString(item, 160)
      if (!text) {
        continue
      }
      const url = sanitizeHttpUrl(text)
      sources.push(
        url ? { name: new URL(url).hostname.replace(/^www\./, ''), url } : { name: text }
      )
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>
      const url = sanitizeHttpUrl(obj.url ?? obj.href)
      const name =
        safeString(obj.name ?? obj.label ?? obj.title, 120) ||
        (url ? new URL(url).hostname.replace(/^www\./, '') : '')
      if (name) {
        sources.push(url ? { name, url } : { name })
      }
    }
  }
  return sources
}

const parseMetrics = (rawMetrics: unknown): ChartMetric[] => {
  if (!Array.isArray(rawMetrics)) {
    return []
  }
  const metrics: ChartMetric[] = []
  for (const item of rawMetrics) {
    if (metrics.length >= MAX_METRICS) {
      break
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const obj = item as Record<string, unknown>
    const label = safeString(obj.label ?? obj.name, 48)
    const rawValue = obj.value
    const value =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? String(rawValue)
        : safeString(rawValue, 48)
    const detail = safeString(obj.detail ?? obj.subtext ?? obj.delta, 60) || undefined
    if (label && value) {
      metrics.push(detail ? { label, value, detail } : { label, value })
    }
  }
  return metrics
}

export const formatChartNumber = (
  value: number,
  unit?: string,
  locale: 'zh-CN' | 'en-US' = 'zh-CN'
): string => {
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2,
  }).format(value)
  if (!unit) {
    return formatted
  }
  const noSpace = /^[%℃°元万亿]/.test(unit)
  return noSpace ? `${formatted}${unit}` : `${formatted} ${unit}`
}

/** 安全解析 ```chart 代码块，非法结构或缺少有效数值时返回 null。 */
export const parseChartSpec = (raw: string): ChartSpec | null => {
  const parsed = parseJsonForgiving(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const obj = parsed as Record<string, unknown>
  const type = normalizeType(obj.type) ?? 'bar'
  const rawCategories = obj.categories ?? obj.labels ?? obj.x
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return null
  }
  const categories = rawCategories
    .slice(0, MAX_CATEGORIES)
    .map((item) => (typeof item === 'number' ? String(item) : safeString(item, 48)))
  if (categories.length === 0 || categories.every((item) => !item)) {
    return null
  }

  const unit = safeString(obj.unit, 24) || undefined
  const rawSeriesList = Array.isArray(obj.series)
    ? obj.series
    : Array.isArray(obj.values) || Array.isArray(obj.data)
      ? [
          {
            name: safeString(obj.seriesName, 48) || safeString(obj.title, 48) || 'Value',
            values: obj.values ?? obj.data,
          },
        ]
      : []

  const series: ChartSeries[] = []
  for (const item of rawSeriesList) {
    if (series.length >= MAX_SERIES) {
      break
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const entry = item as Record<string, unknown>
    const rawValues = entry.values ?? entry.data
    if (!Array.isArray(rawValues)) {
      continue
    }
    const values = categories.map((_, index) => parseNumber(rawValues[index]))
    if (!values.some((value) => value !== null)) {
      continue
    }
    const name = safeString(entry.name ?? entry.label, 48) || `Series ${series.length + 1}`
    const seriesUnit = safeString(entry.unit, 24) || undefined
    const color = sanitizeColor(entry.color)
    series.push({
      name,
      values,
      ...(seriesUnit ? { unit: seriesUnit } : {}),
      ...(color ? { color } : {}),
    })
  }
  if (series.length === 0) {
    return null
  }

  if (type === 'pie') {
    const positiveCount = series[0].values.filter((v) => v !== null && v > 0).length
    if (positiveCount === 0) {
      return null
    }
  }

  const title = safeString(obj.title, 120)
  const subtitle = safeString(obj.subtitle, 160) || undefined
  const xLabel = safeString(obj.xLabel ?? obj.xAxis, 48) || undefined
  const yLabel = safeString(obj.yLabel ?? obj.yAxis, 48) || undefined
  const note =
    safeString(obj.note ?? obj.caliber ?? obj.methodology ?? obj.description, 240) || undefined
  const metrics = parseMetrics(obj.metrics ?? obj.summary)
  const sources = parseSources(obj.sources, obj.source)
  const yMin = parseNumber(obj.yMin) ?? undefined
  const yMax = parseNumber(obj.yMax) ?? undefined

  return {
    type,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(unit ? { unit } : {}),
    ...(xLabel ? { xLabel } : {}),
    ...(yLabel ? { yLabel } : {}),
    categories,
    series,
    metrics,
    ...(note ? { note } : {}),
    sources,
    ...(obj.stacked === true ? { stacked: true } : {}),
    ...(yMin !== undefined ? { yMin } : {}),
    ...(yMax !== undefined ? { yMax } : {}),
  }
}

/** 当模型未显式给出摘要指标时，从数据中计算简洁指标卡。 */
export const getChartMetrics = (spec: ChartSpec, locale: 'zh-CN' | 'en-US'): ChartMetric[] => {
  if (spec.metrics.length > 0) {
    return spec.metrics
  }
  const unit = spec.series[0]?.unit ?? spec.unit
  if (spec.type === 'pie') {
    const values = spec.series[0].values.map((value) => (value !== null && value > 0 ? value : 0))
    const total = values.reduce((sum, v) => sum + v, 0)
    let topIndex = 0
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[topIndex]) {
        topIndex = i
      }
    }
    const share = total > 0 ? `${Math.round((values[topIndex] / total) * 1000) / 10}%` : '0%'
    return locale === 'zh-CN'
      ? [
          { label: '合计', value: formatChartNumber(total, unit, locale) },
          {
            label: '最大项',
            value: spec.categories[topIndex] || '-',
            detail: `${formatChartNumber(values[topIndex], unit, locale)}（${share}）`,
          },
        ]
      : [
          { label: 'Total', value: formatChartNumber(total, unit, locale) },
          {
            label: 'Largest',
            value: spec.categories[topIndex] || '-',
            detail: `${formatChartNumber(values[topIndex], unit, locale)} (${share})`,
          },
        ]
  }

  let maxVal = -Infinity
  let minVal = Infinity
  let maxDetail = ''
  let minDetail = ''
  let sum = 0
  let count = 0

  for (const s of spec.series) {
    s.values.forEach((value, index) => {
      if (value === null) {
        return
      }
      sum += value
      count += 1
      const label =
        spec.series.length > 1 ? `${s.name} · ${spec.categories[index]}` : spec.categories[index]
      if (value > maxVal) {
        maxVal = value
        maxDetail = label
      }
      if (value < minVal) {
        minVal = value
        minDetail = label
      }
    })
  }
  if (count === 0) {
    return []
  }
  const avg = sum / count
  return locale === 'zh-CN'
    ? [
        { label: '最高', value: formatChartNumber(maxVal, unit, locale), detail: maxDetail },
        { label: '最低', value: formatChartNumber(minVal, unit, locale), detail: minDetail },
        { label: '均值', value: formatChartNumber(avg, unit, locale) },
      ]
    : [
        { label: 'High', value: formatChartNumber(maxVal, unit, locale), detail: maxDetail },
        { label: 'Low', value: formatChartNumber(minVal, unit, locale), detail: minDetail },
        { label: 'Average', value: formatChartNumber(avg, unit, locale) },
      ]
}

export type NiceScale = {
  min: number
  max: number
  ticks: number[]
}

/** 计算美观的纵轴刻度，避免浮点数尾差或零跨度除零。 */
export const computeNiceScale = (
  rawMin: number,
  rawMax: number,
  { includeZero = false, tickCount = 4 }: { includeZero?: boolean; tickCount?: number } = {}
): NiceScale => {
  let min = includeZero ? Math.min(0, rawMin) : rawMin
  let max = includeZero ? Math.max(0, rawMax) : rawMax
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, ticks: [0, 0.5, 1] }
  }
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.2
    min -= pad
    max += pad
  }
  const range = max - min
  const roughStep = range / Math.max(2, tickCount)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const residual = roughStep / magnitude
  const niceFactor =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10
  const step = niceFactor * magnitude
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  const steps = Math.min(8, Math.max(2, Math.round((niceMax - niceMin) / step)))
  for (let i = 0; i <= steps; i++) {
    const value = niceMin + i * step
    ticks.push(Math.abs(value) < 1e-9 ? 0 : Math.round(value * 1e6) / 1e6)
  }
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks }
}

/** 用于纯文本分享、长图导出和朗读的可读图表文本。 */
export const chartToPlainText = (spec: ChartSpec, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string => {
  const lines: string[] = []
  if (spec.title) {
    lines.push(spec.title)
  }
  const metrics = getChartMetrics(spec, locale)
  if (metrics.length > 0) {
    lines.push(
      metrics.map((m) => `${m.label}: ${m.value}${m.detail ? ` (${m.detail})` : ''}`).join(' | ')
    )
  }
  const header = [
    spec.xLabel ?? (locale === 'zh-CN' ? '类别' : 'Category'),
    ...spec.series.map((s) =>
      (s.unit ?? spec.unit) ? `${s.name} (${s.unit ?? spec.unit})` : s.name
    ),
  ]
  lines.push(header.join(' | '))
  spec.categories.forEach((category, index) => {
    const row = [
      category,
      ...spec.series.map((s) => {
        const value = s.values[index]
        return value === null ? '-' : formatChartNumber(value, s.unit ?? spec.unit, locale)
      }),
    ]
    lines.push(row.join(' | '))
  })
  if (spec.note) {
    lines.push(`${locale === 'zh-CN' ? '统计口径：' : 'Note: '}${spec.note}`)
  }
  if (spec.sources.length > 0) {
    lines.push(
      `${locale === 'zh-CN' ? '来源：' : 'Source: '}${spec.sources.map((s) => s.name).join(', ')}`
    )
  }
  return lines.join('\n')
}
