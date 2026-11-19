import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getUserBalance, type UserBalance } from '../../services/api/client.js'
import { getBillingTime, type BillingPeriod } from '../../services/api/billingTime.js'
import { useSettings } from '../../services/settings.js'
import { IconRefreshOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import styles from './Settings.module.css'

type BalanceState = {
  key: string
  value: UserBalance | null
  updatedAt: number
  phase: 'loading' | 'done' | 'error'
}

const periodKey = {
  peak: 'apiBillingPeak',
  offPeak: 'apiBillingOffPeak',
  unknown: 'apiBillingUnknown',
} as const satisfies Record<BillingPeriod, string>

export const ApiBalance = ({ apiKey }: { apiKey: string | null }) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [balance, setBalance] = useState<BalanceState | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [now, setNow] = useState(Date.now)
  const { period, next } = getBillingTime(now)
  const snapshot = balance?.key === apiKey ? balance : null
  const loading = apiKey !== null && (!snapshot || snapshot.phase === 'loading')
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount))
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  useEffect(() => {
    const update = () => setNow(Date.now())
    const boundary = next?.at ?? now + 60_000
    const timer = window.setTimeout(
      update,
      Math.max(100, Math.min(60_000, boundary - Date.now() + 30))
    )
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [next?.at, now])

  useEffect(() => {
    if (!apiKey) {
      setBalance(null)
      return
    }
    const controller = new AbortController()
    let active = true
    setBalance((previous) => ({
      key: apiKey,
      value: previous?.key === apiKey ? previous.value : null,
      updatedAt: previous?.key === apiKey ? previous.updatedAt : 0,
      phase: 'loading',
    }))
    const timer = window.setTimeout(() => controller.abort(), 10_000)
    void getUserBalance(apiKey, controller.signal)
      .then((value) => {
        if (active) {
          setBalance({ key: apiKey, value, updatedAt: Date.now(), phase: 'done' })
        }
      })
      .catch(() => {
        if (active) {
          setBalance((previous) =>
            previous?.key === apiKey ? { ...previous, phase: 'error' } : previous
          )
        }
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiKey, refresh])

  return (
    <section className={styles.apiBalance} aria-label={t('apiBalanceTitle')}>
      <div className={styles.balanceRow}>
        <div className={styles.balanceContent}>
          <span className={styles.label}>{t('apiBalanceTitle')}</span>
          {snapshot?.value?.balance_infos.map((entry) => (
            <div key={entry.currency}>
              <div className={styles.balanceAmount}>
                {money(entry.total_balance, entry.currency)} <small>{entry.currency}</small>
              </div>
              <div className={styles.balanceMeta}>
                {t('apiBalanceBreakdown', {
                  toppedUp: money(entry.topped_up_balance, entry.currency),
                  granted: money(entry.granted_balance, entry.currency),
                })}
              </div>
            </div>
          ))}
          <div className={styles.balanceMeta} role="status">
            {loading
              ? t('apiBalanceLoading')
              : snapshot?.phase === 'error'
                ? t(snapshot.value ? 'apiBalanceStale' : 'apiBalanceFailed')
                : !apiKey
                  ? t('apiBalanceNeedsKey')
                  : snapshot?.value?.is_available === false
                    ? t('apiBalanceUnavailable')
                    : snapshot?.value?.balance_infos.length === 0
                      ? t('apiBalanceNoData')
                      : null}
          </div>
        </div>
        {apiKey ? (
          <IconButton
            icon={<IconRefreshOutline16 />}
            tooltip={t('apiBalanceRefresh')}
            disabled={loading}
            onClick={() => setRefresh((count) => count + 1)}
          />
        ) : null}
      </div>
      <div className={styles.balancePeriod}>
        <span>{t('apiBillingPeriod')}</span>
        <div>
          <strong>{t(periodKey[period])}</strong>
          {next && next.period !== 'unknown' && period !== 'unknown' ? (
            <div className={styles.balanceMeta}>
              {t('apiBillingNext', {
                time: time.format(next.at),
                period: t(periodKey[next.period]),
              })}
            </div>
          ) : null}
        </div>
      </div>
      {snapshot?.updatedAt ? (
        <div className={styles.balanceMeta}>
          {t('apiBalanceUpdated', {
            time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
              snapshot.updatedAt
            ),
          })}
        </div>
      ) : null}
    </section>
  )
}
