import {
  IconMenuLines22,
  IconMenuOutline20,
  IconNewChatOutline20,
  IconSquarePencil22,
} from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：左侧菜单打开侧边栏；会话页再显示标题与开启新对话 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={__HARMONY_APP__ ? <IconMenuLines22 /> : <IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      {title === undefined ? (
        __HARMONY_APP__ ? (
          <div className={styles.title}>{t('harmonyAppName')}</div>
        ) : null
      ) : (
        <>
          <div className={styles.title}>{title}</div>
          <IconButton
            size="xl"
            tone="primary"
            icon={__HARMONY_APP__ ? <IconSquarePencil22 /> : <IconNewChatOutline20 />}
            aria-label={t('newChat')}
            onClick={newChat}
          />
        </>
      )}
    </div>
  )
}
