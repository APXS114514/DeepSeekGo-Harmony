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
import { useBackLayer } from '../../services/backStack.js'
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
 * 鸿蒙系统离线语音输入：按住开始，松开后结束。引擎也会在检测到停顿后自动结束。
 * 识别中实时显示文字，松手确认后整段交给 onText。不经过 DeepSeek API。
 */
export const useDeviceVoiceInput = (onText: (text: string) => void) => {
  const available = useDeviceFeatures((state) => state.voice)
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const textRef = useRef({ committed: '', partial: '' })
  const operationRef = useRef(0)
  const startingRef = useRef(false)
  const stopAfterStart = useRef(false)
  const completedRef = useRef(false)
  const statusRef = useRef<VoiceInputStatus>('idle')
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const update = useCallback((next: VoiceInputStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const reset = useCallback(() => {
    startingRef.current = false
    stopAfterStart.current = false
    completedRef.current = false
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

  const commit = useCallback(() => {
    const text = (textRef.current.committed + textRef.current.partial).trim()
    reset()
    if (text) {
      onTextRef.current(text)
    } else {
      showToast({ key: 'voiceInputEmpty' })
    }
  }, [reset])

  useEffect(
    () =>
      bindDeviceVoice((event: DeviceVoiceEvent) => {
        if (statusRef.current === 'idle' || completedRef.current) {
          return
        }
        if (event.event === 'result') {
          textRef.current = mergeTranscript(textRef.current, event.text, event.final)
          setTranscript(textRef.current.committed + textRef.current.partial)
          return
        }
        operationRef.current++
        if (event.event === 'end') {
          // 引擎可先于松手结束。等手势确认，用户仍能上滑丢弃这段文字。
          if (statusRef.current === 'recording') {
            completedRef.current = true
          } else {
            commit()
          }
          return
        }
        if (event.event === 'error') {
          showToast({ key: 'voiceInputFailed' })
        }
        reset()
      }),
    [commit, reset]
  )

  const finish = useCallback(() => {
    if (statusRef.current !== 'recording') {
      return
    }
    if (completedRef.current) {
      commit()
      return
    }
    update('transcribing')
    if (startingRef.current) {
      stopAfterStart.current = true
    } else {
      stopDeviceVoice()
    }
  }, [commit, update])

  const start = useCallback(async () => {
    if (!available || statusRef.current !== 'idle') {
      return
    }
    const operation = ++operationRef.current
    textRef.current = { committed: '', partial: '' }
    setTranscript('')
    startingRef.current = true
    update('recording')
    const result = await startDeviceVoice()
    if (operationRef.current !== operation) {
      return
    }
    startingRef.current = false
    if (result === DeviceStatus.ok) {
      if (stopAfterStart.current) {
        stopAfterStart.current = false
        stopDeviceVoice()
      }
      return
    }
    reset()
    if (result === DeviceStatus.denied) {
      showToast({ key: 'harmonyMicrophoneDenied' })
    } else if (result !== DeviceStatus.cancelled) {
      showToast({ key: 'voiceInputFailed' })
    }
  }, [available, reset, update])

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

  useEffect(() => {
    const discardOnHide = () => {
      if (document.hidden && completedRef.current) {
        cancel()
      }
    }
    document.addEventListener('visibilitychange', discardOnHide)
    return () => document.removeEventListener('visibilitychange', discardOnHide)
  }, [cancel])

  // 收音或识别中按返回取消，不退出页面。
  useBackLayer(status !== 'idle', cancel)

  return { status, transcript, cancel, available, start, finish }
}
