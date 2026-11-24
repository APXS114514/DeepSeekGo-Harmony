import clsx from 'clsx'
import { memo, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { openCitation } from '../../services/harmony.js'
import {
  computeNiceScale,
  formatChartNumber,
  getChartMetrics,
  parseChartSpec,
  type ChartSeries,
  type ChartSpec,
} from '../../services/markdown/chart.js'
import { useSettings } from '../../services/settings.js'
import styles from './ChartBlock.module.css'

const SERIES_PALETTE = [
  'var(--user-accent, var(--dsw-alias-brand-primary, #4d6bfe))',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#64748b',
]

const getSeriesColor = (series: ChartSeries, index: number) =>
  series.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length]

const getSliceColor = (index: number) => SERIES_PALETTE[index % SERIES_PALETTE.length]

const PLOT_WIDTH = 560
const PLOT_HEIGHT = 248
const PAD = { top: 18, right: 16, bottom: 38, left: 54 }
const INNER_W = PLOT_WIDTH - PAD.left - PAD.right
const INNER_H = PLOT_HEIGHT - PAD.top - PAD.bottom

const truncateLabel = (text: string, max = 10) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const polarToCartesian = (cx: number, cy: number, radius: number, angleRad: number) => ({
  x: cx + radius * Math.cos(angleRad),
  y: cy + radius * Math.sin(angleRad),
})

const describeArcSlice = (
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string => {
  const sweep = endAngle - startAngle
  // 整圆用两段半圆弧拼合，避免起终点重合导致 SVG 路径消失。
  if (sweep >= Math.PI * 1.999) {
    const mid = startAngle + Math.PI
    return `${describeArcSlice(cx, cy, outerR, innerR, startAngle, mid)} ${describeArcSlice(cx, cy, outerR, innerR, mid, endAngle - 0.001)}`
  }
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle)
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle)
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle)
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle)
  const largeArc = sweep > Math.PI ? 1 : 0
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

