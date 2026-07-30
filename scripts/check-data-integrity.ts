import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type JsonRecord = Record<string, unknown>

const DATA_DIR = join(process.cwd(), 'public', 'data')
const MAX_DATA_AGE_MS = 45 * 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000
const MAX_REPORTED_ERRORS = 100

const errors: string[] = []
let suppressedErrors = 0

function report(path: string, message: string) {
  if (errors.length < MAX_REPORTED_ERRORS) errors.push(`${path}: ${message}`)
  else suppressedErrors += 1
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, path: string): JsonRecord | null {
  if (!isRecord(value)) {
    report(path, 'expected an object')
    return null
  }
  return value
}

function array(value: unknown, path: string, requireItems = false): unknown[] | null {
  if (!Array.isArray(value)) {
    report(path, 'expected an array')
    return null
  }
  if (requireItems && value.length === 0) report(path, 'must not be empty')
  return value
}

function finiteNumber(
  value: unknown,
  path: string,
  limits: { min?: number; max?: number; integer?: boolean } = {},
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    report(path, 'expected a finite number')
    return null
  }
  if (limits.integer && !Number.isInteger(value)) report(path, `expected an integer, received ${value}`)
  if (limits.min !== undefined && value < limits.min) {
    report(path, `must be at least ${limits.min}, received ${value}`)
  }
  if (limits.max !== undefined && value > limits.max) {
    report(path, `must be at most ${limits.max}, received ${value}`)
  }
  return value
}

function nonEmptyString(value: unknown, path: string): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    report(path, 'expected a non-empty string')
    return null
  }
  return value
}

function timestamp(value: unknown, path: string): number | null {
  const text = nonEmptyString(value, path)
  if (text === null) return null
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) {
    report(path, `expected a parseable timestamp, received ${JSON.stringify(text)}`)
    return null
  }
  return parsed
}

