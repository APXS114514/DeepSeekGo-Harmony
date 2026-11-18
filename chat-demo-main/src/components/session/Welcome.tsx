import clsx from 'clsx'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { IconIncognitoOutline16 } from '../base/icons.js'
import { setIncognito, useChatStore } from '../../services/chat/store.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

const logo = __HARMONY_APP__ ? new URL('../../../../LOGO.png', import.meta.url).href : undefined

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const incognito = useChatStore((state) => state.incognito)
  return (
    <div className={clsx(styles.container, isMobile && styles.compact)}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting} data-content-enter>
          {logo ? <img className={styles.logo} src={logo} alt="" /> : null}
          <span>
            {t(
              incognito
                ? 'incognitoWelcome'
                : __HARMONY_APP__
                  ? 'harmonyWelcome'
                  : 'welcomeMessageChat250808'
            )}
          </span>
          {incognito ? <p className={styles.incognitoHint}>{t('incognitoDescription')}</p> : null}
          <button
            type="button"
            className={clsx(styles.incognitoToggle, incognito && styles.incognitoActive)}
            aria-pressed={incognito}
            onClick={() => setIncognito(!incognito)}
          >
            <IconIncognitoOutline16 />
            {t(incognito ? 'incognitoExit' : 'incognitoEnter')}
          </button>
        </div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
