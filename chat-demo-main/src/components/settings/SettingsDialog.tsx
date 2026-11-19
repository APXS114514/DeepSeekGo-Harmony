import clsx from 'clsx'
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import {
  IconChevronRightOutline14,
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconPersonalOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useSurfacePresence } from '../../app/useSurfacePresence.js'
import { useChatStore } from '../../services/chat/store.js'
import type { HistoryImportMode } from '../../services/chat/types.js'
import {
  DeviceStatus,
  requestNotificationPermission,
  saveDeviceFile,
  useDeviceFeatures,
} from '../../services/harmony.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  OUTPUT_LIMITS,
  setSuggestedQuestions,
  setGenerationOptions,
  setImmersiveLight,
  setHideComposerOnScroll,
  setReplyNotify,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  setVoiceInputMode,
  takeReplyNotifyPrompt,
  useSettings,
  type Locale,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select, type SelectOption } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiBalance } from './ApiBalance.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { AccentSetting } from './AccentSetting.js'
import { PersonalizationSettings } from './PersonalizationSettings.js'
import { SettingsSwitch } from './SettingsSwitch.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（外观、对话、语音、语言、位置）、「个性化」（指令与记忆）
 * 与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  const { ref, present, closing } = useSurfacePresence<HTMLDivElement>(open)
  return present ? <SettingsContent overlayRef={ref} closing={closing} /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'personal', label: 'personalSectionLabel', icon: <IconPersonalOutline16 /> },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const generalPages = [
  { value: 'appearance', label: 'settingsAppearancePage' },
  { value: 'chat', label: 'settingsChatPage' },
  { value: 'voice', label: 'settingsVoicePage' },
] as const

type GeneralPage = (typeof generalPages)[number]

