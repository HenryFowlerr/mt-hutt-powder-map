const MOUNTAIN_TIME_ZONE = 'Pacific/Auckland'
const DAY_MS = 24 * 60 * 60 * 1000

const mountainDateFormatter = new Intl.DateTimeFormat('en-NZ', {
  timeZone: MOUNTAIN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const displayDateFormatter = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

function dateKeyFromInstant(value: string | number | Date) {
  const parts = mountainDateFormatter.formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function normalizeForecastDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateKeyFromInstant(date)
}

function dateOrdinal(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

function fullDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return displayDateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)))
}

export type OutlookDayTiming = {
  label: string
  leadDay: number
  isLongRange: boolean
}

export function outlookDayTiming(
  date: string,
  generatedAt: string,
  now: string | number | Date,
): OutlookDayTiming {
  const dateKey = normalizeForecastDate(date)
  const relativeDay = dateOrdinal(dateKey) - dateOrdinal(dateKeyFromInstant(now))
  const leadDay = Math.max(
    1,
    dateOrdinal(dateKey) - dateOrdinal(dateKeyFromInstant(generatedAt)) + 1,
  )

  return {
    label:
      relativeDay === 0
        ? 'Today'
        : relativeDay === 1
          ? 'Tomorrow'
          : fullDateLabel(dateKey),
    leadDay,
    isLongRange: leadDay >= 8,
  }
}

export function outlookIssueAgeHours(
  generatedAt: string,
  now: string | number | Date,
) {
  return Math.max(0, (new Date(now).getTime() - Date.parse(generatedAt)) / (60 * 60 * 1000))
}
