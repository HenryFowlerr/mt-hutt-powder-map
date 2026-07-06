import type { PowderField, PowderMode } from './powderModel'
import type { TerrainAnalysis } from './terrainAnalysis'
import type { WeatherHour } from '../types'

// Skier-facing insights derived from the model field and the hourly data:
// which aspects are loaded, how the storm evolves hour by hour, and which
// day is the one to ski.

export type AspectRose = {
  labels: string[] // N, NE, ... NW
  meanCm: number[] // mean expected cm per aspect sector (skiable cells only)
  maxCm: number
}

export function buildAspectRose(analysis: TerrainAnalysis, field: PowderField, mode: PowderMode): AspectRose {
  const cmGrid = mode === 'recent' ? field.recentCm : field.forecastCm
  const totals = new Array<number>(8).fill(0)
  const counts = new Array<number>(8).fill(0)

  for (let index = 0; index < cmGrid.length; index += 1) {
    if (analysis.skiMask[index] < 0.5) continue
    if (analysis.slopeDeg[index] < 8) continue // flat cells have no aspect
    const sector = Math.round(analysis.aspectDeg[index] / 45) % 8
    totals[sector] += cmGrid[index]
    counts[sector] += 1
  }

  const meanCm = totals.map((total, sector) => (counts[sector] > 0 ? total / counts[sector] : 0))
  return {
    labels: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    meanCm,
    maxCm: Math.max(1, ...meanCm),
  }
}

export type TimelineBucket = {
  label: string
  snowCm: number
  future: boolean
}

// 6-hour snowfall buckets across the last 72 h and the next 72 h.
export function buildSnowTimeline(observations: WeatherHour[], forecast: WeatherHour[]): TimelineBucket[] {
  const buckets: TimelineBucket[] = []
  const bucketize = (hours: WeatherHour[], future: boolean) => {
    for (let start = 0; start < hours.length; start += 6) {
      const slice = hours.slice(start, start + 6)
      if (slice.length === 0) continue
      buckets.push({
        label: slice[0].time.slice(5, 13).replace('T', ' '),
        snowCm: slice.reduce((total, hour) => total + hour.snowfallCm, 0),
        future,
      })
    }
  }
  bucketize(observations.slice(-72), false)
  bucketize(forecast.slice(0, 72), true)
  return buckets
}

export type DayPick = {
  label: string
  reason: string
} | null

// The day worth skiing: fresh snow counts (including what fell the night
// before), strong wind and warm temps count against.
export function pickBestDay(
  days: Array<{ label: string; snowCm: number; windKph: number; minC: number; maxC: number }>,
): DayPick {
  if (days.length === 0) return null
  let best = days[0]
  let bestScore = -Infinity
  let previousSnow = 0

  for (const day of days) {
    const overnight = previousSnow * 0.6 // yesterday's snow still skis well
    const windPenalty = Math.max(0, day.windKph - 30) * 0.4
    const warmPenalty = Math.max(0, day.maxC - 2) * 1.5
    const score = day.snowCm + overnight - windPenalty - warmPenalty
    if (score > bestScore) {
      bestScore = score
      best = day
    }
    previousSnow = day.snowCm
  }

  if (bestScore < 3) return null
  const descriptors: string[] = []
  if (best.snowCm >= 5) descriptors.push(`${Math.round(best.snowCm)} cm falling`)
  else descriptors.push('fresh snow from the day before')
  if (best.windKph < 25) descriptors.push('manageable wind')
  if (best.maxC <= 0) descriptors.push('cold snow')
  return { label: best.label, reason: descriptors.join(' · ') }
}
