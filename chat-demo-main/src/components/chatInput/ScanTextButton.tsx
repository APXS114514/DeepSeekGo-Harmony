import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { DeviceStatus, scanDeviceText, useDeviceFeatures } from '../../services/harmony.js'
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
  const [busy, setBusy] = useState(false)

  if (!available) {
    return null
  }

  const scan = async (source: 'camera' | 'album') => {
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

  return (
    <Menu
      options={[
        {
          key: 'camera',
          label: t('harmonyScanCamera'),
          icon: <IconCameraOutline16 />,
          onSelect: () => void scan('camera'),
        },
        {
          key: 'album',
          label: t('harmonyScanAlbum'),
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
          tooltip={busy ? t('harmonyScanBusy') : t('harmonyScanText')}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-busy={busy}
          disabled={disabled || busy}
          onClick={toggle}
        />
      )}
    </Menu>
  )
}
