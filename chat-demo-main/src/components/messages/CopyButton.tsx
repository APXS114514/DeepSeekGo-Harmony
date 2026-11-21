import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconCheckOutline16, IconCopyOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { plainAnswer } from '../../services/markdown/plainText.js'
import { copyText } from '../../utils/clipboard.js'

/** 复制成功后图标换成对勾 1 秒，期间再次点击不重复复制 */
export const CopyButton = ({ text, drag = false }: { text: string; drag?: boolean }) => {
  const t = useTranslate()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <IconButton
      icon={copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
      tooltip={drag ? `${t('copy')} · ${t('dragAnswer')}` : t('copy')}
      aria-label={t('copy')}
      draggable={drag || undefined}
      onDragStart={
        drag
          ? (event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData('text/plain', plainAnswer(text) || text)
            }
          : undefined
      }
      tooltipPlacement="bottom"
      onClick={async () => {
        if (copied) {
          return
        }
        if (!(await copyText(text))) {
          showToast({ key: 'copyFailed' })
          return
        }
        setCopied(true)
        timerRef.current = setTimeout(() => setCopied(false), 1000)
      }}
    />
  )
}
