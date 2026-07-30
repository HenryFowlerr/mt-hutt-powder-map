import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildForecastWindSectors,
  buildPowderDisplayField,
  buildPowderField,
  fieldMaxCm,
  hourlyPhaseSnowCm,
  windDirectionalCoherence,
  type PowderField,
  type PowderPhaseHour,
  type PowderWeather,
} from '../src/lib/powderModel'
import { analyzeTerrain } from '../src/lib/terrainAnalysis'
import type { TerrainData, TrailCollection } from '../src/types'

const dataDir = join(process.cwd(), 'public', 'data')
const terrain = JSON.parse(readFileSync(join(dataDir, 'terrain.json'), 'utf8')) as TerrainData
const trails = JSON.parse(readFileSync(join(dataDir, 'trails.geojson'), 'utf8')) as TrailCollection
const analysis = analyzeTerrain(terrain, trails)

const baseWeather: PowderWeather = {
  recentSnowCm: 0,
  forecastSnowCm: 0,
  mainWindDirectionDeg: 285,
  avgWindKph: 24,
  maxGustKph: 42,
  forecastWindDirectionDeg: 285,
  forecastAvgWindKph: 24,
  forecastMaxGustKph: 42,
  temperatureMinC: -7,
  temperatureMaxC: -2,
  forecastTemperatureMinC: -7,
  forecastTemperatureMaxC: -2,
  freezingLevelM: 1250,
  forecastFreezingLevelM: 1250,
  recentRainMm: 0,
  forecastRainMm: 0,
  hoursAboveZero: 0,
  forecastHoursAboveZero: 0,
  hoursSinceSnow: 2,
  meltFreezeCycles: 0,
}

function nonZeroCount(grid: Float32Array) {
  let count = 0
  for (const value of grid) {
    if (value > 0) count += 1
  }
  return count
}

function meanAbsoluteDifference(a: Float32Array, b: Float32Array) {
  let total = 0
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index])
  return total / a.length
}

function meanDifferenceFromAverage(
  candidate: Float32Array,
  a: Float32Array,
  b: Float32Array,
) {
  let total = 0
  for (let index = 0; index < candidate.length; index += 1) {
    total += Math.abs(candidate[index] - (a[index] + b[index]) / 2)
  }
  return total / candidate.length
}

function assertFiniteNonNegative(grid: Float32Array, message: string) {
  for (const value of grid) {
    assert(Number.isFinite(value) && value >= 0, message)
  }
}

function forecastField(overrides: Partial<PowderWeather>): PowderField {
  return buildPowderField(terrain, analysis, { ...baseWeather, ...overrides })
}

const zero = forecastField({ forecastSnowCm: 0 })
assert.equal(fieldMaxCm(zero, 'forecast'), 0, 'zero snow must produce a zero powder field')

const trace = forecastField({ forecastSnowCm: 0.2 })
const traceDisplay = buildPowderDisplayField(trace, analysis, 'forecast')
assert(nonZeroCount(traceDisplay) > 0, 'a trace event must remain faintly visible in the best collectors')

const dusting = forecastField({ forecastSnowCm: 1.2 })
const dustingDisplay = buildPowderDisplayField(dusting, analysis, 'forecast')
assert(fieldMaxCm(dusting, 'forecast') > 0.25, 'a 1.2 cm event must survive the physical field')
assert(nonZeroCount(dustingDisplay) > 0, 'a small meaningful event must appear on the map')

const changingPhaseHours = [
  { snowfallCm: 0.7, precipitationMm: 1, freezingLevelM: 1400 },
  { snowfallCm: 0, precipitationMm: 1, freezingLevelM: 1900 },
] as const
assert.equal(
  hourlyPhaseSnowCm(changingPhaseHours, 1600, 0.7),
  0.7,
  'hourly phase adjustment must preserve the official 1600 m total',
)
assert(
  Math.abs(hourlyPhaseSnowCm(changingPhaseHours, 2066, 0.7) - 1.4) < 1e-9,
  'summit snow must include precipitation that fell as rain at the reference point',
)
assert(
  hourlyPhaseSnowCm(changingPhaseHours, 1300, 0.7) < 0.4,
  'lower terrain must lose snow when the hourly freezing level makes the phase marginal',
)
assert.equal(
  hourlyPhaseSnowCm(
    [{ snowfallCm: 3, precipitationMm: undefined, freezingLevelM: undefined }],
    2066,
    4.2,
  ),
  4.2,
  'missing hourly phase inputs must preserve the aggregate fallback exactly',
)

const changingPhase = forecastField({
  forecastSnowCm: 0.7,
  forecastFreezingLevelM: 1650,
  forecastPhaseHours: changingPhaseHours,
})
const aggregatePhase = forecastField({
  forecastSnowCm: 0.7,
  forecastFreezingLevelM: 1650,
})
const changingPhaseDisplay = buildPowderDisplayField(changingPhase, analysis, 'forecast')
assert(
  fieldMaxCm(changingPhase, 'forecast') > fieldMaxCm(aggregatePhase, 'forecast') * 1.5,
  'hourly evolution must recover summit snow hidden by a storm-average freezing level',
)
assert(
  nonZeroCount(changingPhaseDisplay) > 0,
  'a light summit-only hourly event must remain visible on the map',
)

