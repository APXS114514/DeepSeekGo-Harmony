import clsx from 'clsx'
import { useId, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { consolidateMemories } from '../../services/memory.js'
import {
  addMemory,
  clearMemories,
  MAX_INSTRUCTION_LENGTH,
  MAX_MEMORIES,
  MAX_MEMORY_LENGTH,
  removeMemory,
  replaceMemories,
  setAutoMemory,
  setInstructions,
  setInstructionsEnabled,
  setMemoryEnabled,
  updateMemory,
  usePersonalization,
  type Memory,
} from '../../services/personalization.js'
import { formatDate } from '../../utils/format.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconEditOutline16, IconTrashOutline16 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { ensureApiKey } from './settingsDialogState.js'
import { useBackLayer } from '../../services/backStack.js'
import styles from './Personalization.module.css'
import settingsStyles from './Settings.module.css'

/** 设置 →「个性化」：适用于所有对话的指令，以及跨对话记忆的查看与管理。 */
export const PersonalizationSettings = () => (
  <>
    <InstructionsSetting />
    <MemorySetting />
  </>
)

const Switch = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) => {
  const descriptionId = useId()
  return (
    <label className={clsx(settingsStyles.immersiveLight, disabled && styles.disabled)}>
      <span>
        {label}
        <span id={descriptionId} className={settingsStyles.immersiveLightDescription}>
          {description}
        </span>
      </span>
      <input
        className={settingsStyles.immersiveLightSwitch}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

const InstructionField = ({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: TranslationKey
  placeholder: TranslationKey
  value: string
  onChange: (value: string) => void
}) => {
  const t = useTranslate()
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {t(label)}
        <span className={styles.counter}>
          {value.length}/{MAX_INSTRUCTION_LENGTH}
        </span>
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={4}
        maxLength={MAX_INSTRUCTION_LENGTH}
        placeholder={t(placeholder)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

const InstructionsSetting = () => {
  const t = useTranslate()
  const saved = usePersonalization()
  const [aboutUser, setAboutUser] = useState(saved.aboutUser)
  const [responseStyle, setResponseStyle] = useState(saved.responseStyle)
  const dirty = aboutUser.trim() !== saved.aboutUser || responseStyle.trim() !== saved.responseStyle

  return (
    <section className={styles.section} aria-labelledby="personal-instructions">
      <h3 id="personal-instructions" className={styles.heading}>
        {t('personalInstructionsTitle')}
      </h3>
      <Switch
        label={t('personalInstructionsEnabled')}
        description={t('personalInstructionsEnabledDescription')}
        checked={saved.instructionsEnabled}
        onChange={setInstructionsEnabled}
      />
      <InstructionField
        label="personalAboutUser"
        placeholder="personalAboutUserPlaceholder"
        value={aboutUser}
        onChange={setAboutUser}
      />
      <InstructionField
        label="personalResponseStyle"
        placeholder="personalResponseStylePlaceholder"
        value={responseStyle}
        onChange={setResponseStyle}
      />
      <div className={styles.actions}>
        <Button
          variant="outlined"
          size="m"
          disabled={!dirty}
          onClick={() => {
            setAboutUser(saved.aboutUser)
            setResponseStyle(saved.responseStyle)
          }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          size="m"
          disabled={!dirty}
          onClick={() => {
            setInstructions(aboutUser, responseStyle)
            const next = usePersonalization.getState()
            setAboutUser(next.aboutUser)
            setResponseStyle(next.responseStyle)
            showToast({ key: 'personalInstructionsSaved' })
          }}
        >
          {t('personalSave')}
        </Button>
      </div>
    </section>
  )
}

const MemorySetting = () => {
  const t = useTranslate()
  const { memoryEnabled, autoMemory, memories } = usePersonalization()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [previous, setPrevious] = useState<string[] | null>(null)
  const full = memories.length >= MAX_MEMORIES
  useBackLayer(editing !== null, () => setEditing(null))

  const add = () => {
    if (addMemory(draft)) {
      setDraft('')
    } else if (draft.trim()) {
      showToast({ key: 'memoryDuplicate' })
    }
  }

  const organize = async () => {
    if (!ensureApiKey()) {
      return
    }
    const before = memories.map((memory) => memory.text)
    setOrganizing(true)
    try {
      const count = await consolidateMemories()
      setPrevious(before)
      showToast({ key: 'memoryOrganized', params: { count } })
    } catch {
      showToast({ key: 'memoryOrganizeFailed', type: 'error' })
    } finally {
      setOrganizing(false)
    }
  }

  return (
    <section className={styles.section} aria-labelledby="personal-memory">
      <h3 id="personal-memory" className={styles.heading}>
        {t('memoryTitle')}
      </h3>
      <Switch
        label={t('memoryEnabled')}
        description={t('memoryEnabledDescription')}
        checked={memoryEnabled}
        onChange={setMemoryEnabled}
      />
      <Switch
        label={t('memoryAuto')}
        description={t('memoryAutoDescription')}
        checked={memoryEnabled && autoMemory}
        disabled={!memoryEnabled}
        onChange={setAutoMemory}
      />

      <div className={styles.listHeader}>
        <span>{t('memoryListTitle', { count: memories.length })}</span>
        <span className={styles.listActions}>
          {previous ? (
            <Button
              variant="outlined"
              size="m"
              onClick={() => {
                replaceMemories(previous)
                setPrevious(null)
                showToast({ key: 'memoryOrganizeUndone' })
              }}
            >
              {t('memoryUndoOrganize')}
            </Button>
          ) : null}
          <Button
            variant="outlined"
            size="m"
            disabled={memories.length < 2 || organizing}
            onClick={() => void organize()}
          >
            {t(organizing ? 'memoryOrganizing' : 'memoryOrganize')}
          </Button>
          <Button
            variant="dangerOutlined"
            size="m"
            disabled={memories.length === 0 || organizing}
            onClick={() => setConfirmClear(true)}
          >
            {t('memoryClear')}
          </Button>
        </span>
      </div>

      <form
        className={clsx(settingsStyles.apiKeyInput, styles.addRow)}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input
          aria-label={t('memoryAddPlaceholder')}
          placeholder={full ? t('memoryFull') : t('memoryAddPlaceholder')}
          maxLength={MAX_MEMORY_LENGTH}
          value={draft}
          disabled={full || organizing}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className={settingsStyles.confirm}
          disabled={!draft.trim() || full || organizing}
        >
          {t('memoryAdd')}
        </button>
      </form>

      {memories.length === 0 ? (
        <p className={styles.empty}>{t('memoryEmpty')}</p>
      ) : (
        <ul className={styles.list} aria-busy={organizing}>
          {[...memories].reverse().map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              editing={editing?.id === memory.id ? editing.text : null}
              disabled={organizing}
              onEdit={(text) => setEditing({ id: memory.id, text })}
              onCancel={() => setEditing(null)}
              onSave={() => {
                if (editing) {
                  updateMemory(editing.id, editing.text)
                }
                setEditing(null)
              }}
            />
          ))}
        </ul>
      )}

      {confirmClear ? (
        <Modal
          title={t('memoryClearTitle')}
          className={settingsStyles.deleteConfirm}
          onClose={() => setConfirmClear(false)}
          footer={
            <div className={settingsStyles.deleteActions}>
              <Button variant="outlined" autoFocus onClick={() => setConfirmClear(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  clearMemories()
                  setPrevious(null)
                  setConfirmClear(false)
                  showToast({ key: 'memoryCleared' })
                }}
              >
                {t('memoryClear')}
              </Button>
            </div>
          }
        >
          {t('memoryClearDescription')}
        </Modal>
      ) : null}
    </section>
  )
}

const MemoryItem = ({
  memory,
  editing,
  disabled,
  onEdit,
  onCancel,
  onSave,
}: {
  memory: Memory
  editing: string | null
  disabled: boolean
  onEdit: (text: string) => void
  onCancel: () => void
  onSave: () => void
}) => {
  const t = useTranslate()
  if (editing !== null) {
    return (
      <li className={styles.item}>
        <form
          className={clsx(settingsStyles.apiKeyInput, styles.editRow)}
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <input
            aria-label={t('memoryEdit')}
            autoFocus
            maxLength={MAX_MEMORY_LENGTH}
            value={editing}
            onChange={(event) => onEdit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                onCancel()
              }
            }}
          />
          <button type="button" className={settingsStyles.confirm} onClick={onCancel}>
            {t('cancel')}
          </button>
          <span className={settingsStyles.divider} />
          <button type="submit" className={settingsStyles.confirm}>
            {t('personalSave')}
          </button>
        </form>
      </li>
    )
  }
  return (
    <li className={styles.item}>
      <div className={styles.itemText}>
        <span>{memory.text}</span>
        <span className={styles.itemMeta}>
          {formatDate(new Date(memory.updatedAt))} ·{' '}
          {t(memory.source === 'auto' ? 'memorySourceAuto' : 'memorySourceManual')}
        </span>
      </div>
      <IconButton
        icon={<IconEditOutline16 />}
        tooltip={t('memoryEdit')}
        disabled={disabled}
        onClick={() => onEdit(memory.text)}
      />
      <IconButton
        icon={<IconTrashOutline16 />}
        tooltip={t('memoryDelete')}
        disabled={disabled}
        onClick={() => removeMemory(memory.id)}
      />
    </li>
  )
}
