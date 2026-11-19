import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useTranslate } from '../../i18n/index.js'
import {
  findHistory,
  useHistoryLocation,
  type HistoryMatch,
} from '../../services/chat/historySearch.js'
import { selectSession, useChatStore } from '../../services/chat/store.js'
import { Modal } from '../base/Modal.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'
import styles from './HistorySearch.module.css'

const useOpen = create(() => ({ open: false }))
export const openHistorySearch = () => useOpen.setState({ open: true })
const close = () => useOpen.setState({ open: false })

const Search = () => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const importing = useChatStore((state) => state.importingHistory !== false)
  const [value, setValue] = useState('')
  const [retry, setRetry] = useState(0)
  const [results, setResults] = useState<HistoryMatch[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const query = value.trim()

  useEffect(() => {
    setResults([])
    if (!query || importing) {
      setStatus('idle')
      return
    }
    setStatus('searching')
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void findHistory(sessions, query, controller.signal, setResults).then(
        () => setStatus('done'),
        () => {
          if (!controller.signal.aborted) {
            setStatus('error')
          }
        }
      )
    }, 160)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [importing, query, retry, sessions])

  return (
    <Modal
      title={t('historySearch')}
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={close}
    >
      <input
        type="search"
        autoFocus
        aria-label={t('historySearchPlaceholder')}
        placeholder={t('historySearchPlaceholder')}
        className={styles.input}
        value={value}
        maxLength={140}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <p role="status" className={styles.status}>
        {status === 'searching'
          ? t('historySearching')
          : status === 'done'
            ? t(results.length ? 'historySearchCount' : 'historySearchEmpty', {
                count: results.length,
              })
            : status === 'error'
              ? t('historySearchFailed')
              : ''}
      </p>
      {status === 'error' ? (
        <button
          type="button"
          className={styles.result}
          onClick={() => setRetry((count) => count + 1)}
        >
          {t('retry')}
        </button>
      ) : null}
      <ul className={styles.results}>
        {results.map(({ session, messageId, excerpt }) => (
          <li key={JSON.stringify([session.id, messageId])}>
            <button
              type="button"
              className={styles.result}
              onClick={() => {
                if (useChatStore.getState().importingHistory) {
                  return
                }
                useHistoryLocation.setState({
                  target: messageId ? { sessionId: session.id, messageId } : null,
                })
                selectSession(session.id)
                close()
                closeMobileSider()
              }}
            >
              <strong>{session.title || t('untitledChat')}</strong>
              {excerpt ? <span>{excerpt}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export const HistorySearch = () => (useOpen((state) => state.open) ? <Search /> : null)
