import { useEffect, useRef, useState } from 'react'
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
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { IconCameraOutline16, IconPhotoOutline16, IconScanTextOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'

/** 鸿蒙版：拍照或从图库选图，在本机识别文字后插入输入框。不上传图片，也不需要 API Key。 */
export const ScanTextButton = ({
  disabled,
  onText,
}: {
  disabled: boolean
  onText: (text: string) => void
}) => {
  const t = useTranslate()
  const available = useDeviceFeatures((state) => state.scan)
  const supportsNativeMenu = useDeviceFeatures((state) => state.immersiveScanMenu)
  const immersiveLight = useSettings((state) => state.immersiveLight)
  const nativeMenu = supportsNativeMenu && immersiveLight
  const menu = useRef<{ open: () => void }>(null)
  const active = useRef(false)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  if (!available) {
    return null
  }

  const title = t('harmonyScanText')
  const camera = t('harmonyScanCamera')
  const album = t('harmonyScanAlbum')

  const scan = async (source: ScanSource) => {
    setBusy(true)
    try {
      const { status, text } = await scanDeviceText(source)
      if (status === DeviceStatus.ok) {
        const value = text.trim()
        if (value) {
          onText(value)
        } else {
          showToast({ key: 'harmonyScanEmpty' })
        }
      } else if (status !== DeviceStatus.cancelled) {
        showToast({ key: 'harmonyScanFailed' })
      }
    } finally {
      setBusy(false)
    }
  }

  const choose = async () => {
    setChoosing(true)
    triggerDeviceHaptic('menu')
    const source = await chooseDeviceScanSource({ title, camera, album, cancel: t('cancel') })
    if (!active.current) {
      return
    }
    setChoosing(false)
    if (source === 'unavailable') {
      menu.current?.open()
    } else if (source !== 'cancelled') {
      void scan(source)
    }
  }

  return (
    <Menu
      controlRef={menu}
      options={[
        {
          key: 'camera',
          label: camera,
          icon: <IconCameraOutline16 />,
          onSelect: () => void scan('camera'),
        },
        {
          key: 'album',
          label: album,
          icon: <IconPhotoOutline16 />,
          onSelect: () => void scan('album'),
        },
      ]}
    >
      {({ open, toggle }) => (
        <IconButton
          size="m"
          tone="primary"
          icon={<IconScanTextOutline16 />}
          tooltip={busy ? t('harmonyScanBusy') : title}
          aria-expanded={open || choosing}
          aria-haspopup={nativeMenu && !open ? 'dialog' : 'menu'}
          aria-busy={busy}
          disabled={disabled || busy || choosing}
          onClick={nativeMenu && !open ? () => void choose() : toggle}
        />
      )}
    </Menu>
  )
}
