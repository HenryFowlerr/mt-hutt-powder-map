import {
  angularDifference,
  boxBlur,
  clamp01,
  smoothstep,
  type TerrainAnalysis,
} from './terrainAnalysis'
import type { TerrainData } from '../types'

// Terrain-aware powder deposition model shared by the browser overlay and
// the data pipeline. Produces dense per-cell fields (same grid as the DEM)
// of expected skiable powder in cm for the recent storm and the forecast
// period, using wind loading, scour, elevation, temperature, and concavity.

export type PowderWeather = {
  recentSnowCm: number
  forecastSnowCm: number
  mainWindDirectionDeg: number
  avgWindKph: number
  maxGustKph?: number
  temperatureMaxC: number
  temperatureMinC: number
}

export type PowderField = {
  width: number
  height: number
  recentCm: Float32Array
  forecastCm: Float32Array
  recentScore: Float32Array
  forecastScore: Float32Array
}

type CellFactors = {
  leeFactor: number
  scourPenalty: number
  elevationFactor: number
  concavityFactor: number
  coldFactor: number
  skiable: number
}

function cellFactors(
  index: number,
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  weather: PowderWeather,
): CellFactors {
  const elevation = terrain.heights[index]
  const slope = analysis.slopeDeg[index]
  const aspect = analysis.aspectDeg[index]

  // Wind direction is where wind comes FROM; lee slopes face away from it.
  const leeAspectDeg = (weather.mainWindDirectionDeg + 180) % 360
  const aspectDifference = angularDifference(aspect, leeAspectDeg)
  // Flat terrain has no meaningful aspect: fade lee effect below ~8 deg slope.
  const aspectRelevance = smoothstep(4, 12, slope)
  const leeAlignment = smoothstep(110, 20, aspectDifference)

  const gustKph = weather.maxGustKph ?? weather.avgWindKph * 1.6
  const transportFactor = smoothstep(15, 45, weather.avgWindKph)
  const overScourFactor = smoothstep(55, 85, gustKph)

  const concavityFactor = analysis.gullyFactor[index]
  const leeFactor = leeAlignment * aspectRelevance * transportFactor * (0.55 + 0.45 * concavityFactor)

  // Exposed convex terrain loses snow to wind; worse in strong gusts.
  const windward = smoothstep(110, 20, angularDifference(aspect, weather.mainWindDirectionDeg)) * aspectRelevance
  const scourPenalty = clamp01(
    analysis.ridgeExposure[index] * (0.35 + 0.65 * transportFactor) +
      windward * transportFactor * 0.4 +
      analysis.ridgeExposure[index] * overScourFactor * 0.5,
  )

  const elevationFactor = smoothstep(1450, 2050, elevation)
  const coldFactor =
    weather.temperatureMaxC <= 0 ? 1 : weather.temperatureMaxC <= 2 ? 0.55 : 0.1

  return {
    leeFactor,
    scourPenalty,
    elevationFactor,
    concavityFactor,
    coldFactor,
    skiable: analysis.skiMask[index],
  }
}

function scoreCell(snowSignal: number, factors: CellFactors) {
  const raw =
    0.32 * snowSignal +
    0.26 * factors.leeFactor +
    0.16 * factors.elevationFactor +
    0.12 * factors.concavityFactor +
    0.1 * factors.coldFactor -
    0.22 * factors.scourPenalty
  return clamp01(raw) * factors.skiable
}

function expectedCm(baseSnowCm: number, score: number, factors: CellFactors) {
  const windLoadedBonusCm = baseSnowCm * 0.6 * factors.leeFactor
  const scourLossCm = baseSnowCm * 0.7 * factors.scourPenalty
  const cm = baseSnowCm * (0.45 + 0.75 * score) + windLoadedBonusCm - scourLossCm
  // Hard-mask non-skiable backside terrain so patches never appear there.
  return Math.max(0, cm) * smoothstep(0.25, 0.7, factors.skiable)
}

export function buildPowderField(
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  weather: PowderWeather,
): PowderField {
  const size = terrain.width * terrain.height
  const recentCm = new Float32Array(size)
  const forecastCm = new Float32Array(size)
  const recentScore = new Float32Array(size)
  const forecastScore = new Float32Array(size)

  const recentSignal = clamp01(weather.recentSnowCm / 35)
  const forecastSignal = clamp01(weather.forecastSnowCm / 35)

  for (let index = 0; index < size; index += 1) {
    const factors = cellFactors(index, terrain, analysis, weather)
    recentScore[index] = scoreCell(recentSignal, factors)
    forecastScore[index] = scoreCell(forecastSignal, factors)
    recentCm[index] = expectedCm(weather.recentSnowCm, recentScore[index], factors)
    forecastCm[index] = expectedCm(weather.forecastSnowCm, forecastScore[index], factors)
    // Below ~2 cm is not a powder signal worth showing.
    if (recentCm[index] < 2) recentCm[index] = 0
    if (forecastCm[index] < 2) forecastCm[index] = 0
  }

  return {
    width: terrain.width,
    height: terrain.height,
    recentCm: boxBlur(recentCm, terrain.width, terrain.height, 1),
    forecastCm: boxBlur(forecastCm, terrain.width, terrain.height, 1),
    recentScore: boxBlur(recentScore, terrain.width, terrain.height, 1),
    forecastScore: boxBlur(forecastScore, terrain.width, terrain.height, 1),
  }
}

function compassLabel(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

// Human explanation of why a cell scores the way it does, for hover
// tooltips and polygon metadata.
export function describeCell(
  index: number,
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  weather: PowderWeather,
): { reason: string; dominantFactor: string } {
  const factors = cellFactors(index, terrain, analysis, weather)
  const windFrom = compassLabel(weather.mainWindDirectionDeg)
  const facing = compassLabel(analysis.aspectDeg[index])

  const candidates: Array<[number, string, string]> = [
    [
      factors.leeFactor,
      'wind loading',
      `Likely lee-loaded from ${windFrom} wind onto sheltered ${facing}-facing terrain.`,
    ],
    [
      factors.concavityFactor * 0.9,
      'sheltered gully',
      `Concave ${facing}-facing gully/bowl terrain that collects drifting snow.`,
    ],
    [
      factors.elevationFactor * 0.8,
      'elevation',
      `High elevation (${Math.round(terrain.heights[index])} m) keeping snow cold and dry.`,
    ],
    [
      factors.scourPenalty,
      'wind scour',
      `Exposed ${facing}-facing terrain likely scoured by ${windFrom} wind.`,
    ],
  ]

  candidates.sort((a, b) => b[0] - a[0])
  const [, dominantFactor, reason] = candidates[0]
  if (candidates[0][0] < 0.15) {
    return {
      reason: 'Mixed signal: modest new snow without strong wind loading here.',
      dominantFactor: 'recent snowfall',
    }
  }
  return { reason, dominantFactor }
}

export function fieldMaxCm(field: PowderField, mode: 'recent' | 'forecast') {
  const grid = mode === 'recent' ? field.recentCm : field.forecastCm
  let max = 0
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] > max) max = grid[i]
  }
  return max
}

export const POWDER_THRESHOLDS_CM = [5, 10, 20, 30, 40]

export function powderColorForCm(cm: number) {
  if (cm >= 40) return '#0b7a4b' // deep emerald
  if (cm >= 30) return '#1e9e56'
  if (cm >= 20) return '#43b95f'
  if (cm >= 10) return '#7ed07f'
  if (cm >= 5) return '#c3e58e' // pale yellow-green
  return '#e9f2c9'
}
