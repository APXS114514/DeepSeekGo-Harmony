import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  chooseDeviceScanSource,
  DeviceStatus,
  scanDeviceText,
  triggerDeviceHaptic,
  useDeviceFeatures,
  type ScanSource,
} from '../../services/harmony.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

/** 鸿蒙版：拍照或从图库选图，在本机识别文字后插入输入框。不上传图片，也不需要 API Key。 */
export const useScanText = ({
  disabled,
  onText,
  onOpenWebSourceMenu,
}: {
  disabled: boolean
  onText: (text: string) => void
  onOpenWebSourceMenu: () => void
}) => {
  const t = useTranslate()
  const available = useDeviceFeatures((state) => state.scan)
  const supportsNativeMenu = useDeviceFeatures((state) => state.immersiveScanMenu)
  const immersiveLight = useSettings((state) => state.immersiveLight)
  const nativeMenu = supportsNativeMenu && immersiveLight

  const activeRef = useRef(true)
  const busyRef = useRef(false)
  const choosingRef = useRef(false)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const onOpenWebSourceMenuRef = useRef(onOpenWebSourceMenu)
  onOpenWebSourceMenuRef.current = onOpenWebSourceMenu

  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  const scan = useCallback(async (source: ScanSource) => {
    if (disabledRef.current || busyRef.current || choosingRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const { status, text } = await scanDeviceText(source)
      if (!activeRef.current) {
        return
      }
      if (status === DeviceStatus.ok) {
        const value = text.trim()
        if (value) {
          onTextRef.current(value)
        } else {
          showToast({ key: 'harmonyScanEmpty' })
        }
      } else if (status !== DeviceStatus.cancelled) {
        showToast({ key: 'harmonyScanFailed' })
      }
    } finally {
      busyRef.current = false
      if (activeRef.current) {
        setBusy(false)
      }
    }
  }, [])

  const chooseSource = useCallback(async () => {
    if (!available || disabledRef.current || busyRef.current || choosingRef.current) {
      return
    }
    if (!nativeMenu) {
      onOpenWebSourceMenuRef.current()
      return
    }
    choosingRef.current = true
    setChoosing(true)
    triggerDeviceHaptic('menu')
    const source = await chooseDeviceScanSource({
      title: t('harmonyScanText'),
      camera: t('harmonyScanCamera'),
      album: t('harmonyScanAlbum'),
      cancel: t('cancel'),
    })
    choosingRef.current = false
    if (!activeRef.current) {
      return
    }
    setChoosing(false)
    if (source === 'unavailable') {
      onOpenWebSourceMenuRef.current()
    } else if (source !== 'cancelled') {
      void scan(source)
    }
  }, [available, nativeMenu, scan, t])

  const isBusy = useCallback(() => busyRef.current || choosingRef.current, [])

  return {
    available,
    busy,
    choosing,
    isBusy,
    scan,
    chooseSource,
  }
}
