import clsx from 'clsx'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconBranchOutline16,
  IconChevronRightOutline14,
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed, useSettings } from '../../services/settings.js'
import {
  confirmDeviceAction,
  triggerDeviceHaptic,
  useDeviceFeatures,
} from '../../services/harmony.js'
import {
  groupSessions,
  toggleBranchGroup,
  useBranchGroupState,
} from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { openHistorySearch } from '../historySearch/HistorySearch.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import { SHORTCUTS, useShortcutHint } from '../../app/shortcuts.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const hint = useShortcutHint()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const collapsedGroups = useBranchGroupState((state) => state.collapsed)
  const [now, setNow] = useState(Date.now)
  const groups = useMemo(() => groupSessions(sessions, now, t), [sessions, now, t])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const requestDelete = async (session: SessionSummary) => {
    if (deletePending) {
      return
    }
    if (
      __HARMONY_APP__ &&
      useDeviceFeatures.getState().immersiveUi &&
      useSettings.getState().immersiveLight
    ) {
      triggerDeviceHaptic('menu')
      const result = await confirmDeviceAction({
        title: t('deleteSessionModalContentTitle'),
        message: t('deleteSessionWithFilesDescription'),
        confirm: t('delete'),
        cancel: t('cancel'),
        danger: true,
      })
      if (result === 'confirmed') {
        setDeletePending(true)
        try {
          if (!(await removeSession(session.id))) {
            showToast({ key: 'sessionDeleteFailed', type: 'error' })
          }
        } finally {
          setDeletePending(false)
        }
        return
      }
      if (result === 'cancelled') {
        return
      }
    }
    setDeleting(session)
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t(__HARMONY_APP__ ? 'harmonyAppName' : 'appName')}</div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={hint(t('collapseSiderbarButton'), SHORTCUTS.toggleSider)}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <button type="button" className={styles.historySearch} onClick={openHistorySearch}>
        <IconSearchOutline16 />
        {t('historySearch')}
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.entries.map((entry) => {
                if (entry.kind === 'single') {
                  return (
                    <SessionItem
                      key={entry.session.id}
                      session={entry.session}
                      active={entry.session.id === activeId}
                      onDelete={() => void requestDelete(entry.session)}
                    />
                  )
                }
                const collapsed = collapsedGroups[entry.groupId] === true
                const hasActive = entry.sessions.some((item) => item.id === activeId)
                return (
                  <div
                    key={entry.groupId}
                    className={styles.branchGroup}
                    data-branch-group={entry.groupId}
                    data-collapsed={collapsed ? '' : undefined}
                  >
                    <button
                      type="button"
                      className={clsx(
                        styles.branchGroupHeader,
                        collapsed && hasActive && styles.branchGroupActive
                      )}
                      aria-expanded={!collapsed}
                      aria-label={t(collapsed ? 'branchGroupExpand' : 'branchGroupCollapse', {
                        title: entry.title,
                      })}
                      onClick={() => toggleBranchGroup(entry.groupId)}
                    >
                      <span className={styles.branchGroupChevron} aria-hidden="true">
                        <IconChevronRightOutline14 />
                      </span>
                      <span className={styles.branchGroupIcon} aria-hidden="true">
                        <IconBranchOutline16 />
                      </span>
                      <span className={styles.branchGroupTitle}>{entry.title}</span>
                      <span
                        className={styles.branchGroupCount}
                        aria-label={t('branchGroupCount', { count: entry.sessions.length })}
                      >
                        {entry.sessions.length}
                      </span>
                    </button>
                    {!collapsed ? (
                      <div className={styles.branchGroupList}>
                        {entry.sessions.map((session) => (
                          <SessionItem
                            key={session.id}
                            session={session}
                            active={session.id === activeId}
                            onDelete={() => void requestDelete(session)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 收起动画通常 230ms，减少动态效果时没有 transitionend，用定时器兜底。 */
const IDLE_FALLBACK_MS = 400

/**
 * 窄屏抽屉关闭后停止渲染其中的会话列表。键盘弹出、切换设置等会改动整页样式，
 * 隐藏的历史条目不再参与每次样式重算；打开时在同一帧恢复。
 * 常驻侧栏不使用：展开内屏收起侧栏后，ArkWeb 再次露出已聚焦的输入框时会平移视口，整页回跳。
 */
const useIdleWhenHidden = (ref: RefObject<HTMLElement | null>, hidden: boolean) => {
  useLayoutEffect(() => {
    const element = ref.current
    if (!__HARMONY_APP__ || !element) {
      return
    }
    if (!hidden) {
      element.removeAttribute('data-idle')
      return
    }
    const settle = () => element.setAttribute('data-idle', '')
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element) {
        settle()
      }
    }
    element.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(settle, IDLE_FALLBACK_MS)
    return () => {
      clearTimeout(timer)
      element.removeEventListener('transitionend', onEnd)
    }
  }, [ref, hidden])
}

export const DockedSider = ({ collapsed }: { collapsed: boolean }) => {
  const t = useTranslate()
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.inert = collapsed
    }
  }, [collapsed])

  return (
    <nav
      ref={ref}
      className={styles.docked}
      data-collapsed={collapsed ? '' : undefined}
      aria-label={t('historyNavigation')}
    >
      <Sider />
    </nav>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const t = useTranslate()
  const open = useMobileSider((state) => state.open)
  const drawerRef = useRef<HTMLDivElement>(null)
  useIdleWhenHidden(drawerRef, !open)
  useLayoutEffect(() => {
    const drawer = drawerRef.current
    if (!__HARMONY_APP__ || !drawer) {
      return
    }
    drawer.inert = !open
    if (open) {
      drawer.focus({ preventScroll: true })
    }
  }, [open])

  if (!__HARMONY_APP__ && !open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} aria-hidden="true" onClick={closeMobileSider} />
      <div
        ref={drawerRef}
        className={styles.drawer}
        role="navigation"
        aria-label={t('historyNavigation')}
        tabIndex={__HARMONY_APP__ ? -1 : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.currentTarget.contains(event.target as Node)) {
            closeMobileSider()
          }
        }}
      >
        <Sider mobile />
      </div>
    </>
  )
}
