import type { EnsembleSnowfallSummary } from '../src/types'

type UnknownRecord = Record<string, unknown>

const MEMBER_KEY = /^snowfall(?:_member\d{2})?$/

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function round1(value: number) {
  return Number(value.toFixed(1))
}

function percentile(sorted: number[], probability: number) {
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function validMemberTotal(value: unknown, expectedLength: number) {
  if (!Array.isArray(value) || value.length !== expectedLength) return null

  let total = 0
  for (const amount of value) {
    // Reject an entire member when an hour is missing. Treating null as zero
    // would systematically pull the distribution down.
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null
    total += amount
  }
  return total
}

export function summariseGfsEnsemble(
  payload: unknown,
  generatedAt = new Date().toISOString(),
): EnsembleSnowfallSummary | undefined {
  if (!isRecord(payload) || !isRecord(payload.hourly)) return undefined

  const times = payload.hourly.time
  if (
    !Array.isArray(times) ||
    times.length === 0 ||
    times.some((time) => typeof time !== 'string' || !Number.isFinite(Date.parse(time)))
  ) {
    return undefined
  }

  const totals = Object.entries(payload.hourly)
    .filter(([key]) => MEMBER_KEY.test(key))
    .sort(([a], [b]) => {
      if (a === 'snowfall') return -1
      if (b === 'snowfall') return 1
      return a.localeCompare(b)
    })
    .map(([, series]) => validMemberTotal(series, times.length))
    .filter((total): total is number => total !== null)
    .sort((a, b) => a - b)

  // A single surviving series is a deterministic forecast, not a useful
  // ensemble distribution.
  if (totals.length < 2) return undefined

  const probabilityPct = (thresholdCm: number) =>
    round1((totals.filter((total) => total >= thresholdCm).length / totals.length) * 100)

  return {
    source: 'Open-Meteo Ensemble API',
    model: 'gfs_seamless',
    generatedAt,
    windowStartAt: times[0] as string,
    windowEndAt: times[times.length - 1] as string,
    windowHours: times.length,
    memberCount: totals.length,
    snowfallCm: {
      p10: round1(percentile(totals, 0.1)),
      p50: round1(percentile(totals, 0.5)),
      p90: round1(percentile(totals, 0.9)),
      mean: round1(totals.reduce((sum, total) => sum + total, 0) / totals.length),
    },
    probabilityPct: {
      atLeast1Cm: probabilityPct(1),
      atLeast5Cm: probabilityPct(5),
      atLeast10Cm: probabilityPct(10),
    },
  }
}
