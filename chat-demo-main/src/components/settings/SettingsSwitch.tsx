import clsx from 'clsx'
import { useId } from 'react'
import styles from './Settings.module.css'

export const SettingsSwitch = ({
  label,
  description,
  checked,
  disabled,
  className,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  className?: string
  onChange: (checked: boolean) => void
}) => {
  const descriptionId = useId()
  return (
    <label className={clsx(styles.immersiveLight, disabled && styles.switchDisabled, className)}>
      <span>
        {label}
        <span id={descriptionId} className={styles.immersiveLightDescription}>
          {description}
        </span>
      </span>
      <input
        className={styles.immersiveLightSwitch}
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
