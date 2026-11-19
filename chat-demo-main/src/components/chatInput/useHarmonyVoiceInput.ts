import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribe } from '../../services/api/speech.js'
import { useBackLayer } from '../../services/backStack.js'
import { useDeviceFeatures } from '../../services/harmony.js'
import { useSettings } from '../../services/settings.js'
import { startRecording, type Recording } from '../../services/speech/recorder.js'
import { showToast } from '../base/toastState.js'
import { useDeviceVoiceInput } from './useDeviceVoiceInput.js'
import type { VoiceInputStatus } from './useVoiceInput.js'

type Capture = {
  controller: AbortController
  key: string
  recording?: Recording
  confirmed: boolean
}

const useApiHold = (onText: (text: string) => void) => {
  const microphone = useDeviceFeatures((state) => state.apiVoice)
  const available = microphone && typeof navigator.mediaDevices?.getUserMedia === 'function'
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const capture = useRef<Capture | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const release = useCallback(() => {
    const current = capture.current
    capture.current = null
    current?.controller.abort()
    current?.recording?.cancel()
  }, [])
  const cancel = useCallback(() => {
    release()
    setStatus('idle')
  }, [release])

  const submit = useCallback(
    async (current: Capture) => {
      if (!current.recording || capture.current !== current) {
        return
      }
      const recording = current.recording
      current.recording = undefined
      try {
        const audio = await recording.stop()
        if (capture.current !== current) {
          return
        }
        const text = audio
          ? (await transcribe(current.key, audio, current.controller.signal)).trim()
          : ''
        if (capture.current === current) {
          if (text) {
            onTextRef.current(text)
          } else {
            showToast({ key: 'voiceInputEmpty' })
          }
        }
      } catch {
        if (capture.current === current) {
          showToast({ key: 'voiceInputFailed' })
        }
      } finally {
        recording.cancel()
        if (capture.current === current) {
          cancel()
        }
      }
    },
    [cancel]
  )

  const finish = useCallback(() => {
    const current = capture.current
    if (current && !current.confirmed) {
      current.confirmed = true
      setStatus('transcribing')
      void submit(current)
    }
  }, [submit])

  const start = useCallback(async () => {
    if (!available || capture.current) {
      return
    }
    const key = useSettings.getState().apiKey
    if (!key) {
      showToast({ key: 'settingsVoiceApiKeyRequired' })
      return
    }
    const current: Capture = { controller: new AbortController(), key, confirmed: false }
    capture.current = current
    setStatus('recording')
    try {
      let capped: Promise<Blob | null> | undefined
      const recording = await startRecording(() => {
        // 到上限即释放麦克风，仍等松手确认后才上传。
        if (capture.current === current && current.recording) {
          capped = current.recording.stop()
          void capped.catch(() => {})
          showToast({ key: 'voiceInputLimitReached' })
        }
      })
      if (capture.current !== current) {
        recording.cancel()
        return
      }
      current.recording = { ...recording, stop: () => capped ?? recording.stop() }
      if (current.confirmed) {
        void submit(current)
      }
    } catch (error) {
      if (capture.current === current) {
        cancel()
        showToast({
          key:
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'harmonyMicrophoneDenied'
              : 'voiceInputFailed',
        })
      }
    }
  }, [available, cancel, submit])

  useEffect(() => release, [release])
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        cancel()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [cancel])

  return { available, status, transcript: '', start, finish, cancel }
}

export const useHarmonyVoiceInput = (onText: (text: string) => void) => {
  const mode = useSettings((state) => state.voiceInputMode)
  const local = useDeviceVoiceInput(onText)
  const api = useApiHold(onText)
  const voice = mode === 'api' ? api : local
  const cancelApi = api.cancel
  const cancelLocal = local.cancel
  useEffect(() => {
    if (mode === 'api') {
      cancelLocal()
    } else {
      cancelApi()
    }
  }, [cancelApi, cancelLocal, mode])
  useBackLayer(voice.status !== 'idle', voice.cancel)
  return voice
}
