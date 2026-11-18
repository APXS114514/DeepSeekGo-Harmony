import { IconPanelLeftOutline16, NewChatIcon } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { SHORTCUTS, useShortcutHint } from '../../app/shortcuts.js'
import styles from './Sider.module.css'

/** 收起后左上角的按钮组 */
export const CollapsedSider = ({ visible }: { visible: boolean }) => {
  const t = useTranslate()
  const hint = useShortcutHint()
  return (
    <div className={styles.collapsed} data-hidden={visible ? undefined : ''}>
      <div className={styles.collapsedGroup}>
        <IconButton
          size="m"
          tone="primary"
          icon={<IconPanelLeftOutline16 />}
          tooltip={hint(t('expandSiderbarButton'), SHORTCUTS.toggleSider)}
          disabled={!visible}
          onClick={() => setSiderCollapsed(false)}
        />
        <IconButton
          size="m"
          tone="primary"
          icon={<NewChatIcon />}
          tooltip={hint(t('newChat'), SHORTCUTS.newChat)}
          disabled={!visible}
          onClick={newChat}
        />
      </div>
    </div>
  )
}
