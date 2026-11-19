/** 按 DeepSeek 定价规则及国务院办公厅公布的放假日历维护。周末调休上班仍按空闲时段。 */
const HOLIDAYS: Record<number, readonly (readonly [string, string])[]> = {
  2026: [
    ['01-01', '01-03'],
    ['02-15', '02-23'],
    ['04-04', '04-06'],
    ['05-01', '05-05'],
    ['06-19', '06-21'],
    ['09-25', '09-27'],
    ['10-01', '10-07'],
  ],
  2027: [
    ['01-01', '01-03'],
    ['02-05', '02-13'],
    ['04-03', '04-05'],
    ['05-01', '05-05'],
    ['06-09', '06-09'],
    ['09-15', '09-15'],
    ['10-01', '10-07'],
  ],
}

export type BillingPeriod = 'peak' | 'offPeak' | 'unknown'

const HOUR = 3_600_000
const BEIJING_OFFSET = 8 * HOUR
const DAY = 24 * HOUR

const periodAt = (time: number): BillingPeriod => {
  const beijing = new Date(time + BEIJING_OFFSET)
  const day = beijing.getUTCDay()
  const hour = beijing.getUTCHours()
  if (day === 0 || day === 6 || !((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18))) {
    return 'offPeak'
  }
  const holidays = HOLIDAYS[beijing.getUTCFullYear()]
  if (!holidays) {
    return 'unknown'
  }
  const date = beijing.toISOString().slice(5, 10)
  return holidays.some(([start, end]) => date >= start && date <= end) ? 'offPeak' : 'peak'
}

export const getBillingTime = (time: number) => {
  const period = periodAt(time)
  const midnight = Math.floor((time + BEIJING_OFFSET) / DAY) * DAY - BEIJING_OFFSET
  for (let day = 0; day <= 14; day++) {
    for (const hour of [0, 9, 12, 14, 18]) {
      const at = midnight + day * DAY + hour * HOUR
      if (at > time) {
        const nextPeriod = periodAt(at)
        if (nextPeriod !== period) {
          return { period, next: { at, period: nextPeriod } }
        }
      }
    }
  }
  return { period, next: null }
}
