import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildPowderDisplayField,
  buildPowderField,
  fieldMaxCm,
  type PowderField,
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

const northwest = forecastField({ forecastSnowCm: 12, forecastWindDirectionDeg: 315 })
const southeast = forecastField({ forecastSnowCm: 12, forecastWindDirectionDeg: 135 })
assert(
  meanAbsoluteDifference(northwest.forecastCm, southeast.forecastCm) > 0.08,
  'changing storm wind direction must move the terrain-loading signal',
)

console.log(
  [
    `Powder model checks passed`,
    `trace display cells: ${nonZeroCount(traceDisplay)}`,
    `dusting display cells: ${nonZeroCount(dustingDisplay)}`,
    `8 cm event max pocket: ${fieldMaxCm(moderate, 'forecast').toFixed(1)} cm`,
    `30 cm event max pocket: ${fieldMaxCm(deep, 'forecast').toFixed(1)} cm`,
    `cold/dry max: ${coldDryMax.toFixed(1)} cm`,
    `warm/wet max: ${warmWetMax.toFixed(1)} cm`,
  ].join('\n'),
)
