import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  IconGlobeLanguageOutline14,
  IconKeyboardOutline16,
  IconMicOutline16,
  IconPaperclipOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import {
  carryDraftToNewChat,
  sendMessage,
  stopReply,
  useChatStore,
} from '../../services/chat/store.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import {
  CHAT_SYSTEM_PROMPT,
  estimateContext,
  getHistoryContext,
  matchesRejectedDraft,
} from '../../services/chat/context.js'
import { buildSystemPrompt, usePersonalization } from '../../services/personalization.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  hasDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { ContextNotice } from './ContextNotice.js'
import { useVoiceInput } from './useVoiceInput.js'
import { useHarmonyVoiceInput } from './useHarmonyVoiceInput.js'
import { ScanTextButton } from './ScanTextButton.js'
import { VoiceButton } from './VoiceButton.js'
import { HoldToSpeak } from './HoldToSpeak.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 鸿蒙版使用系统离线语音识别，网页版录音后调用转写接口。 */
const useChatVoiceInput = __HARMONY_APP__ ? useHarmonyVoiceInput : useVoiceInput
const EMPTY_CONTEXT = getHistoryContext([])

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const hasInput = text.trim() !== '' || attachments.length > 0
  const [voiceMode, setVoiceMode] = useState(false)
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const session = useChatStore((state) =>
    sessionId !== null && !state.streaming[sessionId] ? state.sessionCache[sessionId] : undefined
  )
  const history = useMemo(
    () => (session ? getHistoryContext(getVisibleMessages(session)) : EMPTY_CONTEXT),
    [session]
  )
  const system = usePersonalization(() =>
    buildSystemPrompt(CHAT_SYSTEM_PROMPT, { memory: !session?.ephemeral })
  )
  const thinking = useSettings((state) => state.thinking)
  const search = useSettings((state) => state.search)
  const estimate = useMemo(
    () => estimateContext(history, draft, system, thinking),
    [history, draft, system, thinking]
  )
  const rejectedDraft = matchesRejectedDraft(draft, history.rejected, { thinking, search })
  const showRejected = rejectedDraft || (history.rejected !== null && !hasDraft(draft))
  const attachmentCount = hasDraft(draft)
    ? attachments.length
    : (history.rejected?.question.files.length ?? 0)
  const [carrying, setCarrying] = useState(false)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写或识字结果插入到光标处，并把光标移到插入内容之后 */
  const insertText = (inserted: string) => {
    setVoiceMode(false)
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + inserted + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + inserted.length, start + inserted.length)
    })
  }
  const voice = useChatVoiceInput((transcript) => {
    if (__HARMONY_APP__) {
      const current = getDraft(sessionId).text
      setText(current ? `${current}\n${transcript}` : transcript)
      setVoiceMode(false)
    } else {
      insertText(transcript)
    }
  })
  const holdVoice = 'start' in voice && voice.available && voiceMode && !hasInput && !streaming
  const cancelVoice = voice.cancel

  useEffect(() => {
    if (voiceMode && (hasInput || streaming || !voice.available)) {
      cancelVoice()
      setVoiceMode(false)
    }
  }, [cancelVoice, hasInput, streaming, voice.available, voiceMode])

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容；鸿蒙版改为实时显示识别文字
  const recording = voice.status === 'recording'
  const listening = __HARMONY_APP__ && voice.status !== 'idle'

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend =
    !importingHistory &&
    !streaming &&
    !rejectedDraft &&
    !carrying &&
    voice.status === 'idle' &&
    draftReady

  const carryDraft = async () => {
    if (sessionId === null || carrying) {
      return
    }
    setCarrying(true)
    try {
      if (!(await carryDraftToNewChat(sessionId))) {
        showToast({ key: 'contextCarryFailed' })
      }
    } finally {
      setCarrying(false)
    }
  }

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      carrying ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  const composer = (
    <div
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      data-voice-active={voice.status === 'idle' ? undefined : ''}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      <div className={styles.textareaWrapper} hidden={holdVoice}>
        <textarea
          ref={textareaRef}
          className={clsx(
            styles.textarea,
            ((recording && isMobile) || listening) && styles.textareaHidden
          )}
          placeholder={t('chatInputPlaceholderChat')}
          rows={__HARMONY_APP__ ? 1 : 2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          disabled={importingHistory}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {'getAnalyser' in voice && recording && isMobile ? (
          <Spectrum getAnalyser={voice.getAnalyser} />
        ) : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      {holdVoice ? (
        <HoldToSpeak
          status={voice.status}
          transcript={voice.transcript}
          disabled={importingHistory}
          start={() => {
            stopReadAloud()
            void voice.start()
          }}
          finish={voice.finish}
          cancel={voice.cancel}
        />
      ) : null}
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          <Tooltip content={t('deactivatedThinkTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, thinking && styles.selected)}
              aria-label={t('thinkingSwitch')}
              aria-pressed={thinking}
              onClick={() => setThinking(!thinking)}
            >
              <IconThinkOutline14 />
              <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
            </button>
          </Tooltip>
          <Tooltip content={t('deactivatedSearchTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          {__HARMONY_APP__ ? (
            <ScanTextButton disabled={importingHistory || listening} onText={insertText} />
          ) : null}
          {'toggle' in voice ? (
            <VoiceButton
              status={voice.status}
              disabled={!voice.available}
              seconds={voice.seconds}
              onClick={() => {
                if (
                  voice.status !== 'idle' ||
                  (!useChatStore.getState().importingHistory && ensureApiKey())
                ) {
                  void voice.toggle()
                }
              }}
            />
          ) : null}
          <IconButton
            size="m"
            tone="primary"
            icon={<IconPaperclipOutline16 />}
            tooltip={t('uploadFile')}
            disabled={importingHistory || listening}
            onClick={() => ensureApiKey() && fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : __HARMONY_APP__ && !hasInput ? (
            voice.available ? (
              <IconButton
                className={styles.primarySlot}
                size="m"
                tone="primary"
                icon={holdVoice ? <IconKeyboardOutline16 /> : <IconMicOutline16 />}
                tooltip={t(holdVoice ? 'holdVoiceKeyboard' : 'holdVoiceToggle')}
                disabled={importingHistory}
                onClick={(event) => {
                  if (holdVoice) {
                    voice.cancel()
                    setVoiceMode(false)
                    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
                  } else {
                    textareaRef.current?.blur()
                    setVoiceMode(true)
                    if (event.detail === 0) {
                      const composer = event.currentTarget.closest(`.${styles.wrapper}`)
                      requestAnimationFrame(() =>
                        composer
                          ?.querySelector<HTMLElement>(`.${styles.holdToSpeak}`)
                          ?.focus({ preventScroll: true })
                      )
                    }
                  }
                }}
              />
            ) : null
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
  )

  return (
    <>
      {!streaming && voice.status === 'idle' && (estimate.near || showRejected) ? (
        <ContextNotice
          estimate={estimate}
          rejected={showRejected}
          canCarry={
            sessionId !== null &&
            history.hasHistory &&
            (estimate.over || showRejected) &&
            (hasDraft(draft) || history.rejected !== null) &&
            !importingHistory
          }
          attachmentCount={attachmentCount}
          usage={history.lastUsage}
          carrying={carrying}
          onCarry={() => void carryDraft()}
        />
      ) : null}
      {composer}
    </>
  )
}
