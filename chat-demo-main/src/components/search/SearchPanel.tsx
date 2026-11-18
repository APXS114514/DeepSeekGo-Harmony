import { useState, type Ref } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeSearchPanel, useSearchPanel } from './searchPanelState.js'
import { SourceCard } from './SourceCard.js'
import styles from './SearchPanel.module.css'

/** 右侧「搜索结果」面板 */
export const SearchPanel = ({
  panelRef,
  closing,
}: {
  panelRef: Ref<HTMLElement>
  closing: boolean
}) => {
  const t = useTranslate()
  const sources = useSearchPanel((state) => state.sources)
  const [lastSources, setLastSources] = useState(sources)
  if (!closing && sources !== lastSources) {
    setLastSources(sources)
  }
  return (
    <aside ref={panelRef} className={styles.panel} data-closing={closing ? '' : undefined}>
      <div className={styles.header}>
        <div role="heading" className={styles.title}>
          {t('searchResult')}
        </div>
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          onClick={closeSearchPanel}
        />
      </div>
      <div className={styles.content}>
        {(closing ? lastSources : sources).map((source) => (
          <SourceCard key={source.url} source={source} className={styles.item} />
        ))}
      </div>
    </aside>
  )
}
