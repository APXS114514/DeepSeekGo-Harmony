import { useTranslate } from '../../i18n/index.js'
import { memo, useEffect, useMemo, useReducer, useState } from 'react'
import Prism from 'prismjs'
import {
  getHighlightLang,
  isHighlightLoaded,
  loadHighlight,
} from '../../services/markdown/highlight.js'
import { chartToPlainText, parseChartSpec } from '../../services/markdown/chart.js'
import { useSettings } from '../../services/settings.js'
import { IconCheckOutline16, IconCopyOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { copyText } from '../../utils/clipboard.js'
import { ChartBlock, type ChartViewMode } from './ChartBlock.js'
import { MermaidDiagram } from './MermaidDiagram.js'
import styles from './CodeBlock.module.css'

/** 代码块标题栏：左侧语言名或视图切换，右侧复制 */
const CodeInfoRow = ({
  code,
  infostring,
  showDiagram,
  onToggleDiagram,
  chartView,
  onChangeChartView,
  copyContent,
}: {
  code: string
  infostring: string
  showDiagram: boolean
  onToggleDiagram?: () => void
  chartView?: ChartViewMode
  onChangeChartView?: (view: ChartViewMode) => void
  copyContent?: string | null
}) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  const textToCopy = copyContent === undefined ? code : copyContent
  return (
    <div className={styles.container}>
      {onChangeChartView && chartView ? (
        <div className="md-code-block-switch" aria-label={t('chartSwitchLabel')}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={chartView === 'chart'}
            onClick={() => onChangeChartView('chart')}
          >
            {t('chartViewChart')}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={chartView === 'table'}
            onClick={() => onChangeChartView('table')}
          >
            {t('chartViewTable')}
          </button>
        </div>
      ) : onToggleDiagram ? (
        <div className="md-code-block-switch" aria-label={t('mermaidSwitchLabel')}>
          <button
            type="button"
            className={styles.button}
            aria-pressed={showDiagram}
            onClick={() => !showDiagram && onToggleDiagram()}
          >
            {t('mermaidDiagram')}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={!showDiagram}
            onClick={() => showDiagram && onToggleDiagram()}
          >
            {t('mermaidCode')}
          </button>
        </div>
      ) : (
        <span className={styles.name}>{infostring}</span>
      )}
      {textToCopy !== null ? (
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            if (!(await copyText(textToCopy))) {
              showToast({ key: 'copyFailed' })
              return
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          <span>{t(copied ? 'copied' : 'copy')}</span>
        </button>
      ) : null}
    </div>
  )
}

/** 代码块：语言包按需加载，不支持或尚未加载的语言按纯文本显示 */
export const CodeBlock = memo(function CodeBlock({
  code,
  infostring,
  loading = false,
}: {
  code: string
  infostring: string
  loading?: boolean
}) {
  const locale = useSettings((state) => state.locale)
  const lowerLang = infostring.toLowerCase()
  const isMermaid = lowerLang === 'mermaid'
  const isChart = lowerLang === 'chart' || lowerLang === 'deepseek-chart'
  const [showDiagram, setShowDiagram] = useState(true)
  const [chartView, setChartView] = useState<ChartViewMode>('chart')
  const chartCopyContent = useMemo(() => {
    if (!isChart) {
      return undefined
    }
    const spec = parseChartSpec(code)
    return spec ? chartToPlainText(spec, locale) : null
  }, [code, isChart, locale])
  // 语言包注册在全局 Prism 上，每次渲染直接判断；加载完成后触发一次重渲染
  const rerender = useReducer((n: number) => n + 1, 0)[1]
  const lang = isChart ? null : getHighlightLang(infostring)
  const loaded = lang !== null && isHighlightLoaded(lang)
  useEffect(() => {
    if (lang === null || loaded) {
      return
    }
    let unmounted = false
    loadHighlight(lang).then(() => {
      if (!unmounted) {
        rerender()
      }
    })
    return () => {
      unmounted = true
    }
  }, [lang, loaded, rerender])
  const renderedHtml = useMemo(() => {
    if (isChart) {
      return ''
    }
    const name = lang !== null && loaded ? lang : 'plaintext'
    return Prism.highlight(code, Prism.languages[name], name)
  }, [code, isChart, lang, loaded])
  return (
    <div className="md-code-block">
      <div className="md-code-block-banner">
        <CodeInfoRow
          code={code}
          infostring={infostring}
          showDiagram={showDiagram}
          onToggleDiagram={isMermaid ? () => setShowDiagram((show) => !show) : undefined}
          chartView={isChart ? chartView : undefined}
          onChangeChartView={isChart ? setChartView : undefined}
          copyContent={chartCopyContent}
        />
      </div>
      {isChart ? (
        <ChartBlock code={code} view={chartView} loading={loading} />
      ) : isMermaid && showDiagram ? (
        <MermaidDiagram code={code} loading={loading} />
      ) : (
        <pre dangerouslySetInnerHTML={{ __html: renderedHtml }}></pre>
      )}
    </div>
  )
})
