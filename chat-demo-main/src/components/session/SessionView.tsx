import clsx from 'clsx'
import { useId, useLayoutEffect, useRef, type RefObject } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const title = session.ephemeral ? t('incognitoTitle') : session.title || t('untitledChat')
  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
        </div>
      )}
      {session.ephemeral ? (
        <div className={styles.incognitoBanner} role="note">
          {t('incognitoBanner')}
        </div>
      ) : null}
      <MessageList
        key={session.id}
        session={session}
        streaming={streaming}
        footer={(state) => <SessionComposer {...state} sessionId={session.id} compact={isMobile} />}
      />
    </div>
  )
}

const SessionComposer = ({
  sessionId,
  compact,
  editing,
  hidden,
  composerRef,
  showComposer,
}: {
  sessionId: string
  compact: boolean
  editing: boolean
  hidden: boolean
  composerRef: RefObject<HTMLDivElement>
  showComposer: () => void
}) => {
  const t = useTranslate()
  const composerId = useId()
  const input = useRef<HTMLDivElement>(null)
  const reveal = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (input.current && reveal.current) {
      input.current.inert = hidden
      reveal.current.inert = !hidden
    }
  }, [hidden])

  return (
    <div
      ref={composerRef}
      className={clsx(styles.inputContainer, compact && styles.compactInput)}
      hidden={editing}
      data-composer-collapsed={hidden ? '' : undefined}
      data-content-enter
    >
      <div className={styles.composerTrack} ref={input} aria-hidden={hidden || undefined}>
        <div className={styles.trackClip}>
          <div id={composerId} className={styles.composerBody}>
            <ChatInput sessionId={sessionId} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        </div>
      </div>
      <div className={styles.revealTrack} ref={reveal} aria-hidden={!hidden || undefined}>
        <div className={styles.trackClip}>
          <div className={styles.revealComposer}>
            <Button
              variant="outlined"
              size="s"
              aria-controls={composerId}
              onClick={(event) => {
                showComposer()
                if (event.detail === 0) {
                  requestAnimationFrame(() =>
                    input.current?.querySelector('textarea')?.focus({ preventScroll: true })
                  )
                }
              }}
            >
              {t('showChatComposer')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
