import {
  angularDifference,
  boxBlur,
  clamp01,
  computeWindShelter,
  smoothstep,
  type TerrainAnalysis,
} from './terrainAnalysis'
import type { TerrainData } from '../types'

// Wind-shelter grids are expensive enough to memoise per terrain + wind
// direction (rounded to 5 degrees; finer differences do not change the map).
const shelterCache = new WeakMap<TerrainData, Map<number, Float32Array>>()

function getWindShelter(terrain: TerrainData, windFromDeg: number) {
  const key = Math.round(windFromDeg / 5) * 5
  let byDirection = shelterCache.get(terrain)
  if (!byDirection) {
    byDirection = new Map()
    shelterCache.set(terrain, byDirection)
  }
  let shelter = byDirection.get(key)
  if (!shelter) {
    shelter = computeWindShelter(terrain, key)
    byDirection.set(key, shelter)
  }
  return shelter
}

// Open-Meteo's point forecast is roughly valid at mid-mountain; snowfall
// and temperature are adjusted per cell from there.
const REFERENCE_ELEVATION_M = 1600
const LAPSE_RATE_C_PER_M = 0.0065

// Per-cell snowfall multiplier: orographic enhancement with height, and a
// rain cutoff below the freezing level (snow needs ~200 m of cold air).
function snowfallMultiplier(elevation: number, freezingLevelM?: number) {
  const orographic = Math.max(0.55, Math.min(1.6, 1 + ((elevation - REFERENCE_ELEVATION_M) / 100) * 0.055))
  const rainLine = freezingLevelM ? smoothstep(freezingLevelM - 250, freezingLevelM + 100, elevation) : 1
  return orographic * rainLine
}

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
  forecastWindDirectionDeg?: number
  forecastAvgWindKph?: number
  forecastMaxGustKph?: number
  forecastTemperatureMaxC?: number
  forecastTemperatureMinC?: number
  forecastFreezingLevelM?: number
  forecastRainMm?: number
  forecastHoursAboveZero?: number
  temperatureMaxC: number
  temperatureMinC: number
  cloudLowPct?: number
  cloudMidPct?: number
  cloudHighPct?: number
  freezingLevelM?: number
  recentRainMm?: number
  hoursAboveZero?: number
  hoursSinceSnow?: number
  meltFreezeCycles?: number
}

export type PowderField = {
  width: number
  height: number
  recentCm: Float32Array
  forecastCm: Float32Array
  recentScore: Float32Array
  forecastScore: Float32Array
}

export type PowderMode = 'recent' | 'forecast'

type CellFactors = {
  leeFactor: number
  shelterFactor: number
  scourPenalty: number
  elevationFactor: number
  concavityFactor: number
  coldFactor: number
  qualityFactor: number
  snowMultiplier: number
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
  const shelterDeg = getWindShelter(terrain, weather.mainWindDirectionDeg)[index]

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

  // Upwind horizon (Winstral Sx): deposition behind ridge crests, stripping
  // on open windward ground. This carries more weight than aspect alone —
  // a NE face right behind a crest loads far more than an open NE face.
  const shelterFactor = smoothstep(2, 13, shelterDeg)
  const exposureFactor = smoothstep(1, 10, -shelterDeg)

  const leeFactor =
    (0.45 * leeAlignment * aspectRelevance + 0.55 * shelterFactor) *
    transportFactor *
    (0.55 + 0.45 * concavityFactor)

  // Exposed convex/windward terrain loses snow to wind; worse in gusts.
  const windward = smoothstep(110, 20, angularDifference(aspect, weather.mainWindDirectionDeg)) * aspectRelevance
  const scourPenalty = clamp01(
    analysis.ridgeExposure[index] * (0.3 + 0.5 * transportFactor) +
      exposureFactor * (0.3 + 0.5 * transportFactor) +
      windward * transportFactor * 0.3 +
      analysis.ridgeExposure[index] * overScourFactor * 0.4,
  )

  const elevationFactor = smoothstep(1450, 2050, elevation)

  // Temperature at the cell via lapse rate from the mid-mountain reading:
  // high terrain keeps snow dry even on a marginal day.
  const cellMaxC = weather.temperatureMaxC - (elevation - REFERENCE_ELEVATION_M) * LAPSE_RATE_C_PER_M
  const coldFactor = cellMaxC <= 0 ? 1 : cellMaxC <= 2 ? 0.55 : 0.1

  // Powder quality degrades after rain, prolonged thaw, refreeze cycles, and
  // time. These inputs affect skiable softness, not the amount that fell.
  const rainPenalty = smoothstep(0.5, 10, weather.recentRainMm ?? 0)
  const thawPenalty = smoothstep(4, 30, weather.hoursAboveZero ?? 0)
  const refreezePenalty = smoothstep(0.5, 2.5, weather.meltFreezeCycles ?? 0)
  const agePenalty =
    weather.hoursSinceSnow === undefined || weather.hoursSinceSnow >= 900
      ? 0
      : smoothstep(12, 72, weather.hoursSinceSnow)
  const qualityFactor = clamp01(
    coldFactor *
      (1 - rainPenalty * 0.62) *
      (1 - thawPenalty * 0.4) *
      (1 - refreezePenalty * 0.28) *
      (1 - agePenalty * 0.32),
  )

  // Very steep terrain sheds new snow (sluffing) before it can pile up.
  const sluff = smoothstep(48, 60, slope)
  const snowMultiplier = snowfallMultiplier(elevation, weather.freezingLevelM) * (1 - 0.7 * sluff)

  return {
    leeFactor,
    shelterFactor,
    scourPenalty,
    elevationFactor,
    concavityFactor,
    coldFactor,
    qualityFactor,
    snowMultiplier,
    skiable: analysis.skiMask[index],
  }
}