const CartesianPlot = ({
  spec,
  visibleSeries,
  activeIndex,
  onSelectIndex,
  locale,
}: {
  spec: ChartSpec
  visibleSeries: { series: ChartSeries; index: number }[]
  activeIndex: number | null
  onSelectIndex: (index: number) => void
  locale: 'zh-CN' | 'en-US'
}) => {
  const gradientId = useId()
  const count = spec.categories.length
  const stepX = INNER_W / Math.max(1, count)
  const xForIndex = (index: number) =>
    spec.type === 'bar' || count === 1
      ? PAD.left + stepX * (index + 0.5)
      : PAD.left + (INNER_W * index) / (count - 1)

  const scale = useMemo(() => {
    let rawMin = Infinity
    let rawMax = -Infinity
    if (spec.type === 'bar' && spec.stacked) {
      for (let i = 0; i < count; i++) {
        let pos = 0
        let neg = 0
        for (const { series } of visibleSeries) {
          const v = series.values[i]
          if (v === null) {
            continue
          }
          if (v >= 0) {
            pos += v
          } else {
            neg += v
          }
        }
        rawMin = Math.min(rawMin, neg)
        rawMax = Math.max(rawMax, pos)
      }
    } else {
      for (const { series } of visibleSeries) {
        for (const v of series.values) {
          if (v !== null) {
            rawMin = Math.min(rawMin, v)
            rawMax = Math.max(rawMax, v)
          }
        }
      }
    }
    if (spec.yMin !== undefined) {
      rawMin = Math.min(rawMin, spec.yMin)
    }
    if (spec.yMax !== undefined) {
      rawMax = Math.max(rawMax, spec.yMax)
    }
    return computeNiceScale(rawMin, rawMax, { includeZero: spec.type === 'bar' })
  }, [count, spec.stacked, spec.type, spec.yMax, spec.yMin, visibleSeries])

  const span = scale.max - scale.min || 1
  const yForValue = (value: number) => PAD.top + INNER_H - ((value - scale.min) / span) * INNER_H
  const baselineY = yForValue(Math.min(Math.max(0, scale.min), scale.max))
  const labelStride = count <= 7 ? 1 : Math.ceil(count / 6)

  const onColumnKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSelectIndex((index + 1) % count)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSelectIndex((index - 1 + count) % count)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectIndex(index)
    }
  }

  return (
    <div className={styles.plotWrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
        role="img"
        aria-label={spec.title || 'Chart'}
      >
        <defs>
          {visibleSeries.map(({ series, index }) => (
            <linearGradient key={index} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={getSeriesColor(series, index)} stopOpacity="0.26" />
              <stop offset="100%" stopColor={getSeriesColor(series, index)} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* 水平网格线与纵轴刻度 */}
        {scale.ticks.map((tick) => {
          const y = yForValue(tick)
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PLOT_WIDTH - PAD.right}
                y1={y}
                y2={y}
                className={tick === 0 ? styles.zeroLine : styles.gridLine}
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" className={styles.axisText}>
                {formatChartNumber(tick, undefined, locale)}
              </text>
            </g>
          )
        })}

        {/* 当前选中列高亮 */}
        {activeIndex !== null ? (
          spec.type === 'bar' ? (
            <rect
              x={PAD.left + activeIndex * stepX}
              y={PAD.top}
              width={stepX}
              height={INNER_H}
              rx={6}
              className={styles.activeColumn}
            />
          ) : (
            <line
              x1={xForIndex(activeIndex)}
              x2={xForIndex(activeIndex)}
              y1={PAD.top}
              y2={PAD.top + INNER_H}
              className={styles.activeGuide}
            />
          )
        ) : null}

        {/* 柱状图 / 堆叠柱状图 */}
        {spec.type === 'bar'
          ? spec.stacked
            ? spec.categories.map((_, catIndex) => {
                const barW = Math.max(8, Math.min(36, stepX * 0.56))
                const x = xForIndex(catIndex) - barW / 2
                let posAcc = 0
                let negAcc = 0
                return (
                  <g key={catIndex}>
                    {visibleSeries.map(({ series, index: sIndex }) => {
                      const value = series.values[catIndex]
                      if (value === null || value === 0) {
                        return null
                      }
                      const start = value > 0 ? posAcc : negAcc
                      const end = start + value
                      if (value > 0) {
                        posAcc = end
                      } else {
                        negAcc = end
                      }
                      const y1 = yForValue(end)
                      const y2 = yForValue(start)
                      return (
                        <rect
                          key={sIndex}
                          x={x}
                          y={Math.min(y1, y2)}
                          width={barW}
                          height={Math.max(2, Math.abs(y2 - y1))}
                          rx={3}
                          fill={getSeriesColor(series, sIndex)}
                          opacity={activeIndex === null || activeIndex === catIndex ? 0.92 : 0.55}
                        />
                      )
                    })}
                  </g>
                )
              })
            : spec.categories.map((_, catIndex) => {
                const groupW = Math.min(stepX * 0.72, visibleSeries.length * 26)
                const gap = visibleSeries.length > 1 ? 3 : 0
                const barW = Math.max(
                  6,
                  (groupW - gap * (visibleSeries.length - 1)) / Math.max(1, visibleSeries.length)
                )
                const startX = xForIndex(catIndex) - groupW / 2
                return (
                  <g key={catIndex}>
                    {visibleSeries.map(({ series, index: sIndex }, offset) => {
                      const value = series.values[catIndex]
                      if (value === null) {
                        return null
                      }
                      const y = yForValue(value)
                      const top = Math.min(y, baselineY)
                      const height = Math.max(2, Math.abs(baselineY - y))
                      return (
                        <rect
                          key={sIndex}
                          x={startX + offset * (barW + gap)}
                          y={top}
                          width={barW}
                          height={height}
                          rx={3}
                          fill={getSeriesColor(series, sIndex)}
                          opacity={activeIndex === null || activeIndex === catIndex ? 0.92 : 0.55}
                        />
                      )
                    })}
                  </g>
                )
              })
          : /* 折线图 / 面积图 */
            visibleSeries.map(({ series, index: sIndex }) => {
              const color = getSeriesColor(series, sIndex)
              const segments: { x: number; y: number; index: number }[][] = []
              let current: { x: number; y: number; index: number }[] = []
              series.values.forEach((value, idx) => {
                if (value === null) {
                  if (current.length > 0) {
                    segments.push(current)
                    current = []
                  }
                  return
                }
                current.push({ x: xForIndex(idx), y: yForValue(value), index: idx })
              })
              if (current.length > 0) {
                segments.push(current)
              }
              const showArea = spec.type === 'area' || visibleSeries.length === 1
              return (
                <g key={sIndex}>
                  {segments.map((segment, segIdx) => {
                    const linePath = segment
                      .map(
                        (pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
                      )
                      .join(' ')
                    const areaPath =
                      showArea && segment.length >= 2
                        ? `${linePath} L ${segment[segment.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${segment[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
                        : null
                    return (
                      <g key={segIdx}>
                        {areaPath ? (
                          <path d={areaPath} fill={`url(#${gradientId}-${sIndex})`} />
                        ) : null}
                        <path
                          d={linePath}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    )
                  })}
                  {series.values.map((value, idx) => {
                    if (value === null) {
                      return null
                    }
                    const active = activeIndex === idx
                    return (
                      <circle
                        key={idx}
                        cx={xForIndex(idx)}
                        cy={yForValue(value)}
                        r={active ? 5 : count <= 14 ? 3.2 : 2.2}
                        fill={color}
                        className={styles.pointDot}
                      />
                    )
                  })}
                </g>
              )
            })}

        {/* 横轴标签 */}
        {spec.categories.map((label, index) => {
          const isEdge = index === 0 || index === count - 1
          if (!isEdge && index % labelStride !== 0) {
            return null
          }
          return (
            <text
              key={index}
              x={xForIndex(index)}
              y={PLOT_HEIGHT - 12}
              textAnchor={
                spec.type !== 'bar' && count > 1 && index === 0
                  ? 'start'
                  : spec.type !== 'bar' && count > 1 && index === count - 1
                    ? 'end'
                    : 'middle'
              }
              className={styles.axisText}
            >
              {truncateLabel(label, count > 8 ? 7 : 10)}
            </text>
          )
        })}

        {/* 可点按与键盘导航的列热区 */}
        {spec.categories.map((category, index) => {
          const x =
            spec.type === 'bar' || count === 1
              ? PAD.left + index * stepX
              : index === 0
                ? PAD.left
                : (xForIndex(index - 1) + xForIndex(index)) / 2
          const right =
            spec.type === 'bar' || count === 1
              ? PAD.left + (index + 1) * stepX
              : index === count - 1
                ? PLOT_WIDTH - PAD.right
                : (xForIndex(index) + xForIndex(index + 1)) / 2
          const summary = visibleSeries
            .map(({ series }) => {
              const v = series.values[index]
              return `${series.name} ${v === null ? '-' : formatChartNumber(v, series.unit ?? spec.unit, locale)}`
            })
            .join(', ')
          return (
            <g
              key={index}
              role="button"
              tabIndex={0}
              className={styles.hitArea}
              data-chart-point={index}
              aria-label={`${category}: ${summary}`}
              aria-pressed={activeIndex === index}
              onClick={() => onSelectIndex(index)}
              onMouseEnter={() => onSelectIndex(index)}
              onKeyDown={(event) => onColumnKeyDown(event, index)}
            >
              <rect
                x={x}
                y={PAD.top}
                width={Math.max(8, right - x)}
                height={INNER_H}
                fill="transparent"
                className={styles.focusHighlight}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const PiePlot = ({
  spec,
  activeIndex,
  onSelectIndex,
  locale,
}: {
  spec: ChartSpec
  activeIndex: number | null
  onSelectIndex: (index: number) => void
  locale: 'zh-CN' | 'en-US'
}) => {
  const series = spec.series[0]
  const unit = series.unit ?? spec.unit
  const slices = useMemo(() => {
    const items = spec.categories
      .map((label, index) => ({
        label,
        index,
        value: Math.max(0, series.values[index] ?? 0),
      }))
      .filter((item) => item.value > 0)
    const total = items.reduce((sum, item) => sum + item.value, 0) || 1
    let angle = -Math.PI / 2
    return {
      total,
      items: items.map((item) => {
        const sweep = (item.value / total) * Math.PI * 2
        const start = angle
        const end = angle + sweep
        angle = end
        return {
          ...item,
          percent: Math.round((item.value / total) * 1000) / 10,
          start,
          end,
        }
      }),
    }
  }, [series.values, spec.categories])

  const selected =
    activeIndex !== null ? (slices.items.find((item) => item.index === activeIndex) ?? null) : null

  return (
    <div className={styles.pieLayout}>
      <svg
        className={styles.pieSvg}
        viewBox="0 0 220 220"
        role="img"
        aria-label={spec.title || 'Pie chart'}
      >
        {slices.items.map((slice) => {
          const active = activeIndex === slice.index
          return (
            <path
              key={slice.index}
              role="button"
              tabIndex={0}
              data-chart-point={slice.index}
              aria-label={`${slice.label}: ${formatChartNumber(slice.value, unit, locale)} (${slice.percent}%)`}
              aria-pressed={active}
              d={describeArcSlice(110, 110, active ? 96 : 90, 54, slice.start, slice.end)}
              fill={getSliceColor(slice.index)}
              className={styles.hitArea}
              opacity={activeIndex === null || active ? 0.95 : 0.55}
              onClick={() => onSelectIndex(slice.index)}
              onMouseEnter={() => onSelectIndex(slice.index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectIndex(slice.index)
                }
              }}
            />
          )
        })}
        <text x={110} y={100} textAnchor="middle" className={styles.pieCenterTitle}>
          {truncateLabel(selected ? selected.label : locale === 'zh-CN' ? '合计' : 'Total', 10)}
        </text>
        <text x={110} y={120} textAnchor="middle" className={styles.pieCenterValue}>
          {formatChartNumber(selected ? selected.value : slices.total, unit, locale)}
        </text>
        {selected ? (
          <text x={110} y={136} textAnchor="middle" className={styles.pieCenterSub}>
            {selected.percent}%
          </text>
        ) : null}
      </svg>
      <div className={styles.pieLegend}>
        {slices.items.map((slice) => {
          const active = activeIndex === slice.index
          return (
            <button
              key={slice.index}
              type="button"
              className={clsx(styles.legendButton, active && styles.legendButtonActive)}
              aria-pressed={active}
              onClick={() => onSelectIndex(slice.index)}
            >
              <span className={styles.swatch} style={{ background: getSliceColor(slice.index) }} />
              <span>{slice.label}</span>
              <span className={styles.pieLegendValue}>
                {formatChartNumber(slice.value, unit, locale)} ({slice.percent}%)
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type ChartViewMode = 'chart' | 'table' | 'code'

export const ChartBlock = memo(function ChartBlock({
  code,
  view,
  loading,
}: {
  code: string
  view: Exclude<ChartViewMode, 'code'>
  loading: boolean
}) {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const spec = useMemo(() => parseChartSpec(code), [code])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hiddenSeries, setHiddenSeries] = useState<number[]>([])

  if (!spec) {
    return (
      <div className={styles.status} role="status">
        {loading ? t('chartLoading') : t('chartRenderFail')}
      </div>
    )
  }

  const metrics = getChartMetrics(spec, locale)
  const safeActiveIndex =
    activeIndex !== null && activeIndex < spec.categories.length ? activeIndex : null
  const visibleSeries = spec.series
    .map((series, index) => ({ series, index }))
    .filter(({ index }) => !hiddenSeries.includes(index))
  const effectiveSeries =
    visibleSeries.length > 0 ? visibleSeries : [{ series: spec.series[0], index: 0 }]

  const toggleSeries = (seriesIndex: number) => {
    setHiddenSeries((current) => {
      if (current.includes(seriesIndex)) {
        return current.filter((item) => item !== seriesIndex)
      }
      if (spec.series.length - current.length <= 1) {
        return current
      }
      return [...current, seriesIndex]
    })
  }

  return (
    <div className={styles.root} data-chart-type={spec.type}>
      {spec.title || spec.subtitle || spec.unit ? (
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            {spec.title ? <h4 className={styles.title}>{spec.title}</h4> : null}
            {spec.subtitle ? <p className={styles.subtitle}>{spec.subtitle}</p> : null}
          </div>
          {spec.unit ? <span className={styles.unitBadge}>{spec.unit}</span> : null}
        </div>
      ) : null}

      {metrics.length > 0 ? (
        <div className={styles.metrics} role="list" aria-label={t('chartMetricsLabel')}>
          {metrics.map((metric, idx) => (
            <div key={idx} role="listitem" className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              {metric.detail ? <div className={styles.metricDetail}>{metric.detail}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {view === 'chart' ? (
        <>
          <div className={styles.readout} role="status" aria-live="polite" data-chart-readout>
            {safeActiveIndex !== null ? (
              <>
                <span className={styles.readoutCategory}>{spec.categories[safeActiveIndex]}</span>
                <div className={styles.readoutItems}>
                  {(spec.type === 'pie'
                    ? [{ series: spec.series[0], index: 0 }]
                    : effectiveSeries
                  ).map(({ series, index }) => {
                    const value = series.values[safeActiveIndex]
                    return (
                      <span key={index} className={styles.readoutItem}>
                        <span
                          className={styles.swatch}
                          style={{
                            background:
                              spec.type === 'pie'
                                ? getSliceColor(safeActiveIndex)
                                : getSeriesColor(series, index),
                          }}
                        />
                        <span>{series.name}</span>
                        <strong>
                          {value === null
                            ? '-'
                            : formatChartNumber(value, series.unit ?? spec.unit, locale)}
                        </strong>
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <span className={styles.readoutHint}>{t('chartTapToInspect')}</span>
            )}
          </div>

          {spec.type === 'pie' ? (
            <PiePlot
              spec={spec}
              activeIndex={safeActiveIndex}
              onSelectIndex={setActiveIndex}
              locale={locale}
            />
          ) : (
            <CartesianPlot
              spec={spec}
              visibleSeries={effectiveSeries}
              activeIndex={safeActiveIndex}
              onSelectIndex={setActiveIndex}
              locale={locale}
            />
          )}

          {spec.type !== 'pie' && spec.series.length > 1 ? (
            <div className={styles.legend} role="group" aria-label={t('chartLegendLabel')}>
              {spec.series.map((series, index) => {
                const hidden = hiddenSeries.includes(index)
                return (
                  <button
                    key={index}
                    type="button"
                    className={clsx(styles.legendButton, hidden && styles.legendButtonHidden)}
                    aria-pressed={!hidden}
                    onClick={() => toggleSeries(index)}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: getSeriesColor(series, index) }}
                    />
                    <span>{series.name}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{spec.xLabel || t('chartTableCategory')}</th>
                {spec.series.map((series, index) => (
                  <th key={index}>
                    {(series.unit ?? spec.unit)
                      ? `${series.name} (${series.unit ?? spec.unit})`
                      : series.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.categories.map((category, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={clsx(safeActiveIndex === rowIndex && styles.tableRowActive)}
                  onClick={() => setActiveIndex(rowIndex)}
                >
                  <td>{category}</td>
                  {spec.series.map((series, sIndex) => {
                    const value = series.values[rowIndex]
                    return (
                      <td key={sIndex}>
                        {value === null
                          ? '-'
                          : formatChartNumber(value, series.unit ?? spec.unit, locale)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {spec.note || spec.sources.length > 0 ? (
        <div className={styles.footer}>
          {spec.note ? (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>{t('chartCaliberLabel')}</span>
              <span>{spec.note}</span>
            </div>
          ) : null}
          {spec.sources.length > 0 ? (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>{t('chartSourceLabel')}</span>
              {spec.sources.map((source, index) => (
                <span key={index}>
                  {index > 0 ? ' · ' : null}
                  {source.url ? (
                    <a
                      className={styles.sourceLink}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        const url = source.url
                        if (__HARMONY_APP__ && url) {
                          event.preventDefault()
                          openCitation(url)
                        }
                      }}
                    >
                      {source.name}
                    </a>
                  ) : (
                    source.name
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
