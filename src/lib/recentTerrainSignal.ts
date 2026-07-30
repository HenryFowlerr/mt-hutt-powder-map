import type { RecentTerrainSignal } from '../types'

const HOUR_MS = 60 * 60 * 1000
const EXPECTED_HOURS = 72

export type RecentTerrainSignalInput = {
  recentSnowCm?: number | null
  generatedAt?: string | number | Date | null
  now?: string | number | Date
  recentHours?: readonly { time: string }[]
  coverageHours?: number
}

function timeMs(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function recentHourCount(hours: readonly { time: string }[], nowMs: number) {
  const unique = new Set<number>()
  for (const hour of hours) {
    const value = timeMs(hour.time)
    if (value === null || value > nowMs || value < nowMs - EXPECTED_HOURS * HOUR_MS) continue
    unique.add(Math.round(value / HOUR_MS))
  }
  return unique.size
}

function strengthForSnow(snowCm: number): RecentTerrainSignal['strength'] {
  if (snowCm < 0.15) return 'none'
  if (snowCm < 1) return 'trace'
  if (snowCm < 5) return 'moderate'
  return 'strong'
}

export function assessRecentTerrainSignal(
  input: RecentTerrainSignalInput,
): RecentTerrainSignal {
  const nowMs = timeMs(input.now) ?? Date.now()
  const generatedMs = timeMs(input.generatedAt)
  const dataAgeHours =
    generatedMs === null ? null : Math.max(0, (nowMs - generatedMs) / HOUR_MS)
  const coverageHours = Math.max(
    0,
    Math.min(
      EXPECTED_HOURS,
      Math.round(
        input.coverageHours ??
          (input.recentHours ? recentHourCount(input.recentHours, nowMs) : 0),
      ),
    ),
  )
  const coverageRatio = coverageHours / EXPECTED_HOURS

  const dataQuality: RecentTerrainSignal['dataQuality'] =
    dataAgeHours !== null && dataAgeHours <= 4 && coverageRatio >= 0.83
      ? 'high'
      : dataAgeHours !== null && dataAgeHours <= 12 && coverageRatio >= 0.5
        ? 'medium'
        : 'low'
  const snowIsValid =
    typeof input.recentSnowCm === 'number' &&
    Number.isFinite(input.recentSnowCm) &&
    input.recentSnowCm >= 0
  const strength =
    !snowIsValid ||
    dataAgeHours === null ||
    dataAgeHours > 24 ||
    coverageHours < 12
      ? 'unknown'
      : strengthForSnow(input.recentSnowCm ?? 0)

  let reason: string
  if (!snowIsValid) {
    reason = 'Recent snowfall total is unavailable.'
  } else if (dataAgeHours === null) {
    reason = 'Recent data freshness cannot be verified.'
  } else if (dataAgeHours > 24) {
    reason = `Recent data is ${Math.round(dataAgeHours)} hours old.`
  } else if (coverageHours < 12) {
    reason = `Only ${coverageHours} of ${EXPECTED_HOURS} recent model hours are available.`
  } else {
    reason = `${coverageHours} of ${EXPECTED_HOURS} recent model hours are available; this is a modelled signal, not measured snowfall.`
  }

  return {
    basis: 'modelled-last-72-hours',
    strength,
    dataQuality,
    coverageHours,
    expectedHours: EXPECTED_HOURS,
    dataAgeHours:
      dataAgeHours === null ? null : Math.round(dataAgeHours * 10) / 10,
    reason,
  }
}

/**
 * Compatibility value for older clients. It is recent-only and represents
 * signal strength, never forecast confidence or future snowfall.
 */
export function legacyConfidenceForRecentSignal(
  signal: RecentTerrainSignal,
): 'low' | 'medium' | 'high' {
  if (signal.dataQuality === 'low') return 'low'
  if (signal.strength === 'strong') return 'high'
  if (signal.strength === 'moderate') return 'medium'
  return 'low'
}