async function readJson(filename: string): Promise<unknown> {
  const path = join(DATA_DIR, filename)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : 'could not read or parse JSON'}`,
    )
  }
}

function validateTerrain(value: unknown) {
  const terrain = record(value, 'terrain')
  if (!terrain) return null

  const width = finiteNumber(terrain.width, 'terrain.width', { min: 2, max: 5000, integer: true })
  const height = finiteNumber(terrain.height, 'terrain.height', { min: 2, max: 5000, integer: true })
  const minElevation = finiteNumber(terrain.minElevation, 'terrain.minElevation', {
    min: 250,
    max: 2600,
  })
  const maxElevation = finiteNumber(terrain.maxElevation, 'terrain.maxElevation', {
    min: 250,
    max: 2600,
  })
  if (minElevation !== null && maxElevation !== null && minElevation >= maxElevation) {
    report('terrain.maxElevation', `must exceed terrain.minElevation (${minElevation})`)
  }

  const bounds = record(terrain.bounds, 'terrain.bounds')
  const west = finiteNumber(bounds?.west, 'terrain.bounds.west', { min: 170, max: 173 })
  const east = finiteNumber(bounds?.east, 'terrain.bounds.east', { min: 170, max: 173 })
  const south = finiteNumber(bounds?.south, 'terrain.bounds.south', { min: -45, max: -42 })
  const north = finiteNumber(bounds?.north, 'terrain.bounds.north', { min: -45, max: -42 })
  if (west !== null && east !== null && west >= east) {
    report('terrain.bounds.east', `must be east of terrain.bounds.west (${west})`)
  }
  if (south !== null && north !== null && south >= north) {
    report('terrain.bounds.north', `must be north of terrain.bounds.south (${south})`)
  }

  const heights = array(terrain.heights, 'terrain.heights', true)
  if (heights && width !== null && height !== null && heights.length !== width * height) {
    report(
      'terrain.heights',
      `contains ${heights.length} values; expected width × height = ${width * height}`,
    )
  }

  let actualMin = Number.POSITIVE_INFINITY
  let actualMax = Number.NEGATIVE_INFINITY
  heights?.forEach((elevation, index) => {
    const number = finiteNumber(elevation, `terrain.heights[${index}]`, { min: 250, max: 2600 })
    if (number !== null) {
      actualMin = Math.min(actualMin, number)
      actualMax = Math.max(actualMax, number)
    }
  })
  if (minElevation !== null && Number.isFinite(actualMin) && Math.abs(minElevation - actualMin) > 0.2) {
    report(
      'terrain.minElevation',
      `metadata ${minElevation} does not match the height grid minimum ${actualMin}`,
    )
  }
  if (maxElevation !== null && Number.isFinite(actualMax) && Math.abs(maxElevation - actualMax) > 0.2) {
    report(
      'terrain.maxElevation',
      `metadata ${maxElevation} does not match the height grid maximum ${actualMax}`,
    )
  }

  return west !== null && east !== null && south !== null && north !== null
    ? { west, east, south, north }
    : null
}

function validatePosition(
  value: unknown,
  path: string,
  bounds: { west: number; east: number; south: number; north: number } | null,
) {
  if (!Array.isArray(value) || value.length < 2) {
    report(path, 'expected a [longitude, latitude] coordinate')
    return
  }
  const longitude = finiteNumber(value[0], `${path}[0]`, { min: 170, max: 173 })
  const latitude = finiteNumber(value[1], `${path}[1]`, { min: -45, max: -42 })
  if (bounds && longitude !== null && (longitude < bounds.west - 0.02 || longitude > bounds.east + 0.02)) {
    report(`${path}[0]`, `longitude ${longitude} lies implausibly far outside the terrain bounds`)
  }
  if (bounds && latitude !== null && (latitude < bounds.south - 0.02 || latitude > bounds.north + 0.02)) {
    report(`${path}[1]`, `latitude ${latitude} lies implausibly far outside the terrain bounds`)
  }
}

function validateTrails(
  value: unknown,
  bounds: { west: number; east: number; south: number; north: number } | null,
) {
  const collection = record(value, 'trails')
  if (!collection) return
  if (collection.type !== 'FeatureCollection') {
    report('trails.type', `expected "FeatureCollection", received ${JSON.stringify(collection.type)}`)
  }
  const features = array(collection.features, 'trails.features', true)
  const allowedKinds = new Set(['run', 'lift', 'boundary', 'base', 'summit'])

  features?.forEach((featureValue, featureIndex) => {
    const path = `trails.features[${featureIndex}]`
    const feature = record(featureValue, path)
    if (!feature) return
    if (feature.type !== 'Feature') report(`${path}.type`, 'expected "Feature"')

    const properties = record(feature.properties, `${path}.properties`)
    nonEmptyString(properties?.name, `${path}.properties.name`)
    if (!allowedKinds.has(String(properties?.kind))) {
      report(`${path}.properties.kind`, `unsupported trail kind ${JSON.stringify(properties?.kind)}`)
    }

    const geometry = record(feature.geometry, `${path}.geometry`)
    if (!geometry) return
    const coordinates = geometry.coordinates
    if (geometry.type === 'Point') {
      validatePosition(coordinates, `${path}.geometry.coordinates`, bounds)
      return
    }
    if (geometry.type === 'LineString') {
      const line = array(coordinates, `${path}.geometry.coordinates`)
      if (line && line.length < 2) report(`${path}.geometry.coordinates`, 'LineString needs at least 2 positions')
      line?.forEach((position, index) =>
        validatePosition(position, `${path}.geometry.coordinates[${index}]`, bounds),
      )
      return
    }
    if (geometry.type === 'Polygon') {
      const rings = array(coordinates, `${path}.geometry.coordinates`, true)
      rings?.forEach((ringValue, ringIndex) => {
        const ringPath = `${path}.geometry.coordinates[${ringIndex}]`
        const ring = array(ringValue, ringPath)
        if (ring && ring.length < 4) report(ringPath, 'Polygon ring needs at least 4 positions')
        ring?.forEach((position, positionIndex) =>
          validatePosition(position, `${ringPath}[${positionIndex}]`, bounds),
        )
      })
      return
    }
    report(`${path}.geometry.type`, `unsupported geometry type ${JSON.stringify(geometry.type)}`)
  })
}

function validateDirection(value: unknown, path: string) {
  return finiteNumber(value, path, { min: 0, max: 359.999 })
}

function validatePercent(value: unknown, path: string) {
  return finiteNumber(value, path, { min: 0, max: 100 })
}

function validateChronological(items: JsonRecord[], field: string, path: string) {
  let previous: number | null = null
  items.forEach((item, index) => {
    const current = timestamp(item[field], `${path}[${index}].${field}`)
    if (current !== null && previous !== null && current <= previous) {
      report(`${path}[${index}].${field}`, `must be later than ${path}[${index - 1}].${field}`)
    }
    if (current !== null) previous = current
  })
}

function validateWeatherHours(value: unknown, path: 'latest.observations' | 'latest.forecast') {
  const values = array(value, path, true)
  const hours: JsonRecord[] = []
  values?.forEach((hourValue, index) => {
    const hourPath = `${path}[${index}]`
    const hour = record(hourValue, hourPath)
    if (!hour) return
    hours.push(hour)
    finiteNumber(hour.temperatureC, `${hourPath}.temperatureC`)
    finiteNumber(hour.snowfallCm, `${hourPath}.snowfallCm`, { min: 0 })
    finiteNumber(hour.windKph, `${hourPath}.windKph`, { min: 0 })
    validateDirection(hour.windDirectionDeg, `${hourPath}.windDirectionDeg`)
    if (hour.freezingLevelM !== undefined) finiteNumber(hour.freezingLevelM, `${hourPath}.freezingLevelM`, { min: 0 })
    if (hour.gustKph !== undefined) finiteNumber(hour.gustKph, `${hourPath}.gustKph`, { min: 0 })
    if (hour.rainMm !== undefined) finiteNumber(hour.rainMm, `${hourPath}.rainMm`, { min: 0 })
    if (hour.precipitationMm !== undefined) finiteNumber(hour.precipitationMm, `${hourPath}.precipitationMm`, { min: 0 })
    if (hour.cloudPct !== undefined) validatePercent(hour.cloudPct, `${hourPath}.cloudPct`)
  })
  validateChronological(hours, 'time', path)
  return hours
}

function validateDaily(value: unknown) {
  const values = array(value, 'latest.daily', true)
  const days: JsonRecord[] = []
  values?.forEach((dayValue, index) => {
    const path = `latest.daily[${index}]`
    const day = record(dayValue, path)
    if (!day) return
    days.push(day)
    finiteNumber(day.snowfallCm, `${path}.snowfallCm`, { min: 0 })
    finiteNumber(day.precipMm, `${path}.precipMm`, { min: 0 })
    finiteNumber(day.rainMm, `${path}.rainMm`, { min: 0 })
    const min = finiteNumber(day.tempMinC, `${path}.tempMinC`)
    const max = finiteNumber(day.tempMaxC, `${path}.tempMaxC`)
    if (min !== null && max !== null && min > max) {
      report(`${path}.tempMaxC`, `must be at least tempMinC (${min}), received ${max}`)
    }
    finiteNumber(day.windMeanKph, `${path}.windMeanKph`, { min: 0 })
    finiteNumber(day.gustMaxKph, `${path}.gustMaxKph`, { min: 0 })
    validateDirection(day.windDirectionDeg, `${path}.windDirectionDeg`)
    validatePercent(day.cloudPct, `${path}.cloudPct`)
    finiteNumber(day.freezingLevelM, `${path}.freezingLevelM`, { min: 0 })
    finiteNumber(day.weatherCode, `${path}.weatherCode`, { min: 0, integer: true })
  })
  validateChronological(days, 'date', 'latest.daily')
}

function validateEnsemble(value: unknown) {
  if (value === undefined) return
  const ensemble = record(value, 'latest.ensemble')
  if (!ensemble) return

  timestamp(ensemble.generatedAt, 'latest.ensemble.generatedAt')
  const windowStart = timestamp(ensemble.windowStartAt, 'latest.ensemble.windowStartAt')
  const windowEnd = timestamp(ensemble.windowEndAt, 'latest.ensemble.windowEndAt')
  if (windowStart !== null && windowEnd !== null && windowStart >= windowEnd) {
    report('latest.ensemble.windowEndAt', 'must be later than latest.ensemble.windowStartAt')
  }
  finiteNumber(ensemble.windowHours, 'latest.ensemble.windowHours', { min: 2, integer: true })
  finiteNumber(ensemble.memberCount, 'latest.ensemble.memberCount', { min: 2, integer: true })

  const snowfall = record(ensemble.snowfallCm, 'latest.ensemble.snowfallCm')
  const p10 = finiteNumber(snowfall?.p10, 'latest.ensemble.snowfallCm.p10', { min: 0 })
  const p50 = finiteNumber(snowfall?.p50, 'latest.ensemble.snowfallCm.p50', { min: 0 })
  const p90 = finiteNumber(snowfall?.p90, 'latest.ensemble.snowfallCm.p90', { min: 0 })
  finiteNumber(snowfall?.mean, 'latest.ensemble.snowfallCm.mean', { min: 0 })
  if (p10 !== null && p50 !== null && p10 > p50) {
    report('latest.ensemble.snowfallCm.p50', `must be at least p10 (${p10}), received ${p50}`)
  }
  if (p50 !== null && p90 !== null && p50 > p90) {
    report('latest.ensemble.snowfallCm.p90', `must be at least p50 (${p50}), received ${p90}`)
  }

  const probability = record(ensemble.probabilityPct, 'latest.ensemble.probabilityPct')
  const atLeast1 = validatePercent(probability?.atLeast1Cm, 'latest.ensemble.probabilityPct.atLeast1Cm')
  const atLeast5 = validatePercent(probability?.atLeast5Cm, 'latest.ensemble.probabilityPct.atLeast5Cm')
  const atLeast10 = validatePercent(probability?.atLeast10Cm, 'latest.ensemble.probabilityPct.atLeast10Cm')
  if (atLeast1 !== null && atLeast5 !== null && atLeast1 < atLeast5) {
    report('latest.ensemble.probabilityPct.atLeast5Cm', `cannot exceed atLeast1Cm (${atLeast1})`)
  }
  if (atLeast5 !== null && atLeast10 !== null && atLeast5 < atLeast10) {
    report('latest.ensemble.probabilityPct.atLeast10Cm', `cannot exceed atLeast5Cm (${atLeast5})`)
  }
}

function validateLatest(value: unknown) {
  const latest = record(value, 'latest')
  if (!latest) return

  const generatedAt = timestamp(latest.generatedAt, 'latest.generatedAt')
  if (generatedAt !== null) {
    const age = Date.now() - generatedAt
    if (age > MAX_DATA_AGE_MS) {
      report('latest.generatedAt', `is ${(age / 86_400_000).toFixed(1)} days old; maximum is 45 days`)
    }
    if (age < -MAX_FUTURE_SKEW_MS) {
      report('latest.generatedAt', 'is more than 24 hours in the future')
    }
  }

  const summary = record(latest.summary, 'latest.summary')
  if (summary) {
    finiteNumber(summary.recentSnowCm, 'latest.summary.recentSnowCm', { min: 0 })
    finiteNumber(summary.forecastSnowCm, 'latest.summary.forecastSnowCm', { min: 0 })
    validateDirection(summary.mainWindDirectionDeg, 'latest.summary.mainWindDirectionDeg')
    finiteNumber(summary.avgWindKph, 'latest.summary.avgWindKph', { min: 0 })
    const min = finiteNumber(summary.temperatureMinC, 'latest.summary.temperatureMinC')
    const max = finiteNumber(summary.temperatureMaxC, 'latest.summary.temperatureMaxC')
    if (min !== null && max !== null && min > max) {
      report('latest.summary.temperatureMaxC', `must be at least temperatureMinC (${min}), received ${max}`)
    }
    if (!['low', 'medium', 'high'].includes(String(summary.confidence))) {
      report('latest.summary.confidence', `expected low, medium, or high; received ${JSON.stringify(summary.confidence)}`)
    }
    if (summary.recentTerrainSignal !== undefined) {
      const signal = record(summary.recentTerrainSignal, 'latest.summary.recentTerrainSignal')
      if (signal) {
        if (signal.basis !== 'modelled-last-72-hours') {
          report(
            'latest.summary.recentTerrainSignal.basis',
            `expected "modelled-last-72-hours", received ${JSON.stringify(signal.basis)}`,
          )
        }
        if (!['unknown', 'none', 'trace', 'moderate', 'strong'].includes(String(signal.strength))) {
          report(
            'latest.summary.recentTerrainSignal.strength',
            `unsupported strength ${JSON.stringify(signal.strength)}`,
          )
        }
        if (!['low', 'medium', 'high'].includes(String(signal.dataQuality))) {
          report(
            'latest.summary.recentTerrainSignal.dataQuality',
            `unsupported data quality ${JSON.stringify(signal.dataQuality)}`,
          )
        }
        finiteNumber(signal.coverageHours, 'latest.summary.recentTerrainSignal.coverageHours', {
          min: 0,
          max: 72,
          integer: true,
        })
        finiteNumber(signal.expectedHours, 'latest.summary.recentTerrainSignal.expectedHours', {
          min: 72,
          max: 72,
          integer: true,
        })
        if (signal.dataAgeHours !== null) {
          finiteNumber(signal.dataAgeHours, 'latest.summary.recentTerrainSignal.dataAgeHours', {
            min: 0,
          })
        }
        nonEmptyString(signal.reason, 'latest.summary.recentTerrainSignal.reason')
      }
    }
    nonEmptyString(summary.headline, 'latest.summary.headline')
    const reasons = array(summary.reasons, 'latest.summary.reasons', true)
    reasons?.forEach((reason, index) => nonEmptyString(reason, `latest.summary.reasons[${index}]`))

    const nonnegativeFields = [
      'maxGustKph',
      'currentWindKph',
      'currentGustKph',
      'forecastAvgWindKph',
      'forecastMaxGustKph',
      'recentFreezingLevelM',
      'forecastFreezingLevelM',
      'forecastRainMm',
      'forecastHoursAboveZero',
      'freezingLevelM',
      'meltFreezeCycles',
      'recentRainMm',
      'hoursAboveZero',
      'hoursSinceSnow',
      'stormPeakSnowCm',
    ]
    for (const field of nonnegativeFields) {
      if (summary[field] !== undefined) finiteNumber(summary[field], `latest.summary.${field}`, { min: 0 })
    }
    for (const field of ['currentWindDirectionDeg', 'forecastWindDirectionDeg']) {
      if (summary[field] !== undefined) validateDirection(summary[field], `latest.summary.${field}`)
    }
    for (const field of ['cloudLowPct', 'cloudMidPct', 'cloudHighPct', 'cloudMeanPct']) {
      if (summary[field] !== undefined) validatePercent(summary[field], `latest.summary.${field}`)
    }
    for (const field of ['currentTemperatureC', 'forecastTemperatureMinC', 'forecastTemperatureMaxC']) {
      if (summary[field] !== undefined) finiteNumber(summary[field], `latest.summary.${field}`)
    }
    if (summary.windDirectionSpreadDeg !== undefined) {
      finiteNumber(summary.windDirectionSpreadDeg, 'latest.summary.windDirectionSpreadDeg', { min: 0, max: 180 })
    }
    const stormStart = summary.stormStartAt === undefined ? null : timestamp(summary.stormStartAt, 'latest.summary.stormStartAt')
    const stormEnd = summary.stormEndAt === undefined ? null : timestamp(summary.stormEndAt, 'latest.summary.stormEndAt')
    if ((summary.stormStartAt === undefined) !== (summary.stormEndAt === undefined)) {
      report('latest.summary', 'stormStartAt and stormEndAt must either both be present or both be absent')
    }
    if (stormStart !== null && stormEnd !== null && stormStart > stormEnd) {
      report('latest.summary.stormEndAt', 'must not be earlier than latest.summary.stormStartAt')
    }
  }

  const observations = validateWeatherHours(latest.observations, 'latest.observations')
  const forecast = validateWeatherHours(latest.forecast, 'latest.forecast')
  validateDaily(latest.daily)
  validateEnsemble(latest.ensemble)

  const lastObservation = observations.at(-1)
  const firstForecast = forecast[0]
  if (lastObservation && firstForecast) {
    const observationTime = Date.parse(String(lastObservation.time))
    const forecastTime = Date.parse(String(firstForecast.time))
    if (Number.isFinite(observationTime) && Number.isFinite(forecastTime) && forecastTime <= observationTime) {
      report('latest.forecast[0].time', 'must be later than the final observation timestamp')
    }
  }
}

async function main() {
  const [terrain, trails, latest] = await Promise.all([
    readJson('terrain.json'),
    readJson('trails.geojson'),
    readJson('latest.json'),
  ])

  const bounds = validateTerrain(terrain)
  validateTrails(trails, bounds)
  validateLatest(latest)

  if (errors.length > 0 || suppressedErrors > 0) {
    console.error(`Production data integrity failed with ${errors.length + suppressedErrors} issue(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    if (suppressedErrors > 0) console.error(`  - …and ${suppressedErrors} more issue(s)`)
    process.exitCode = 1
    return
  }

  console.log('Production data integrity passed')
  console.log('  terrain.json: dimensions, bounds, elevations, and height grid valid')
  console.log('  trails.geojson: feature collection and coordinates valid')
  console.log('  latest.json: freshness, weather series, daily forecast, and optional ensemble valid')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