function scoreCell(snowSignal: number, factors: CellFactors) {
  const raw =
    0.32 * snowSignal +
    0.26 * factors.leeFactor +
    0.16 * factors.elevationFactor +
    0.12 * factors.concavityFactor +
    0.1 * factors.qualityFactor -
    0.22 * factors.scourPenalty
  return clamp01(raw) * factors.skiable
}

function expectedCm(baseSnowCm: number, factors: CellFactors) {
  // Physical accounting, no double counting:
  //  1. what actually fell here  = storm total * orographic/rain/sluff
  //  2. wind redistribution      = loaded pockets gain, scoured faces lose
  //  3. settlement               = cold dry snow rides deeper
  const fallenCm = baseSnowCm * factors.snowMultiplier
  const redistribution = Math.max(
    0.3,
    Math.min(1.7, 1 + 0.8 * factors.leeFactor - 0.65 * factors.scourPenalty),
  )
  const settle = 0.76 + 0.24 * factors.qualityFactor
  // This field represents skiable powder rather than settled snow depth.
  // Warm, rain-affected, aged, or refrozen snow can remain on the ground
  // while contributing much less soft snow to the skier-facing estimate.
  const softSnowRetention = 0.55 + 0.45 * factors.qualityFactor
  const cm = fallenCm * redistribution * settle * softSnowRetention
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
  const forecastModeWeather = forecastWeather(weather)

  for (let index = 0; index < size; index += 1) {
    const recentFactors = cellFactors(index, terrain, analysis, weather)
    const forecastFactors = cellFactors(index, terrain, analysis, forecastModeWeather)
    recentScore[index] = scoreCell(recentSignal, recentFactors)
    forecastScore[index] = scoreCell(forecastSignal, forecastFactors)
    recentCm[index] = expectedCm(weather.recentSnowCm, recentFactors)
    forecastCm[index] = expectedCm(weather.forecastSnowCm, forecastFactors)
    // Keep light events in the field. The display layer decides how strongly
    // to show them relative to the event, while the centimetre values remain
    // honest and available to summaries/tooltips.
    if (recentCm[index] < 0.15) recentCm[index] = 0
    if (forecastCm[index] < 0.15) forecastCm[index] = 0
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

function forecastWeather(weather: PowderWeather): PowderWeather {
  return {
    ...weather,
    mainWindDirectionDeg: weather.forecastWindDirectionDeg ?? weather.mainWindDirectionDeg,
    avgWindKph: weather.forecastAvgWindKph ?? weather.avgWindKph,
    maxGustKph: weather.forecastMaxGustKph ?? weather.maxGustKph,
    temperatureMaxC: weather.forecastTemperatureMaxC ?? weather.temperatureMaxC,
    temperatureMinC: weather.forecastTemperatureMinC ?? weather.temperatureMinC,
    freezingLevelM: weather.forecastFreezingLevelM ?? weather.freezingLevelM,
    recentRainMm: weather.forecastRainMm ?? 0,
    hoursAboveZero: weather.forecastHoursAboveZero ?? 0,
    hoursSinceSnow: 0,
    meltFreezeCycles: 0,
  }
}

function neighborhoodMean(
  grid: Float32Array,
  width: number,
  height: number,
  col: number,
  row: number,
  radius: number,
) {
  let total = 0
  let count = 0
  for (let dr = -radius; dr <= radius; dr += 1) {
    const r = row + dr
    if (r < 0 || r >= height) continue
    for (let dc = -radius; dc <= radius; dc += 1) {
      const c = col + dc
      if (c < 0 || c >= width) continue
      total += grid[r * width + c]
      count += 1
    }
  }
  return count > 0 ? total / count : 0
}

// Converts the continuous cm model into the field actually painted on the map.
// The model keeps background snowfall in the numbers, but the visible overlay
// should show ski-useful loaded pockets: high scoring, locally concentrated,
// ski-area terrain rather than a broad green wash over every snowy slope.
export function buildPowderDisplayField(
  field: PowderField,
  analysis: TerrainAnalysis,
  mode: PowderMode,
) {
  const cmGrid = mode === 'recent' ? field.recentCm : field.forecastCm
  const scoreGrid = mode === 'recent' ? field.recentScore : field.forecastScore
  const output = new Float32Array(cmGrid.length)

  const scale = powderDisplayScale(field, mode)
  if (scale.maxCm < 0.15) return output

  // The visible threshold scales to the event. A 1 cm dusting stays faint
  // but visible in the best collectors; a 30 cm storm retains absolute bands.
  const shallowEdgeCm = scale.minimumCm
  const usefulEdgeCm = scale.usefulCm
  const scoreEdge = mode === 'recent' ? 0.12 : 0.14
  const strongScore = mode === 'recent' ? 0.36 : 0.4
  const collectorEdge = mode === 'recent' ? 0.16 : 0.2
  const minimumMask = scale.maxCm < 3 ? 0.08 : mode === 'recent' ? 0.11 : 0.13

  for (let row = 0; row < field.height; row += 1) {
    for (let col = 0; col < field.width; col += 1) {
      const index = row * field.width + col
      const cm = cmGrid[index]
      if (cm < shallowEdgeCm) continue

      const score = scoreGrid[index]
      const skiable = analysis.skiMask[index]
      const slope = analysis.slopeDeg[index]
      const gully = analysis.gullyFactor[index]
      const ridge = analysis.ridgeExposure[index]
      const localScore = score - neighborhoodMean(scoreGrid, field.width, field.height, col, row, 5)
      const localDepth = cm - neighborhoodMean(cmGrid, field.width, field.height, col, row, 6)

      const depthMask = smoothstep(shallowEdgeCm, usefulEdgeCm, cm)
      const scoreMask = smoothstep(scoreEdge, strongScore, score)
      const skiMask = smoothstep(0.52, 0.84, skiable)
      const slopeMask = smoothstep(10, 18, slope) * (1 - smoothstep(44, 58, slope))
      const collectorMask = smoothstep(collectorEdge, 0.72, 0.42 * gully + 0.42 * score + 0.16 * localScore - 0.22 * ridge)
      const pocketMask =
        0.45 * smoothstep(-0.015, 0.07, localScore) +
        0.35 * smoothstep(-0.7, 2.7, localDepth) +
        0.2 * gully
      const combinedMask =
        depthMask * scoreMask * skiMask * slopeMask * collectorMask * clamp01(0.35 + 0.65 * pocketMask)

      if (combinedMask >= minimumMask) {
        output[index] = cm
      }
    }
  }

  return boxBlur(output, field.width, field.height, 1)
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
  mode: PowderMode = 'recent',
): { reason: string; dominantFactor: string } {
  const effectiveWeather = mode === 'forecast' ? forecastWeather(weather) : weather
  const factors = cellFactors(index, terrain, analysis, effectiveWeather)
  const windFrom = compassLabel(effectiveWeather.mainWindDirectionDeg)
  const facing = compassLabel(analysis.aspectDeg[index])

  const rainAffected =
    effectiveWeather.freezingLevelM !== undefined &&
    terrain.heights[index] < effectiveWeather.freezingLevelM + 100

  const candidates: Array<[number, string, string]> = [
    [
      factors.shelterFactor * 1.05,
      'ridge shelter',
      `Deposits in the wind shadow just behind the crest upwind (${windFrom} wind).`,
    ],
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
    [
      rainAffected ? 0.6 : 0,
      'rain line',
      `Near or below the freezing level (~${Math.round(effectiveWeather.freezingLevelM ?? 0)} m) — likely wet or rain-affected.`,
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

export type PowderDisplayScale = {
  maxCm: number
  minimumCm: number
  usefulCm: number
  contours: number[]
}

export function powderDisplayScale(field: PowderField, mode: PowderMode): PowderDisplayScale {
  const maxCm = fieldMaxCm(field, mode)
  if (maxCm < 0.15) return { maxCm, minimumCm: Infinity, usefulCm: Infinity, contours: [] }

  const minimumCm = Math.max(0.15, Math.min(5, maxCm * 0.22))
  const usefulCm = Math.max(minimumCm + 0.08, Math.min(14, maxCm * 0.72))
  const candidates = [0.5, 1, 2, 5, 10, 20, 30, 40]
  const contours = candidates.filter((value) => value >= minimumCm && value <= maxCm * 0.96)
  if (contours.length === 0) contours.push(Number(Math.max(0.15, maxCm * 0.55).toFixed(2)))
  return { maxCm, minimumCm, usefulCm, contours }
}

export const POWDER_THRESHOLDS_CM = [0.5, 1, 2, 5, 10, 20, 30, 40]

export function powderColorForCm(cm: number) {
  if (cm >= 40) return '#075f3f'
  if (cm >= 30) return '#08784b'
  if (cm >= 20) return '#0c9659'
  if (cm >= 10) return '#22b66d'
  if (cm >= 5) return '#58cf8e'
  if (cm >= 2) return '#88dfac'
  if (cm >= 0.5) return '#b8eccb'
  if (cm >= 0.15) return '#9fe4b8'
  return '#dff7e7'
}
