import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslate } from '../i18n/index.js'
import { loadDeviceApiKey, useSettings } from '../services/settings.js'
import { bindSharedContent, bindWindowActions, sendWindowUi } from '../services/harmony.js'
import { handleBack, useBackDepth, useBackLayer } from '../services/backStack.js'
import { receiveSharedContent } from './receiveShare.js'
import { useKeyboardShortcuts } from './shortcuts.js'
import { useReplyNotifications } from './replyNotifications.js'
import { useTheme } from './theme.js'
import { useMobileViewport, usePreventPageScroll, useResponsiveLayout } from './viewport.js'
import { useSurfacePresence } from './useSurfacePresence.js'
import {
  bindChatPersistence,
  initChat,
  newChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel, useSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { ShareDialog } from '../components/share/ShareDialog.js'
import { HistorySearch } from '../components/historySearch/HistorySearch.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import {
  closeMobileSider,
  openMobileSider,
  useMobileSider,
} from '../components/sider/mobileSiderState.js'
import { useModalOpen } from '../components/base/Modal.js'
import { DockedSider, MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const layout = useResponsiveLayout()
  const isMobile = layout === 'compact'
  const locale = useSettings((state) => state.locale)
  const theme = useTheme()
  const themePreference = useSettings((state) => state.themePreference)
  const immersiveLight = useSettings((state) => state.immersiveLight)
  const modalOpen = useModalOpen()
  const mobileSiderOpen = useMobileSider((state) => state.open) && isMobile
  useBackLayer(mobileSiderOpen, closeMobileSider)
  useKeyboardShortcuts(isMobile)
  useReplyNotifications()
  const mainRef = useRef<HTMLElement>(null)
  const [drawerCoversHeader, setDrawerCoversHeader] = useState(false)
  const searchOpen = useSearchPanel((state) => state.entry !== null)
  const searchPanel = useSurfacePresence<HTMLElement>(searchOpen)
  // 系统返回手势依次关闭：最后打开的菜单或弹窗、搜索面板、侧栏抽屉
  useBackLayer(searchOpen, closeSearchPanel)
  const backDepth = useBackDepth((state) => state.depth)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory !== false)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(__HARMONY_APP__ || isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)
  const nativeHeaderTitle = session
    ? session.ephemeral
      ? t('incognitoTitle')
      : session.title || t('untitledChat')
    : t('harmonyAppName')
  const menuLabel = t('expandSiderbarButton')
  const newChatLabel = t('newChat')
  const showNewChat = session !== undefined
  const covered =
    modalOpen || mobileSiderOpen || (isMobile && drawerCoversHeader) || searchPanel.present

  usePreventPageScroll(isMobile)

  useLayoutEffect(() => {
    if (__HARMONY_APP__) {
      document.body.dataset.chatLayout = layout
    }
  }, [layout])

  useLayoutEffect(() => {
    if (__HARMONY_APP__) {
      document.body.toggleAttribute('data-immersive-light', immersiveLight)
    }
  }, [immersiveLight])

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!__HARMONY_APP__ || !main) {
      return
    }
    main.inert = mobileSiderOpen
    if (!isMobile || mobileSiderOpen) {
      setDrawerCoversHeader(mobileSiderOpen)
      return
    }

    // Wait for the web header to slide back before showing the native overlay again.
    const transitions = main.getAnimations?.() ?? []
    if (transitions.length === 0) {
      setDrawerCoversHeader(false)
      return
    }
    let current = true
    void Promise.allSettled(transitions.map((animation) => animation.finished)).then(() => {
      if (current) {
        setDrawerCoversHeader(false)
      }
    })
    return () => {
      current = false
    }
  }, [isMobile, mobileSiderOpen])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (__HARMONY_APP__) {
      return bindWindowActions((action, value) => {
        if (action === 'sidebar') {
          openMobileSider()
        } else if (action === 'back') {
          handleBack()
        } else if (action === 'open-session' && value) {
          // 从回答完成通知回来：等会话列表加载后再打开。
          void initChat().then(() => {
            if (useChatStore.getState().activeId !== value) {
              selectSession(value)
            }
            closeMobileSider()
          })
        } else {
          newChat()
        }
      })
    }
    return undefined
  }, [])

  useLayoutEffect(() => {
    if (__HARMONY_APP__) {
      let generating = Object.keys(useChatStore.getState().streaming).length > 0
      const send = () =>
        sendWindowUi({
          mobile: isMobile && !saveError,
          covered,
          dark: theme === 'dark',
          themePreference,
          immersiveLight,
          title: nativeHeaderTitle,
          menuLabel,
          newChatLabel,
          showNewChat,
          canGoBack: backDepth > 0,
          generating,
        })
      send()
      // 生成状态直接经过消息端口，退到后台时不依赖 React 绘制或 effect 调度。
      return useChatStore.subscribe((state, previous) => {
        if (state.streaming !== previous.streaming) {
          const next = Object.keys(state.streaming).length > 0
          if (next !== generating) {
            generating = next
            send()
          }
        }
      })
    }
    return undefined
  }, [
    isMobile,
    saveError,
    covered,
    theme,
    themePreference,
    immersiveLight,
    nativeHeaderTitle,
    menuLabel,
    newChatLabel,
    showNewChat,
    backDepth,
  ])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void initChat()
    // 首次打开先在设置里输入 API Key
    if (__HARMONY_APP__) {
      let active = true
      let unbindShare: (() => void) | undefined
      // 先读出系统里保存的 Key，再处理冷启动时收到的分享，避免误开设置页。
      void loadDeviceApiKey().then(() => {
        if (active) {
          ensureApiKey()
          unbindShare = bindSharedContent(receiveSharedContent)
        }
      })
      return () => {
        active = false
        unbindShare?.()
      }
    }
    ensureApiKey()
    return undefined
  }, [])

  return (
    <>
      <div
        ref={frameRef}
        className={styles.frame}
        data-drawer-open={__HARMONY_APP__ && mobileSiderOpen ? '' : undefined}
        data-drawer-covered={__HARMONY_APP__ && isMobile && drawerCoversHeader ? '' : undefined}
      >
        {isMobile ? (
          <MobileSider />
        ) : __HARMONY_APP__ ? (
          <DockedSider collapsed={siderCollapsed} />
        ) : siderCollapsed ? null : (
          <Sider />
        )}
        <main ref={mainRef} className={styles.main}>
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {!isMobile && (__HARMONY_APP__ || siderCollapsed) ? (
              <CollapsedSider visible={siderCollapsed} />
            ) : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        {searchPanel.present ? (
          <SearchPanel panelRef={searchPanel.ref} closing={searchPanel.closing} />
        ) : null}
      </div>
      <SettingsDialog />
      <HistorySearch />
      {__HARMONY_APP__ ? <ShareDialog /> : null}
      <Toast />
    </>
  )
}
