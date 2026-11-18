import { showToast } from '../components/base/toastState.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { addDraftFiles, getDraft, setDraftText } from '../services/chat/drafts.js'
import { newChat, useChatStore } from '../services/chat/store.js'
import type { SharedContent } from '../services/harmony.js'
import { useSettings } from '../services/settings.js'

const decodeFile = (name: string, data: string): File | null => {
  try {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new File([bytes], name)
  } catch {
    return null
  }
}

/**
 * 其他应用分享来的内容放进新对话的草稿：文字接在已有草稿后面，图片和文档作为附件上传。
 * 只填入不发送，用户确认后再发。
 */
export const receiveSharedContent = ({ items, skipped }: SharedContent) => {
  if (useChatStore.getState().importingHistory) {
    showToast({ key: 'harmonyShareBusy' })
    return
  }
  newChat()
  closeMobileSider()

  const text = items
    .flatMap((item) => (item.kind === 'text' ? [item.text.trim()] : []))
    .filter(Boolean)
    .join('\n\n')
  if (text) {
    const current = getDraft(null).text.trimEnd()
    setDraftText(null, current ? `${current}\n\n${text}` : text)
  }

  let failed = skipped
  const files: File[] = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = decodeFile(item.name, item.data)
      if (file) {
        files.push(file)
      } else {
        failed++
      }
    }
  }
  if (files.length > 0 && ensureApiKey()) {
    const error = addDraftFiles(null, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
      return
    }
  }
  if (failed > 0) {
    showToast({ key: 'harmonyShareSkipped', params: { count: failed } })
  } else if (text || files.length > 0) {
    showToast({ key: 'harmonyShareReceived' })
  }
}
