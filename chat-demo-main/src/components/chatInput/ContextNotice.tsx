import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { getInputTokens, type estimateContext } from '../../services/chat/context.js'
import type { MessageUsage } from '../../services/api/types.js'
import { IconWarningOutline16 } from '../base/icons.js'
import styles from './ChatInput.module.css'

export const ContextNotice = ({
  estimate,
  rejected,
  canCarry,
  attachmentCount,
  usage,
  carrying,
  onCarry,
}: {
  estimate: ReturnType<typeof estimateContext>
  rejected: boolean
  canCarry: boolean
  attachmentCount: number
  usage?: MessageUsage
  carrying: boolean
  onCarry: () => void
}) => {
  const t = useTranslate()
  return (
    <aside className={clsx(styles.contextNotice, rejected && styles.contextRejected)}>
      <span aria-hidden="true">
        <IconWarningOutline16 />
      </span>
      <div className={styles.contextContent}>
        <div className={styles.contextHeading} role="status">
          <strong>
            {t(
              rejected
                ? 'contextRejected'
                : estimate.over
                  ? 'contextEstimatedOver'
                  : 'contextNearLimit'
            )}
          </strong>
          {!rejected && !estimate.over ? (
            <span>{t('contextEstimatePercent', { percent: estimate.percent })}</span>
          ) : null}
        </div>
        <div>
          {t(
            rejected
              ? canCarry
                ? 'contextRejectedHelp'
                : 'contextShortenHelp'
              : estimate.over
                ? 'contextEstimatedOverHelp'
                : 'contextNearHelp'
          )}
        </div>
        {canCarry ? (
          <button
            type="button"
            className={styles.contextAction}
            disabled={carrying}
            onClick={onCarry}
          >
            {t(attachmentCount > 0 ? 'contextCarryWithFiles' : 'contextCarryDraft')}
          </button>
        ) : null}
        {usage || estimate.unknownFiles ? (
          <details className={styles.contextDetails}>
            <summary>{t('contextUsageDetails')}</summary>
            {usage ? (
              <div>
                {t('contextLastUsage', {
                  input: getInputTokens(usage).toLocaleString(),
                  cached: usage.cache_read_input_tokens.toLocaleString(),
                })}
              </div>
            ) : null}
            {estimate.unknownFiles ? <div>{t('contextUnknownFiles')}</div> : null}
          </details>
        ) : null}
      </div>
    </aside>
  )
}
