import clsx from 'clsx'
import { useId, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  MAX_PERSONA_CARDS,
  MAX_PERSONA_NAME_LENGTH,
  MAX_PERSONA_PROMPT_LENGTH,
  removePersonaCard,
  savePersonaCard,
  selectPersonaCard,
  setPersonaCardsEnabled,
  usePersonalization,
  type PersonaCard,
} from '../../services/personalization.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconEditOutline16, IconTrashOutline16 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { SettingsSwitch } from './SettingsSwitch.js'
import styles from './Personalization.module.css'
import settingsStyles from './Settings.module.css'

type PersonaDraft = Omit<PersonaCard, 'id'> & { id?: string }

export const PersonaCardsSettings = () => {
  const t = useTranslate()
  const radioGroup = useId()
  const cards = usePersonalization((state) => state.personaCards)
  const enabled = usePersonalization((state) => state.personaCardsEnabled)
  const activeId = usePersonalization((state) => state.activePersonaId)
  const [editing, setEditing] = useState<PersonaDraft | null>(null)
  const [deleting, setDeleting] = useState<PersonaCard | null>(null)
  const full = cards.length >= MAX_PERSONA_CARDS

  return (
    <section className={styles.section} aria-labelledby="personal-personas">
      <h3 id="personal-personas" className={styles.heading}>
        {t('personaCardsTitle')}
      </h3>
      <SettingsSwitch
        label={t('personaCardsEnabled')}
        description={t('personaCardsDescription')}
        checked={enabled}
        onChange={setPersonaCardsEnabled}
      />
      <div className={styles.listHeader}>
        <Button
          variant="outlined"
          size="s"
          disabled={full}
          onClick={() => setEditing({ name: '', prompt: '' })}
        >
          {t('personaAdd')}
        </Button>
        {full ? (
          <span className={styles.itemMeta}>
            {t('personaCardsLimit', { count: MAX_PERSONA_CARDS })}
          </span>
        ) : null}
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>{t('personaCardsEmpty')}</p>
      ) : (
        <ul className={styles.list} aria-label={t('personaCardsTitle')}>
          {cards.map((card) => (
            <li key={card.id} className={styles.item}>
              <label className={styles.personaChoice}>
                <input
                  type="radio"
                  name={radioGroup}
                  aria-label={card.name}
                  checked={activeId === card.id}
                  onChange={() => selectPersonaCard(card.id)}
                />
                <span className={styles.itemText}>
                  <span>{card.name}</span>
                  <span className={clsx(styles.itemMeta, styles.personaPreview)}>
                    {card.prompt}
                  </span>
                </span>
              </label>
              <IconButton
                icon={<IconEditOutline16 />}
                tooltip={t('personaEditNamed', { name: card.name })}
                onClick={() => setEditing(card)}
              />
              <IconButton
                icon={<IconTrashOutline16 />}
                tooltip={t('personaDeleteNamed', { name: card.name })}
                onClick={() => setDeleting(card)}
              />
            </li>
          ))}
        </ul>
      )}
      {editing ? <PersonaEditor initial={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <Modal
          title={t('personaDeleteTitle', { name: deleting.name })}
          className={settingsStyles.deleteConfirm}
          onClose={() => setDeleting(null)}
          footer={
            <div className={settingsStyles.deleteActions}>
              <Button variant="outlined" autoFocus onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  removePersonaCard(deleting.id)
                  setDeleting(null)
                }}
              >
                {t('delete')}
              </Button>
            </div>
          }
        />
      ) : null}
    </section>
  )
}

const PersonaEditor = ({ initial, onClose }: { initial: PersonaDraft; onClose: () => void }) => {
  const t = useTranslate()
  const formId = useId()
  const [name, setName] = useState(initial.name)
  const [prompt, setPrompt] = useState(initial.prompt)

  return (
    <Modal
      title={t(initial.id ? 'personaEdit' : 'personaAdd')}
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <Button variant="outlined" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={!name.trim() || !prompt.trim()}>
            {t('personalSave')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.personaForm}
        onSubmit={(event) => {
          event.preventDefault()
          if (savePersonaCard(name, prompt, initial.id)) {
            onClose()
          }
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('personaName')}</span>
          <input
            className={clsx(styles.textarea, styles.personaName)}
            autoFocus
            required
            maxLength={MAX_PERSONA_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('personaPrompt')}</span>
          <textarea
            className={styles.textarea}
            rows={5}
            required
            maxLength={MAX_PERSONA_PROMPT_LENGTH}
            placeholder={t('personaPromptPlaceholder')}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}