const moderate = forecastField({ forecastSnowCm: 8 })
const deep = forecastField({ forecastSnowCm: 30 })
assert(
  fieldMaxCm(deep, 'forecast') > fieldMaxCm(moderate, 'forecast') * 2,
  'a deeper storm must produce materially deeper pockets',
)

const coldDry = forecastField({
  forecastSnowCm: 12,
  forecastTemperatureMaxC: -3,
  forecastFreezingLevelM: 1100,
  forecastRainMm: 0,
  forecastHoursAboveZero: 0,
})
const warmWet = forecastField({
  forecastSnowCm: 12,
  forecastTemperatureMaxC: 3,
  forecastFreezingLevelM: 2050,
  forecastRainMm: 10,
  forecastHoursAboveZero: 22,
})
const coldDryMax = fieldMaxCm(coldDry, 'forecast')
const warmWetMax = fieldMaxCm(warmWet, 'forecast')
assert(
  coldDryMax > warmWetMax * 1.35,
  `warmth, rain, and a high freezing level must reduce skiable powder (${coldDryMax.toFixed(1)} vs ${warmWetMax.toFixed(1)} cm)`,
)

assert.equal(
  windDirectionalCoherence(),
  1,
  'missing wind spread must preserve the stable-direction fallback',
)
assert.equal(
  windDirectionalCoherence(0),
  1,
  'zero wind spread must preserve the stable-direction behavior exactly',
)
assert(
  Math.abs(windDirectionalCoherence(60) - 0.5779248964927293) < 1e-12,
  'wind coherence must invert the circular spread calculation used by fetch-weather',
)

const northwest = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 315,
})
const northwestZeroSpread = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 0,
})
assert.deepEqual(
  northwestZeroSpread.forecastCm,
  northwest.forecastCm,
  'zero spread must preserve forecast centimetres exactly',
)
assert.deepEqual(
  northwestZeroSpread.forecastScore,
  northwest.forecastScore,
  'zero spread must preserve forecast scores exactly',
)

const southeast = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 135,
})
assert(
  meanAbsoluteDifference(northwest.forecastCm, southeast.forecastCm) > 0.08,
  'changing storm wind direction must move the terrain-loading signal',
)
const northwestModerateSpread = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 60,
})
const southeastModerateSpread = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 135,
  forecastWindDirectionSpreadDeg: 60,
})
const northwestWideSpread = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 112,
})
const southeastWideSpread = forecastField({
  forecastSnowCm: 12,
  forecastWindDirectionDeg: 135,
  forecastWindDirectionSpreadDeg: 112,
})
const stableDirectionDifference = meanAbsoluteDifference(
  northwest.forecastCm,
  southeast.forecastCm,
)
const moderateDirectionDifference = meanAbsoluteDifference(
  northwestModerateSpread.forecastCm,
  southeastModerateSpread.forecastCm,
)
const wideDirectionDifference = meanAbsoluteDifference(
  northwestWideSpread.forecastCm,
  southeastWideSpread.forecastCm,
)
assert(
  stableDirectionDifference > moderateDirectionDifference &&
    moderateDirectionDifference > wideDirectionDifference,
  'directional terrain contrast must decrease monotonically as wind spread increases',
)
assertFiniteNonNegative(
  northwestWideSpread.forecastCm,
  'wide-spread forecast centimetres must remain finite and non-negative',
)
assertFiniteNonNegative(
  northwestWideSpread.forecastScore,
  'wide-spread forecast scores must remain finite and non-negative',
)

const shiftingTrace = forecastField({
  forecastSnowCm: 0.2,
  forecastWindDirectionSpreadDeg: 112,
})
const shiftingTraceDisplay = buildPowderDisplayField(
  shiftingTrace,
  analysis,
  'forecast',
)
assert(
  nonZeroCount(shiftingTraceDisplay) > 0,
  'a light event must remain visible even when wind direction shifts widely',
)

function windHours(directions: readonly number[]): PowderPhaseHour[] {
  return directions.map((windDirectionDeg) => ({
    snowfallCm: 0.7,
    precipitationMm: 1,
    freezingLevelM: 1250,
    windDirectionDeg,
  }))
}

const stableWindHours = windHours(Array.from({ length: 12 }, () => 315))
const stableSectors = buildForecastWindSectors(
  stableWindHours,
  terrain.maxElevation,
)
assert.equal(
  stableSectors?.length,
  1,
  'a stable hourly wind series must reduce to one active sector',
)
assert(
  Math.abs((stableSectors?.[0].directionDeg ?? 0) - 315) < 1e-9,
  'a sector must retain its precipitation-weighted mean direction',
)
const stableSectorField = forecastField({
  forecastSnowCm: 8.4,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 112,
  forecastPhaseHours: stableWindHours,
})
const stableFallbackField = forecastField({
  forecastSnowCm: 8.4,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 0,
})
const stableSectorDifference = meanAbsoluteDifference(
  stableSectorField.forecastCm,
  stableFallbackField.forecastCm,
)
assert(
  stableSectorDifference < 0.001,
  `one active sector must preserve the stable single-direction field (${stableSectorDifference.toFixed(6)} cm difference)`,
)

