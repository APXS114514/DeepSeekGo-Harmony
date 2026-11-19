import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useTranslate } from '../../i18n/index.js'
import { renderShareImage, type ShareContent, type ShareFormat } from '../../services/chat/share.js'
import { DeviceStatus, shareDeviceContent } from '../../services/harmony.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './ShareDialog.module.css'

const useShare = create<{ content: ShareContent | null }>(() => ({ content: null }))
export const openShare = (content: ShareContent) => useShare.setState({ content })
const closeShare = () => useShare.setState({ content: null })

const SharePreview = ({ content }: { content: ShareContent }) => {
  const t = useTranslate()
  const [format, setFormat] = useState<ShareFormat>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'shareFailed' | 'shareImageTooLong' | 'shareTooLarge' | null>(
    null
  )
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      let data: ArrayBuffer
      if (format === 'image') {
        const image = await renderShareImage(content.text)
        if (!image) {
          setError('shareImageTooLong')
          return
        }
        data = await image.arrayBuffer()
      } else {
        data = new TextEncoder().encode(content[format]).buffer
      }
      if (!active.current) {
        return
      }
      const status = await shareDeviceContent(format, data)
      if (status === DeviceStatus.ok) {
        closeShare()
      } else if (status !== DeviceStatus.cancelled) {
        setError(status === DeviceStatus.tooLarge ? 'shareTooLarge' : 'shareFailed')
      }
    } catch {
      setError('shareFailed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('sharePreview')}
      closable={!busy}
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={() => {
        if (!busy) {
          closeShare()
        }
      }}
      footer={
        <Button variant="primary" disabled={busy} onClick={() => void send()}>
          {t('shareAction')}
        </Button>
      }
    >
      <label className={styles.format}>
        {t('shareFormat')}
        <select
          value={format}
          disabled={busy}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (next === 'text' || next === 'markdown' || next === 'image') {
              setFormat(next)
              setError(null)
            }
          }}
        >
          <option value="text">{t('shareText')}</option>
          <option value="markdown">Markdown</option>
          <option value="image">{t('shareImage')}</option>
        </select>
      </label>
      <pre className={styles.preview} tabIndex={0} aria-label={t('sharePreviewBody')}>
        {format === 'markdown' ? content.markdown : content.text}
      </pre>
      {error ? <p role="alert">{t(error)}</p> : null}
    </Modal>
  )
}

export const ShareDialog = () => {
  const content = useShare((state) => state.content)
  return content ? <SharePreview content={content} /> : null
}
