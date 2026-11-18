import clsx from 'clsx'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
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
        footer={(editing) => (
          <div
            className={clsx(styles.inputContainer, isMobile && styles.compactInput)}
            hidden={editing}
            data-content-enter
          >
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        )}
      />
    </div>
  )
}