const SettingsContent = ({
  overlayRef,
  closing,
}: {
  overlayRef: Ref<HTMLDivElement>
  closing: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const tabsId = useId()
  const requestedSection = useSettingsDialog((state) => state.section)
  const [section, setSection] = useState(requestedSection)
  const [generalPage, setGeneralPage] = useState<GeneralPage | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const previousPage = useRef<{ value: GeneralPage['value']; scrollTop: number } | null>(null)

  const selectSection = (value: SettingsSection) => {
    previousPage.current = null
    setGeneralPage(null)
    setSection(value)
  }

  useLayoutEffect(() => {
    if (!closing) {
      selectSection(requestedSection)
    }
  }, [closing, requestedSection])

  useLayoutEffect(() => {
    if (generalPage) {
      backButton.current?.focus({ preventScroll: true })
    } else if (section === 'general' && previousPage.current && contentRef.current) {
      const { value, scrollTop } = previousPage.current
      contentRef.current
        .querySelector<HTMLButtonElement>(`[data-settings-page="${value}"]`)
        ?.focus({ preventScroll: true })
      contentRef.current.scrollTop = scrollTop
      previousPage.current = null
    }
  }, [section, generalPage])

  const openGeneralPage = (page: GeneralPage) => {
    previousPage.current = { value: page.value, scrollTop: contentRef.current?.scrollTop ?? 0 }
    setGeneralPage(page)
  }
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const importingHistory = useChatStore((state) => state.importingHistory !== false)
  const historyBusy = historyImport.busy || historyDelete.busy || importingHistory
  const close = () => {
    if (!historyDelete.busy) {
      closeSettings()
    }
  }
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        overlayClassName={styles.settingsOverlay}
        mainClassName={styles.dialogMain}
        overlayRef={overlayRef}
        closing={closing}
        onClose={close}
        onBack={generalPage ? () => setGeneralPage(null) : close}
      >
        <div
          role="tablist"
          aria-label={t('settings')}
          aria-orientation={isMobile ? 'horizontal' : 'vertical'}
          className={styles.navigation}
          onKeyDown={(event) => {
            const current = sections.findIndex((item) => item.value === section)
            const previousKey = isMobile ? 'ArrowLeft' : 'ArrowUp'
            const nextKey = isMobile ? 'ArrowRight' : 'ArrowDown'
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? sections.length - 1
                  : event.key === previousKey
                    ? (current + sections.length - 1) % sections.length
                    : event.key === nextKey
                      ? (current + 1) % sections.length
                      : -1
            if (next >= 0) {
              event.preventDefault()
              selectSection(sections[next].value)
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
            }
          }}
        >
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${tabsId}-${item.value}`}
              aria-controls={`${tabsId}-panel`}
              aria-selected={section === item.value}
              tabIndex={section === item.value ? 0 : -1}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => selectSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div
          key={generalPage?.value ?? section}
          ref={contentRef}
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${section}`}
          className={clsx(styles.content, generalPage && styles.subpageContent)}
        >
          {section === 'general' ? (
            generalPage ? (
              <>
                <header className={styles.subpageHeader}>
                  <button
                    ref={backButton}
                    type="button"
                    className={styles.subpageBack}
                    aria-label={t('settingsBackToGeneral')}
                    onClick={() => setGeneralPage(null)}
                  >
                    <IconChevronRightOutline14 />
                  </button>
                  <h2>{t(generalPage.label)}</h2>
                </header>
                <div className={styles.subpageScroll}>
                  <GeneralSettingsPage page={generalPage.value} />
                </div>
              </>
            ) : (
              <>
                {generalPages.map((page) => (
                  <button
                    key={page.value}
                    type="button"
                    data-settings-page={page.value}
                    className={clsx(styles.cell, styles.pageLink)}
                    onClick={() => openGeneralPage(page)}
                  >
                    {t(page.label)}
                    <IconChevronRightOutline14 />
                  </button>
                ))}
                <LocaleSetting />
                <LocationSetting />
              </>
            )
          ) : section === 'personal' ? (
            <PersonalizationSettings />
          ) : (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <ApiBalance apiKey={apiKeyEditor.apiKey} />
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {!closing && historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {!closing && historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

const GeneralSettingsPage = ({ page }: { page: GeneralPage['value'] }) => {
  switch (page) {
    case 'appearance':
      return (
        <>
          <ThemeSetting />
          {__HARMONY_APP__ ? (
            <>
              <AccentSetting />
              <ImmersiveLightSetting />
            </>
          ) : null}
        </>
      )
    case 'chat':
      return (
        <>
          <GenerationSettings />
          <SuggestedQuestionsSetting />
          <HideComposerSetting />
          {__HARMONY_APP__ ? <ReplyNotifySetting /> : null}
        </>
      )
    case 'voice':
      return (
        <>
          {__HARMONY_APP__ ? <VoiceInputSetting /> : null}
          <TtsVoiceSetting />
        </>
      )
  }
}

const SuggestedQuestionsSetting = () => {
  const t = useTranslate()
  const enabled = useSettings((state) => state.suggestedQuestions)
  return (
    <SettingsSwitch
      className={styles.cell}
      label={t('suggestedQuestions')}
      description={t('settingsSuggestedQuestionsDescription')}
      checked={enabled}
      onChange={setSuggestedQuestions}
    />
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const sortedRegions = new Map<Locale, SelectOption<string>[]>()

const getSortedRegions = (locale: Locale) => {
  const cached = sortedRegions.get(locale)
  if (cached) {
    return cached
  }
  const { compare } = new Intl.Collator(locale)
  const options = regionCodes
    .map((value) => ({ value, label: getRegionName(value, locale) }))
    .sort((a, b) => compare(a.label, b.label))
  sortedRegions.set(locale, options)
  return options
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      description={t('settingsLocationDescription')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {/* 先选国家或地区，海外用户只需这一级；选中国时再细化到省市。 */}
          <Select
            ariaLabel={t('settingsLocationRegion')}
            className={styles.regionSelect}
            value={location?.region ?? ''}
            placeholder={t('settingsLocationRegion')}
            options={[{ value: '', label: t('settingsLocationNone') }, ...getSortedRegions(locale)]}
            onChange={(value) => setLocation(value ? { region: value } : null)}
          />
          {location?.region === 'CN' ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : null}
        </div>
      }
    />
  )
}

const GenerationSettings = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const { model, readLinks, effort, maxTokens } = useSettings((state) => state.generation)
  const numbers = new Intl.NumberFormat(locale)
  return (
    <>
      <SettingCell
        label={t('settingsChatModel')}
        description={t('settingsChatModelDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('settingsChatModel')}
            value={model}
            options={[
              { value: 'deepseek-flash', label: 'Flash' },
              { value: 'deepseek-v4-pro', label: 'V4 Pro' },
            ]}
            onChange={(model) => setGenerationOptions({ model })}
          />
        }
      />
      <SettingsSwitch
        className={styles.cell}
        label={t('settingsReadLinks')}
        description={t('settingsReadLinksDescription')}
        checked={readLinks}
        onChange={(readLinks) => setGenerationOptions({ readLinks })}
      />
      <SettingCell
        label={t('settingsThinkingEffort')}
        description={t('settingsThinkingEffortDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('settingsThinkingEffort')}
            value={effort ?? ''}
            options={[
              { value: '', label: t('settingsApiDefault') },
              { value: 'low', label: t('settingsEffortLow') },
              { value: 'high', label: t('settingsEffortHigh') },
              { value: 'max', label: t('settingsEffortMax') },
            ]}
            onChange={(effort) => setGenerationOptions({ effort: effort || null })}
          />
        }
      />
      <SettingCell
        label={t('settingsMaxOutput')}
        description={t('settingsMaxOutputDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('settingsMaxOutput')}
            value={maxTokens === null ? '' : String(maxTokens)}
            options={[
              { value: '', label: t('settingsApiDefault') },
              ...OUTPUT_LIMITS.map((value) => ({
                value: String(value),
                label: numbers.format(value),
              })),
            ]}
            onChange={(value) =>
              setGenerationOptions({ maxTokens: value === '' ? null : Number(value) })
            }
          />
        }
      />
    </>
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

const VoiceInputSetting = () => {
  const t = useTranslate()
  const mode = useSettings((state) => state.voiceInputMode)
  const local = useDeviceFeatures((state) => state.voice)
  return (
    <SettingCell
      label={t('settingsVoiceInput')}
      status={{
        key:
          mode === 'api'
            ? 'settingsVoiceApiDescription'
            : local
              ? 'settingsVoiceLocalDescription'
              : 'settingsVoiceLocalUnavailable',
      }}
      action={
        <Select
          ariaLabel={t('settingsVoiceInput')}
          value={mode}
          options={[
            { value: 'local', label: t('settingsVoiceLocal') },
            { value: 'api', label: t('settingsVoiceApi') },
          ]}
          onChange={setVoiceInputMode}
        />
      }
    />
  )
}

const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  const localReadAloud = useDeviceFeatures((state) => state.readAloud)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={ttsVoice === 'local' && !localReadAloud ? { key: 'ttsLocalUnavailable' } : null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            ...(__HARMONY_APP__ && (localReadAloud || ttsVoice === 'local')
              ? [{ value: 'local' as const, label: t('settingsTtsVoiceLocal') }]
              : []),
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 导入前选择合并或覆盖。 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <div className={styles.importActions}>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="dangerOutlined"
            size="m"
            onClick={() => void historyImport.confirm('replace')}
          >
            {t('historyImportReplace')}
          </Button>
          <Button size="m" onClick={() => void historyImport.confirm('merge')}>
            {t('historyImportMerge')}
          </Button>
        </div>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

const ImmersiveLightSetting = () => {
  const t = useTranslate()
  const immersiveLight = useSettings((state) => state.immersiveLight)
  return (
    <SettingsSwitch
      className={styles.cell}
      label={t('immersiveLightTitle')}
      description={t('immersiveLightDescription')}
      checked={immersiveLight}
      onChange={setImmersiveLight}
    />
  )
}

const HideComposerSetting = () => {
  const t = useTranslate()
  const hiddenOnScroll = useSettings((state) => state.hideComposerOnScroll)
  return (
    <SettingsSwitch
      className={styles.cell}
      label={t('hideChatComposerTitle')}
      description={t('hideChatComposerDescription')}
      checked={hiddenOnScroll}
      onChange={setHideComposerOnScroll}
    />
  )
}

/** 鸿蒙版：应用在后台时回答完成后发通知；打开开关时请求系统通知授权。 */
const ReplyNotifySetting = () => {
  const t = useTranslate()
  const replyNotify = useSettings((state) => state.replyNotify)
  return (
    <SettingsSwitch
      className={styles.cell}
      label={t('replyNotifyTitle')}
      description={t('replyNotifyDescription')}
      checked={replyNotify}
      onChange={(enabled) => {
        setReplyNotify(enabled)
        if (enabled) {
          void requestNotificationPermission(!takeReplyNotifyPrompt()).then((status) => {
            if (status !== DeviceStatus.ok) {
              showToast({ key: 'replyNotifyDenied' })
            }
          })
        }
      }}
    />
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 确认导入方式后校验文件，并报告写入结果。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)

  const confirm = async (mode: HistoryImportMode) => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    setStatus(null)
    try {
      const count = await importHistory(file, mode)
      if (mode === 'merge' && count === 0) {
        setStatus({ key: 'historyImportNoNew' })
      } else {
        setStatus({
          key: count === 1 ? 'historyImportedOne' : 'historyImported',
          params: { count },
        })
      }
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, status, select: setFile, cancel: () => setFile(null), confirm }
}

const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={historyImport.status}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select(file)
              }
            }}
          />
        </>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载；鸿蒙版由系统文件管理器选择保存位置 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      if (__HARMONY_APP__) {
        const result = await saveDeviceFile(name, await blob.arrayBuffer())
        if (result === DeviceStatus.ok) {
          showToast({ key: 'harmonySaveDone' })
        } else if (result !== DeviceStatus.cancelled) {
          setStatus({ key: 'harmonySaveFailed', error: true })
        }
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t(__HARMONY_APP__ ? 'harmonySaveFile' : 'exportAllDownload')}
        </Button>
      }
    />
  )
}