const opposingWindHours = windHours([
  315, 135, 315, 135, 315, 135, 315, 135, 315, 135, 315, 135,
])
const opposingSectors = buildForecastWindSectors(
  opposingWindHours,
  terrain.maxElevation,
)
assert.equal(
  opposingSectors?.length,
  2,
  'opposing precipitation-bearing winds must retain two active sectors',
)
const opposingField = forecastField({
  forecastSnowCm: 8.4,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 112,
  forecastPhaseHours: opposingWindHours,
})
const southeastStableField = forecastField({
  forecastSnowCm: 8.4,
  forecastWindDirectionDeg: 135,
  forecastWindDirectionSpreadDeg: 0,
})
const opposingFallbackField = forecastField({
  forecastSnowCm: 8.4,
  forecastWindDirectionDeg: 315,
  forecastWindDirectionSpreadDeg: 112,
})
const sectorDistanceFromExpectedBlend = meanDifferenceFromAverage(
  opposingField.forecastCm,
  stableFallbackField.forecastCm,
  southeastStableField.forecastCm,
)
const fallbackDistanceFromExpectedBlend = meanDifferenceFromAverage(
  opposingFallbackField.forecastCm,
  stableFallbackField.forecastCm,
  southeastStableField.forecastCm,
)
assert(
  sectorDistanceFromExpectedBlend < fallbackDistanceFromExpectedBlend,
  'opposing sectors must represent the two directional fields better than a damped mean direction',
)
assertFiniteNonNegative(
  opposingField.forecastCm,
  'multi-sector forecast centimetres must remain finite and non-negative',
)
assertFiniteNonNegative(
  opposingField.forecastScore,
  'multi-sector forecast scores must remain finite and non-negative',
)

const opposingTraceHours: PowderPhaseHour[] = [
  {
    snowfallCm: 0.1,
    precipitationMm: 0.1 / 0.7,
    freezingLevelM: 1250,
    windDirectionDeg: 315,
  },
  {
    snowfallCm: 0.1,
    precipitationMm: 0.1 / 0.7,
    freezingLevelM: 1250,
    windDirectionDeg: 135,
  },
]
const opposingTraceField = forecastField({
  forecastSnowCm: 0.2,
  forecastPhaseHours: opposingTraceHours,
})
const opposingTraceDisplay = buildPowderDisplayField(
  opposingTraceField,
  analysis,
  'forecast',
)
assert(
  nonZeroCount(opposingTraceDisplay) > 0,
  'a light bimodal-wind event must remain visible',
)

const eightSectorHours = windHours(
  Array.from({ length: 8 }, (_, index) => index * 45),
)
assert.equal(
  buildForecastWindSectors(eightSectorHours, terrain.maxElevation)?.length,
  8,
  'hourly winds must be capped at eight active sectors',
)
const coldTerrain = { ...terrain }
const coldBuildStartedAt = performance.now()
const coldEightSectorField = buildPowderField(coldTerrain, analysis, {
  ...baseWeather,
  forecastSnowCm: 5.6,
  forecastPhaseHours: eightSectorHours,
})
const coldEightSectorBuildMs = performance.now() - coldBuildStartedAt
assert(
  coldEightSectorBuildMs < 2500,
  `cold-cache eight-sector field must build within 2500 ms (received ${coldEightSectorBuildMs.toFixed(0)} ms)`,
)
assertFiniteNonNegative(
  coldEightSectorField.forecastCm,
  'cold-cache eight-sector output must remain finite and non-negative',
)

console.log(
  [
    `Powder model checks passed`,
    `trace display cells: ${nonZeroCount(traceDisplay)}`,
    `dusting display cells: ${nonZeroCount(dustingDisplay)}`,
    `changing-phase max pocket: ${fieldMaxCm(changingPhase, 'forecast').toFixed(1)} cm`,
    `aggregate-phase max pocket: ${fieldMaxCm(aggregatePhase, 'forecast').toFixed(1)} cm`,
    `8 cm event max pocket: ${fieldMaxCm(moderate, 'forecast').toFixed(1)} cm`,
    `30 cm event max pocket: ${fieldMaxCm(deep, 'forecast').toFixed(1)} cm`,
    `cold/dry max: ${coldDryMax.toFixed(1)} cm`,
    `warm/wet max: ${warmWetMax.toFixed(1)} cm`,
    `direction contrast stable/moderate/wide: ${stableDirectionDifference.toFixed(2)} / ${moderateDirectionDifference.toFixed(2)} / ${wideDirectionDifference.toFixed(2)} cm`,
    `opposing-sector blend error vs fallback: ${sectorDistanceFromExpectedBlend.toFixed(2)} / ${fallbackDistanceFromExpectedBlend.toFixed(2)} cm`,
    `cold-cache eight-sector build: ${coldEightSectorBuildMs.toFixed(0)} ms`,
  ].join('\n'),
)
