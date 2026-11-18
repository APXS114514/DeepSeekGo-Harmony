import { useEffect } from 'react'
import { translate } from '../i18n/index.js'
import { getReplyText } from '../services/chat/reply.js'
import { onReplyDone, useChatStore } from '../services/chat/store.js'
import { notifyReplyDone, requestNotificationPermission } from '../services/harmony.js'
import { takeReplyNotifyPrompt, useSettings } from '../services/settings.js'

/** 通知里的回答摘要：去掉代码块和 Markdown 标记，压成一行。 */
export const toNotificationText = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * 鸿蒙版：回答完成后交给原生，应用在后台时由原生发系统通知。
 * 无痕对话只提示完成，不在通知里显示内容。首次开始生成时请求一次通知授权。
 */
export const useReplyNotifications = () => {
  useEffect(() => {
    if (!__HARMONY_APP__) {
      return undefined
    }
    const unsubscribe = onReplyDone((session, reply) => {
      if (!useSettings.getState().replyNotify) {
        return
      }
      const preview = session.ephemeral ? '' : toNotificationText(getReplyText(reply))
      notifyReplyDone({
        sessionId: session.id,
        title: session.ephemeral
          ? translate('incognitoTitle')
          : session.title || translate('untitledChat'),
        text: preview || translate('replyDoneNotification'),
      })
    })
    const unwatch = useChatStore.subscribe((state, previous) => {
      const started =
        Object.keys(state.streaming).length > 0 && Object.keys(previous.streaming).length === 0
      if (started && useSettings.getState().replyNotify && takeReplyNotifyPrompt()) {
        void requestNotificationPermission()
      }
    })
    return () => {
      unsubscribe()
      unwatch()
    }
  }, [])
}
