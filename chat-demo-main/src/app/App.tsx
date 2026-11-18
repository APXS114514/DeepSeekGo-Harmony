import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslate } from '../i18n/index.js'
import { loadDeviceApiKey, useSettings } from '../services/settings.js'
import { bindWindowActions, sendWindowUi } from '../services/harmony.js'
import { useTheme } from './theme.js'
import { useMobileViewport, usePreventPageScroll, useResponsiveLayout } from './viewport.js'
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
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const layout = useResponsiveLayout()
  const isMobile = layout === 'compact'
  const locale = useSettings((state) => state.locale)
  const theme = useTheme()
  const immersiveLight = useSettings((state) => state.immersiveLight)
  const modalOpen = useModalOpen()
  const mobileSiderOpen = useMobileSider((state) => state.open) && isMobile
  const mainRef = useRef<HTMLElement>(null)
  const [drawerCoversHeader, setDrawerCoversHeader] = useState(false)
  const searchOpen = useSearchPanel((state) => state.entry !== null)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
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
  const nativeHeaderTitle = session ? session.title || t('untitledChat') : t('harmonyAppName')
  const menuLabel = t('expandSiderbarButton')
  const newChatLabel = t('newChat')
  const showNewChat = session !== undefined
  const covered = modalOpen || mobileSiderOpen || (isMobile && drawerCoversHeader) || searchOpen

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
      return bindWindowActions((action) => {
        if (action === 'sidebar') {
          openMobileSider()
        } else {
          newChat()
        }
      })
    }
    return undefined
  }, [])

  useEffect(() => {
    if (__HARMONY_APP__) {
      sendWindowUi({
        mobile: isMobile && !saveError,
        covered,
        dark: theme === 'dark',
        immersiveLight,
        title: nativeHeaderTitle,
        menuLabel,
        newChatLabel,
        showNewChat,
      })
    }
  }, [
    isMobile,
    saveError,
    covered,
    theme,
    immersiveLight,
    nativeHeaderTitle,
    menuLabel,
    newChatLabel,
    showNewChat,
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
      void loadDeviceApiKey().then(() => ensureApiKey())
    } else {
      ensureApiKey()
    }
  }, [])

  return (
    <>
      <div
        ref={frameRef}
        className={styles.frame}
        data-drawer-open={__HARMONY_APP__ && mobileSiderOpen ? '' : undefined}
      >
        {isMobile ? <MobileSider /> : siderCollapsed ? null : <Sider />}
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
            {siderCollapsed ? <CollapsedSider /> : null}
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
        <SearchPanel />
      </div>
      <SettingsDialog />
      <Toast />
    </>
  )
}
