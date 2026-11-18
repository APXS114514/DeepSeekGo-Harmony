import { useEffect } from 'react'
import { openSettings } from '../components/settings/settingsDialogState.js'
import {
  closeMobileSider,
  openMobileSider,
  useMobileSider,
} from '../components/sider/mobileSiderState.js'
import { newChat } from '../services/chat/store.js'
import { useDeviceFeatures } from '../services/harmony.js'
import { setSiderCollapsed, useSettings } from '../services/settings.js'

/** 鸿蒙版键盘快捷键；2in1 和外接键盘的平板都可用，提示只在 2in1 上显示。 */
export const SHORTCUTS = {
  newChat: 'Ctrl+N',
  toggleSider: 'Ctrl+B',
  settings: 'Ctrl+,',
} as const

/** 2in1 上在按钮提示后附带快捷键，例如「开启新对话（Ctrl+N）」。 */
export const useShortcutHint = () => {
  const keyboard = useDeviceFeatures((state) => state.keyboard)
  return (label: string, shortcut: string) => (keyboard ? `${label}（${shortcut}）` : label)
}

export const useKeyboardShortcuts = (isMobile: boolean) => {
  useEffect(() => {
    if (!__HARMONY_APP__) {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'n') {
        newChat()
        closeMobileSider()
      } else if (key === 'b') {
        if (isMobile) {
          if (useMobileSider.getState().open) {
            closeMobileSider()
          } else {
            openMobileSider()
          }
        } else {
          setSiderCollapsed(!useSettings.getState().siderCollapsed)
        }
      } else if (key === ',') {
        openSettings('general')
      } else {
        return
      }
      event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobile])
}
