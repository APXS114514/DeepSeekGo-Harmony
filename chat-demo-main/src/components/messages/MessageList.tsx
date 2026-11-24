import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useFoldHover, useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { getDraft, setDraftText } from '../../services/chat/drafts.js'
import { useHistoryLocation } from '../../services/chat/historySearch.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { AssistantMessage } from './AssistantMessage.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
const HIDE_COMPOSER_THRESHOLD = 48
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: (state: {
    editing: boolean
    hidden: boolean
    composerRef: RefObject<HTMLDivElement>
    showComposer: () => void
  }) => ReactNode
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const hover = useFoldHover()
  const separateScroll = isMobile || hover
  const hideComposerOnScroll = useSettings((state) => state.hideComposerOnScroll) && !hover
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [composerHidden, setComposerHidden] = useState(false)
  const lastSuggestion = useRef<{ original: string; inserted: string } | null>(null)
  const activeEditor = messages.some((message) => message.id === editingMessageId)
    ? editingMessageId
    : null
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && !editorRef.current && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  // 键盘改变滚动区高度时，优先保留编辑框及其操作按钮。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const editor = editorRef.current
    const keepVisible = () => {
      if (!editor) {
        scrollToBottom()
        return
      }
      const viewport = scroll.getBoundingClientRect()
      const bounds = editor.getBoundingClientRect()
      const top = bounds.top - viewport.top - 8
      const bottom = bounds.bottom - viewport.bottom + 8
      if (bottom > 0 || top < 0) {
        scroll.scrollTop += Math.min(top, Math.max(0, bottom))
        scrollTopRef.current = scroll.scrollTop
      }
    }
    if (editor) {
      stickyRef.current = false
      keepVisible()
    }
    const observer = new ResizeObserver(keepVisible)
    observer.observe(content)
    observer.observe(scroll)
    if (composerRef.current) {
      observer.observe(composerRef.current)
    }
    if (editor) {
      observer.observe(editor)
    }
    return () => observer.disconnect()
  }, [activeEditor, separateScroll, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
        scrollTopRef.current = scroll.scrollTop
      }
      restoreScrollRef.current = null
      return
    }
    setComposerHidden(false)
    stickyRef.current = true
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  const historyTarget = useHistoryLocation((state) => state.target)
  useLayoutEffect(() => {
    if (historyTarget?.sessionId !== session.id) {
      return
    }
    useHistoryLocation.setState({ target: null })
    const scroll = scrollRef.current
    const message = contentRef.current?.querySelector<HTMLElement>(
      `[data-history-message="${CSS.escape(historyTarget.messageId)}"]`
    )
    if (scroll && message) {
      stickyRef.current = false
      scroll.scrollTop +=
        message.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8
      scrollTopRef.current = scroll.scrollTop
      message.focus({ preventScroll: true })
    }
  }, [historyTarget, session.id])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  useLayoutEffect(() => {
    if (!hideComposerOnScroll) {
      setComposerHidden(false)
    }
  }, [hideComposerOnScroll])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      setEditingMessageId(null)
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
      scrollTopRef.current = el.scrollTop
    }
    let upwardTravel = 0
    const isNearBottom = (top = Math.max(0, el.scrollTop)) =>
      el.scrollHeight - top - el.clientHeight < STICKY_THRESHOLD
    const isComposerCollapsed = () => composerRef.current?.hasAttribute('data-composer-collapsed')
    const onScroll = () => {
      const top = Math.max(0, el.scrollTop)
      const delta = top - scrollTopRef.current
      const nearBottom = isNearBottom(top)
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom && (!hideComposerOnScroll || delta > 0)) {
        stickyRef.current = true
      } else if (delta < 0) {
        stickyRef.current = false
      }
      scrollTopRef.current = top
      if (!hideComposerOnScroll || delta === 0) {
        return
      }
      if (delta > 0) {
        upwardTravel = 0
        if (nearBottom) {
          setComposerHidden(false)
        }
        return
      }
      const composer = composerRef.current
      const keyboardOpen =
        document.body.hasAttribute('data-soft-keyboard') ||
        (isMobile &&
          composer?.contains(document.activeElement) &&
          document.activeElement?.matches('textarea, input'))
      if (
        isComposerCollapsed() ||
        editorRef.current ||
        keyboardOpen ||
        composer?.querySelector('[data-voice-active]')
      ) {
        upwardTravel = 0
        return
      }
      upwardTravel -= delta
      if (!nearBottom && upwardTravel >= HIDE_COMPOSER_THRESHOLD) {
        upwardTravel = 0
        setComposerHidden(true)
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    if (!hideComposerOnScroll) {
      return () => el.removeEventListener('scroll', onScroll)
    }

    // 收起后视口变高，位置可能已被限在底部。此时向下的手势没有 scroll 事件。
    const revealAtBottom = () => {
      if (isComposerCollapsed() && isNearBottom()) {
        stickyRef.current = true
        setComposerHidden(false)
      }
    }
    let touchY: number | undefined
    let towardBottom = 0
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : undefined
      towardBottom = 0
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches.length === 1 ? event.touches[0].clientY : undefined
      towardBottom =
        y !== undefined && touchY !== undefined ? Math.max(0, towardBottom + touchY - y) : 0
      if (towardBottom >= 8) {
        revealAtBottom()
      }
      touchY = y
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0 && !event.ctrlKey) {
        revealAtBottom()
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('wheel', onWheel)
    }
  }, [hideComposerOnScroll, isMobile, separateScroll, scrollToBottom])

  const lastIndex = messages.length - 1
  const lastTurnUserIndex =
    messages[lastIndex]?.role === 'assistant'
      ? messages[lastIndex - 1]?.role === 'user'
        ? lastIndex - 1
        : -1
      : messages[lastIndex]?.role === 'user'
        ? lastIndex
        : -1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  const focusComposer = useCallback(() => {
    setComposerHidden(false)
    requestAnimationFrame(() => {
      const input = composerRef.current?.querySelector('textarea')
      input?.focus({ preventScroll: true })
      input?.setSelectionRange(input.value.length, input.value.length)
    })
  }, [])
  const selectSuggestion = useCallback(
    (question: string) => {
      const text = getDraft(session.id).text
      const original =
        lastSuggestion.current?.inserted === text ? lastSuggestion.current.original : text
      const inserted = original.trim() ? `${original}\n\n${question}` : question
      lastSuggestion.current = { original, inserted }
      setDraftText(session.id, inserted)
      setComposerHidden(false)
      requestAnimationFrame(() => {
        const input = composerRef.current?.querySelector('textarea')
        input?.focus({ preventScroll: true })
        input?.setSelectionRange(input.value.length, input.value.length)
      })
    },
    [session.id]
  )
  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <div
        ref={separateScroll ? undefined : scrollRef}
        className={clsx(styles.container, separateScroll && styles.compact, hover && styles.hover)}
      >
        <div ref={separateScroll ? scrollRef : undefined} className={styles.scroll}>
          <div ref={contentRef} className={styles.column} data-content-enter>
            {session.ephemeral ? (
              <p className={styles.incognitoNote} role="note">
                {t('incognitoBanner')}
              </p>
            ) : null}
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  retryUploadId={uploadRetryId}
                  isFirst={index === 0}
                  isLast={index === lastIndex || index === lastIndex - 1}
                  canRecall={index === lastTurnUserIndex}
                  onRecalled={focusComposer}
                  busy={streaming}
                  editing={message.id === activeEditor}
                  editorRef={message.id === activeEditor ? editorRef : undefined}
                  onEdit={setEditingMessageId}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  isLast={index === lastIndex}
                  streaming={streaming && index === lastIndex}
                  busy={streaming}
                  ephemeral={session.ephemeral === true}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                  onSelectSuggestion={activeEditor === null ? selectSuggestion : undefined}
                />
              )
            )}
          </div>
        </div>
        {footer({
          editing: activeEditor !== null,
          hidden: hideComposerOnScroll && composerHidden,
          composerRef,
          showComposer: () => setComposerHidden(false),
        })}
      </div>
    </ScrollToBottomContext.Provider>
  )
}
