import { useRef } from 'react'
import { useTranslate } from '../../i18n/index.js'
import type { VoiceInputStatus } from './useVoiceInput.js'
import styles from './ChatInput.module.css'

export const HoldToSpeak = ({
  status,
  transcript,
  disabled,
  start,
  finish,
  cancel,
}: {
  status: VoiceInputStatus
  transcript: string
  disabled: boolean
  start: () => void
  finish: () => void
  cancel: () => void
}) => {
  const t = useTranslate()
  const held = useRef<number | string | null>(null)
  const listening = status === 'recording'
  const label = t(
    listening
      ? 'holdVoiceRelease'
      : status === 'transcribing'
        ? 'harmonyVoiceFinishing'
        : 'holdVoiceSpeak'
  )
  const release = (key: number | string, aborted: boolean) => {
    if (held.current === key) {
      held.current = null
      if (aborted) {
        cancel()
      } else {
        finish()
      }
    }
  }
  return (
    <button
      type="button"
      disabled={disabled}
      className={styles.holdToSpeak}
      aria-label={label}
      aria-pressed={listening}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.isPrimary && event.button === 0 && held.current === null && status === 'idle') {
          event.currentTarget.setPointerCapture(event.pointerId)
          held.current = event.pointerId
          start()
        }
      }}
      onPointerUp={(event) => release(event.pointerId, false)}
      onPointerCancel={(event) => release(event.pointerId, true)}
      onLostPointerCapture={(event) => release(event.pointerId, true)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          if (!event.repeat && held.current === null && status === 'idle') {
            held.current = event.key
            start()
          }
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          release(event.key, false)
        }
      }}
      onBlur={() => {
        if (typeof held.current === 'string') {
          release(held.current, true)
        }
      }}
      onClick={(event) => {
        if (event.detail === 0 && held.current === null) {
          if (status === 'idle') {
            start()
          } else if (listening) {
            finish()
          }
        }
      }}
    >
      {listening && transcript ? transcript : label}
    </button>
  )
}
