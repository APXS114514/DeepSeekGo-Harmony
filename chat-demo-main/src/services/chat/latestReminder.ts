import { formatUserLocation, type UserLocation } from '../location.js'
import type { Locale } from '../settings.js'
import { formatDate } from '../../utils/format.js'
import { translate } from '../../i18n/index.js'

/** 模型约定的五项信息；日期与星期使用浏览器本地时区，避免 UTC 日期跨日。 */
export const createLatestReminder = (
  {
    locale,
    location,
    locationOverride,
  }: { locale: Locale; location: UserLocation | null; locationOverride?: string | null },
  now = new Date()
): string => {
  const place =
    typeof locationOverride === 'string' && locationOverride.trim()
      ? locationOverride.trim()
      : formatUserLocation(location, locale)
  return [
    formatDate(now),
    new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now),
    place,
    'Web',
    translate('latestReminderLanguage'),
  ].join(',')
}
