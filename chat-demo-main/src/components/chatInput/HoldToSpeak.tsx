import { useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { triggerDeviceHaptic } from '../../services/harmony.js'
import type { VoiceInputStatus } from './useVoiceInput.js'
import styles from './ChatInput.module.css'

const SWIPE_CANCEL_DISTANCE = 56
type PointerHold = { key: number; startY: number; scale: number; cancelling: boolean }

const shouldCancelSwipe = (hold: PointerHold, clientY: number) =>
  (hold.startY - clientY) * hold.scale >= SWIPE_CANCEL_DISTANCE

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
  const held = useRef<PointerHold | null>(null)
  const [pointerPhase, setPointerPhase] = useState<'holding' | 'cancelling' | null>(null)
  const listening = status === 'recording'
  const cancelArmed = listening && pointerPhase === 'cancelling'
  const showSwipeHint = listening && pointerPhase === 'holding'
  const label = t(
    cancelArmed
      ? 'holdVoiceCancelRelease'
      : listening
        ? 'holdVoiceRelease'
        : status === 'transcribing'
          ? 'harmonyVoiceFinishing'
          : 'holdVoiceSpeak'
  )
  const release = (key: number, aborted: boolean) => {
    if (held.current?.key === key) {
      held.current = null
      setPointerPhase(null)
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
      aria-label={
        pointerPhase
          ? label
          : t(
              listening
                ? 'voiceAccessibleFinish'
                : status === 'transcribing'
                  ? 'voiceAccessibleCancel'
                  : 'holdVoiceSpeak'
            )
      }
      aria-pressed={listening}
      data-cancel-armed={cancelArmed ? '' : undefined}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.isPrimary && event.button === 0 && held.current === null && status === 'idle') {
          event.currentTarget.setPointerCapture(event.pointerId)
          held.current = {
            key: event.pointerId,
            startY: event.clientY,
            scale: window.visualViewport?.scale ?? 1,
            cancelling: false,
          }
          setPointerPhase('holding')
          triggerDeviceHaptic('voice-start')
          start()
        }
      }}
      onPointerMove={(event) => {
        const hold = held.current
        if (hold?.key === event.pointerId) {
          const cancelling = shouldCancelSwipe(hold, event.clientY)
          if (cancelling && !hold.cancelling) {
            triggerDeviceHaptic('voice-cancel')
          }
          hold.cancelling = cancelling
          setPointerPhase(cancelling ? 'cancelling' : 'holding')
        }
      }}
      onPointerUp={(event) => {
        const hold = held.current
        if (hold?.key === event.pointerId) {
          release(event.pointerId, shouldCancelSwipe(hold, event.clientY))
        }
      }}
      onPointerCancel={(event) => release(event.pointerId, true)}
      onLostPointerCapture={(event) => release(event.pointerId, true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && status !== 'idle') {
          event.preventDefault()
          held.current = null
          setPointerPhase(null)
          cancel()
        }
      }}
      onClick={(event) => {
        if (event.detail === 0 && held.current === null) {
          if (status === 'idle') {
            start()
          } else if (listening) {
            finish()
          } else {
            cancel()
          }
        }
      }}
    >
      <span className={styles.voiceLine}>
        {listening && !cancelArmed && transcript ? transcript : label}
      </span>
      {showSwipeHint ? <span className={styles.voiceHint}>{t('holdVoiceSwipeCancel')}</span> : null}
    </button>
  )
}
