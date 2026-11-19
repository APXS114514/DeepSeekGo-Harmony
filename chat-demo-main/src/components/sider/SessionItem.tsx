import clsx from 'clsx'
import { memo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconEditOutline16,
  IconEllipsisOutline16,
  IconShareOutline16,
  IconTrashOutline16,
} from '../base/icons.js'
import { renameSession, selectSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { useDeviceFeatures } from '../../services/harmony.js'
import { shareSession } from '../../services/chat/share.js'
import { openShare } from '../share/ShareDialog.js'
import { showToast } from '../base/toastState.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { closeMobileSider } from './mobileSiderState.js'
import { useBackLayer } from '../../services/backStack.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [preparingShare, setPreparingShare] = useState(false)
  const sharing = useDeviceFeatures((state) => state.share)
  const generating = useChatStore((state) => Object.hasOwn(state.streaming, session.id))
  useBackLayer(editing, () => setEditing(false))
  const menuRef = useRef<{ open: () => void }>(null)
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        aria-label={t('sessionItemMenuRenameOption')}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <div
      className={clsx(styles.item, active && styles.active)}
      onClick={() => {
        selectSession(session.id)
        closeMobileSider()
      }}
      onContextMenu={(event) => {
        // 鼠标右键打开与「…」相同的菜单；触屏长按仍交给系统的文字选择。
        if (
          __HARMONY_APP__ &&
          event.nativeEvent instanceof PointerEvent &&
          event.nativeEvent.pointerType === 'mouse'
        ) {
          event.preventDefault()
          menuRef.current?.open()
        }
      }}
    >
      <button type="button" className={styles.title} aria-current={active ? 'true' : undefined}>
        {displayTitle}
      </button>
      <div className={styles.action} onClick={(event) => event.stopPropagation()}>
        <Menu
          controlRef={menuRef}
          options={[
            {
              key: 'rename',
              label: t('sessionItemMenuRenameOption'),
              icon: <IconEditOutline16 />,
              onSelect: () => setEditing(true),
            },
            ...(__HARMONY_APP__ && sharing && !generating && !preparingShare
              ? [
                  {
                    key: 'share',
                    label: t('shareChat'),
                    icon: <IconShareOutline16 />,
                    onSelect: async () => {
                      setPreparingShare(true)
                      try {
                        const content = await shareSession(session.id, displayTitle, {
                          user: t('shareRoleUser'),
                          assistant: t('shareRoleAssistant'),
                        })
                        if (content) {
                          openShare(content)
                        } else {
                          showToast({ key: 'shareEmpty' })
                        }
                      } catch {
                        showToast({ key: 'shareFailed' })
                      } finally {
                        setPreparingShare(false)
                      }
                    },
                  },
                ]
              : []),
            {
              key: 'delete',
              label: t('delete'),
              icon: <IconTrashOutline16 />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          {({ open, toggle }) => (
            <IconButton
              icon={<IconEllipsisOutline16 />}
              aria-label={t('more')}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            />
          )}
        </Menu>
      </div>
    </div>
  )
})
