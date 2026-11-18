import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bindDeviceVoice,
  cancelDeviceVoice,
  DeviceStatus,
  startDeviceVoice,
  stopDeviceVoice,
  useDeviceFeatures,
  type DeviceVoiceEvent,
} from '../../services/harmony.js'
import { showToast } from '../base/toastState.js'
import type { VoiceInputStatus } from './useVoiceInput.js'

/**
 * 合并识别结果。不同模式下引擎可能返回整句累计结果，也可能逐段返回，
 * 已确认的段落保存在 committed，未确认的部分实时替换。
 */
export const mergeTranscript = (
  current: { committed: string; partial: string },
  text: string,
  final: boolean
) => {
  const { committed } = current
  const cumulative = committed !== '' && text.startsWith(committed)
  if (final) {
    return { committed: cumulative ? text : committed + text, partial: '' }
  }
  return { committed, partial: cumulative ? text.slice(committed.length) : text }
}

/**
 * 鸿蒙系统离线语音输入：点击开始，引擎检测到停顿后自动结束，也可再次点击提前结束。
 * 识别中实时显示文字，结束后整段交给 onText。不经过 DeepSeek API。
 */
export const useDeviceVoiceInput = (onText: (text: string) => void) => {
  const available = useDeviceFeatures((state) => state.voice)
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const textRef = useRef({ committed: '', partial: '' })
  const operationRef = useRef(0)
  const statusRef = useRef<VoiceInputStatus>('idle')
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const update = useCallback((next: VoiceInputStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const reset = useCallback(() => {
    textRef.current = { committed: '', partial: '' }
    setTranscript('')
    update('idle')
  }, [update])

  const cancel = useCallback(() => {
    operationRef.current++
    if (statusRef.current !== 'idle') {
      cancelDeviceVoice()
    }
    reset()
  }, [reset])

  useEffect(
    () =>
      bindDeviceVoice((event: DeviceVoiceEvent) => {
        if (statusRef.current === 'idle') {
          return
        }
        if (event.event === 'result') {
          textRef.current = mergeTranscript(textRef.current, event.text, event.final)
          setTranscript(textRef.current.committed + textRef.current.partial)
          return
        }
        operationRef.current++
        const text = (textRef.current.committed + textRef.current.partial).trim()
        if (event.event === 'end') {
          if (text) {
            onTextRef.current(text)
          } else {
            showToast({ key: 'voiceInputEmpty' })
          }
        } else if (event.event === 'error') {
          showToast({ key: 'voiceInputFailed' })
        }
        reset()
      }),
    [reset]
  )

  const toggle = useCallback(async () => {
    if (!available) {
      return
    }
    if (statusRef.current === 'recording') {
      update('transcribing')
      stopDeviceVoice()
      return
    }
    if (statusRef.current === 'transcribing') {
      cancel()
      return
    }
    const operation = ++operationRef.current
    textRef.current = { committed: '', partial: '' }
    setTranscript('')
    update('recording')
    const result = await startDeviceVoice()
    if (operationRef.current !== operation || result === DeviceStatus.ok) {
      return
    }
    reset()
    if (result === DeviceStatus.denied) {
      showToast({ key: 'harmonyMicrophoneDenied' })
    } else if (result !== DeviceStatus.cancelled) {
      showToast({ key: 'voiceInputFailed' })
    }
  }, [available, cancel, reset, update])

  useEffect(() => {
    if (status !== 'recording') {
      return
    }
    const startedAt = Date.now()
    setSeconds(0)
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)
    return () => clearInterval(timer)
  }, [status])

  // 切换会话或卸载输入框时停止收音。
  useEffect(
    () => () => {
      operationRef.current++
      if (statusRef.current !== 'idle') {
        cancelDeviceVoice()
      }
    },
    []
  )

  const getAnalyser = useCallback((): AnalyserNode | null => null, [])

  return { status, seconds, transcript, getAnalyser, toggle, cancel, available }
}
