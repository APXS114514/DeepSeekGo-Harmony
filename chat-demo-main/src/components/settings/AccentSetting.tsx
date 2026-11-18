import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { normalizeAccentColor, setAccentColor, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import styles from './AccentSetting.module.css'

const defaultColor = '#24634d'
const presets = [null, '#2869bc', '#7449ad', '#ad4836', '#647584'] as const
const labels = [
  'accentDefault',
  'accentBlue',
  'accentPurple',
  'accentCoral',
  'accentSlate',
] as const

export const AccentSetting = () => {
  const t = useTranslate()
  const selected = useSettings((state) => state.accentColor)
  const [draft, setDraft] = useState(selected ?? defaultColor)
  const parsed = normalizeAccentColor(draft)

  const select = (color: string | null) => {
    setAccentColor(color)
    setDraft(color ?? defaultColor)
  }

  return (
    <section className={styles.setting} aria-label={t('accentTitle')}>
      <div>{t('accentTitle')}</div>
      <div className={styles.swatches} role="group" aria-label={t('accentPresets')}>
        {presets.map((color, index) => (
          <button
            key={color ?? 'default'}
            type="button"
            className={styles.swatch}
            aria-pressed={selected === color}
            aria-label={t(labels[index])}
            title={t(labels[index])}
            onClick={() => select(color)}
          >
            <span style={{ backgroundColor: color ?? defaultColor }} />
          </button>
        ))}
      </div>
      <form
        className={styles.custom}
        onSubmit={(event) => {
          event.preventDefault()
          if (parsed) {
            select(parsed)
          }
        }}
      >
        <input
          className={styles.picker}
          type="color"
          aria-label={t('accentPicker')}
          value={parsed ?? defaultColor}
          onChange={(event) => setDraft(event.target.value)}
        />
        <input
          className={styles.hex}
          aria-label={t('accentHex')}
          value={draft}
          maxLength={7}
          placeholder="#RRGGBB"
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="s" variant="outlined" type="submit" disabled={!parsed}>
          {t('accentApply')}
        </Button>
      </form>
    </section>
  )
}
