import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { IconEditOutline16, IconUndoOutline16 } from '../base/icons.js'
import { editMessage, recallLastTurn, retryUpload } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { UserMessage as UserMessageType } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import { MessageFile } from './MessageFile.js'
import { useBackLayer } from '../../services/backStack.js'
import { CopyButton } from './CopyButton.js'
import styles from './UserMessage.module.css'

export const UserMessage = memo(function UserMessage({
  sessionId,
  message,
  retryUploadId,
  isFirst,
  isLast,
  canRecall,
  onRecalled,
  busy,
  editing,
  editorRef,
  onEdit,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: UserMessageType
  /** 回答因补传附件失败可重试时为该回答 id */
  retryUploadId: string | null
  isFirst: boolean
  isLast: boolean
  canRecall: boolean
  onRecalled?: () => void
  busy: boolean
  editing: boolean
  editorRef?: Ref<HTMLDivElement>
  onEdit: (messageId: string | null) => void
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const [draft, setDraft] = useState(message.content)
  const [recalling, setRecalling] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()
  const canSend = !busy && (draft.trim() !== '' || message.files.length > 0)
  useBackLayer(editing, () => onEdit(null))

  useLayoutEffect(() => {
    if (editing) {
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [editing])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (editing && textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [editing, draft])

  const sendEdit = () => {
    if (canSend && ensureApiKey() && editMessage(sessionId, message.id, draft.trim())) {
      stopReadAloud()
      onEdit(null)
    }
  }

  return (
    <div
      className={clsx(styles.container, isFirst && styles.isFirst)}
      data-history-message={message.id}
      tabIndex={-1}
    >
      {message.files.length > 0 ? (
        <div
          className={clsx(
            styles.files,
            message.files.some((file) => !file.isImage) && styles.filesWithDocuments
          )}
        >
          {message.files.map((file) => (
            <MessageFile
              key={file.id}
              file={file}
              onRetry={retryUploadId ? () => retryUpload(sessionId, retryUploadId) : null}
            />
          ))}
        </div>
      ) : null}
      {editing ? (
        <div ref={editorRef} className={styles.editor} data-content-enter>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            aria-label={t('editMessage')}
            rows={1}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return
              }
              if (event.key === 'Escape') {
                onEdit(null)
              } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !isMobile) {
                event.preventDefault()
                sendEdit()
              }
            }}
          />
          <div className={styles.editorActions}>
            <Button size="s" variant="outlined" onClick={() => onEdit(null)}>
              {t('cancel')}
            </Button>
            <Button size="s" disabled={!canSend} onClick={sendEdit}>
              {t('send')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {message.content ? <div className={styles.bubble}>{message.content}</div> : null}
          <div className={styles.bottom}>
            <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
              {message.content ? <CopyButton text={message.content} /> : null}
              <IconButton
                icon={<IconEditOutline16 />}
                tooltip={t('editMessage')}
                tooltipPlacement="bottom"
                disabled={busy || recalling}
                onClick={() => {
                  setDraft(message.content)
                  onEdit(message.id)
                }}
              />
              {canRecall ? (
                <IconButton
                  icon={<IconUndoOutline16 />}
                  tooltip={t('recallLastTurn')}
                  tooltipPlacement="bottom"
                  disabled={recalling}
                  onClick={async () => {
                    if (recalling) {
                      return
                    }
                    setRecalling(true)
                    stopReadAloud()
                    closeSearchPanel()
                    try {
                      const result = await recallLastTurn(sessionId)
                      if (result.ok) {
                        if (result.missingFiles) {
                          showToast({ key: 'recallMissingFiles' })
                        }
                        onRecalled?.()
                      }
                    } finally {
                      setRecalling(false)
                    }
                  }}
                />
              ) : null}
            </div>
            <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          </div>
        </>
      )}
    </div>
  )
})
