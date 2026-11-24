import { triggerDeviceHaptic } from '../services/harmony.js'

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      triggerDeviceHaptic('copy')
      return true
    }
  } catch {
    // 剪贴板权限受限时尝试兼容方式。
  }

  // 兼容手机通过局域网 HTTP 访问的情况。
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'

  try {
    document.body.appendChild(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const ok = document.execCommand('copy')
    if (ok) {
      triggerDeviceHaptic('copy')
    }
    return ok
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
