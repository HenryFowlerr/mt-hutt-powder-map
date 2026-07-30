import type { LatestData, TerrainData, TrailCollection } from '../types'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(source: string, path: string, message: string): never {
  throw new Error(`${source} is invalid at ${path}: ${message}`)
}

function record(value: unknown, source: string, path: string) {
  if (!isRecord(value)) fail(source, path, 'expected an object')
  return value
}

function array(value: unknown, source: string, path: string) {
  if (!Array.isArray(value)) fail(source, path, 'expected an array')
  return value
}

function finite(value: unknown, source: string, path: string, minimum?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(source, path, 'expected a finite number')
  }
  if (minimum !== undefined && value < minimum) {
    fail(source, path, `expected a value of at least ${minimum}`)
  }
  return value
}

function text(value: unknown, source: string, path: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, path, 'expected a non-empty string')
  }
  return value
}

function time(value: unknown, source: string, path: string) {
  const timestamp = text(value, source, path)
  if (!Number.isFinite(Date.parse(timestamp))) fail(source, path, 'expected a parseable timestamp')
}

function optionalFiniteFields(value: JsonRecord, source: string, path: string, fields: string[]) {
  for (const field of fields) {
    if (value[field] !== undefined) finite(value[field], source, `${path}.${field}`)
  }
}

function coordinate(
  value: unknown,
  source: string,
  path: string,
) {
  const position = array(value, source, path)
  if (position.length < 2) fail(source, path, 'expected a longitude and latitude pair')
  finite(position[0], source, `${path}[0]`)
  finite(position[1], source, `${path}[1]`)
}

function weatherHours(value: unknown, source: string, path: string) {
  const hours = array(value, source, path)
  if (hours.length === 0) fail(source, path, 'expected at least one hourly value')
  hours.forEach((hourValue, index) => {
    const hourPath = `${path}[${index}]`
    const hour = record(hourValue, source, hourPath)
    time(hour.time, source, `${hourPath}.time`)
    finite(hour.temperatureC, source, `${hourPath}.temperatureC`)
    finite(hour.snowfallCm, source, `${hourPath}.snowfallCm`, 0)
    finite(hour.windKph, source, `${hourPath}.windKph`, 0)
    finite(hour.windDirectionDeg, source, `${hourPath}.windDirectionDeg`, 0)
    optionalFiniteFields(hour, source, hourPath, [
      'freezingLevelM',
      'gustKph',
      'rainMm',
      'precipitationMm',
      'cloudPct',
    ])
  })
}

function dailyForecast(value: unknown, source: string) {
  if (value === undefined) return
  const days = array(value, source, 'daily')
  if (days.length === 0) fail(source, 'daily', 'expected at least one daily forecast')
  days.forEach((dayValue, index) => {
    const path = `daily[${index}]`
    const day = record(dayValue, source, path)
    time(day.date, source, `${path}.date`)
    for (const field of [
      'snowfallCm',
      'precipMm',
      'rainMm',
      'tempMinC',
      'tempMaxC',
      'windMeanKph',
      'gustMaxKph',
      'windDirectionDeg',
      'cloudPct',
      'freezingLevelM',
      'weatherCode',
    ]) {
      finite(day[field], source, `${path}.${field}`)
    }
  })
}

function ensembleSummary(value: unknown, source: string) {
  if (value === undefined) return
  const ensemble = record(value, source, 'ensemble')
  time(ensemble.generatedAt, source, 'ensemble.generatedAt')
  time(ensemble.windowStartAt, source, 'ensemble.windowStartAt')
  time(ensemble.windowEndAt, source, 'ensemble.windowEndAt')
  finite(ensemble.windowHours, source, 'ensemble.windowHours', 1)
  finite(ensemble.memberCount, source, 'ensemble.memberCount', 1)

  const snowfall = record(ensemble.snowfallCm, source, 'ensemble.snowfallCm')
  for (const field of ['p10', 'p50', 'p90', 'mean']) {
    finite(snowfall[field], source, `ensemble.snowfallCm.${field}`, 0)
  }
  const probability = record(ensemble.probabilityPct, source, 'ensemble.probabilityPct')
  for (const field of ['atLeast1Cm', 'atLeast5Cm', 'atLeast10Cm']) {
    finite(probability[field], source, `ensemble.probabilityPct.${field}`, 0)
  }
}

function recentTerrainSignal(value: unknown, source: string) {
  if (value === undefined) return
  const signal = record(value, source, 'summary.recentTerrainSignal')
  if (signal.basis !== 'modelled-last-72-hours') {
    fail(source, 'summary.recentTerrainSignal.basis', 'expected "modelled-last-72-hours"')
  }
  if (!['unknown', 'none', 'trace', 'moderate', 'strong'].includes(String(signal.strength))) {
    fail(source, 'summary.recentTerrainSignal.strength', 'unsupported signal strength')
  }
  if (!['low', 'medium', 'high'].includes(String(signal.dataQuality))) {
    fail(source, 'summary.recentTerrainSignal.dataQuality', 'unsupported data quality')
  }
  const coverageHours = finite(
    signal.coverageHours,
    source,
    'summary.recentTerrainSignal.coverageHours',
    0,
  )
  if (!Number.isInteger(coverageHours) || coverageHours > 72) {
    fail(source, 'summary.recentTerrainSignal.coverageHours', 'expected an integer from 0 to 72')
  }
  if (signal.expectedHours !== 72) {
    fail(source, 'summary.recentTerrainSignal.expectedHours', 'expected 72')
  }
  if (signal.dataAgeHours !== null) {
    finite(signal.dataAgeHours, source, 'summary.recentTerrainSignal.dataAgeHours', 0)
  }
  text(signal.reason, source, 'summary.recentTerrainSignal.reason')
}

export function validateTerrainPayload(value: unknown, path: string): TerrainData {
  const source = `Terrain data (${path})`
  const terrain = record(value, source, 'root')
  const width = finite(terrain.width, source, 'width', 2)
  const height = finite(terrain.height, source, 'height', 2)
  if (!Number.isInteger(width)) fail(source, 'width', 'expected an integer')
  if (!Number.isInteger(height)) fail(source, 'height', 'expected an integer')

  const bounds = record(terrain.bounds, source, 'bounds')
  const west = finite(bounds.west, source, 'bounds.west')
  const east = finite(bounds.east, source, 'bounds.east')
  const south = finite(bounds.south, source, 'bounds.south')
  const north = finite(bounds.north, source, 'bounds.north')
  if (west >= east) fail(source, 'bounds', 'west must be less than east')
  if (south >= north) fail(source, 'bounds', 'south must be less than north')

  finite(terrain.minElevation, source, 'minElevation')
  finite(terrain.maxElevation, source, 'maxElevation')
  const heights = array(terrain.heights, source, 'heights')
  const expectedHeightCount = width * height
  if (heights.length !== expectedHeightCount) {
    fail(source, 'heights', `expected ${expectedHeightCount} values, received ${heights.length}`)
  }
  heights.forEach((elevation, index) => finite(elevation, source, `heights[${index}]`))
  return terrain as TerrainData
}

export function validateTrailPayload(
  value: unknown,
  path: string,
  options: { allowEmptyNames?: boolean } = {},
): TrailCollection {
  const source = `Trail data (${path})`
  const collection = record(value, source, 'root')
  if (collection.type !== 'FeatureCollection') {
    fail(source, 'type', 'expected "FeatureCollection"')
  }
  const features = array(collection.features, source, 'features')
  features.forEach((featureValue, featureIndex) => {
    const featurePath = `features[${featureIndex}]`
    const feature = record(featureValue, source, featurePath)
    if (feature.type !== 'Feature') fail(source, `${featurePath}.type`, 'expected "Feature"')
    const properties = record(feature.properties, source, `${featurePath}.properties`)
    if (options.allowEmptyNames) {
      if (typeof properties.name !== 'string') {
        fail(source, `${featurePath}.properties.name`, 'expected a string')
      }
    } else {
      text(properties.name, source, `${featurePath}.properties.name`)
    }
    text(properties.kind, source, `${featurePath}.properties.kind`)

    const geometry = record(feature.geometry, source, `${featurePath}.geometry`)
    const coordinatePath = `${featurePath}.geometry.coordinates`
    if (geometry.type === 'Point') {
      coordinate(geometry.coordinates, source, coordinatePath)
    } else if (geometry.type === 'LineString') {
      const line = array(geometry.coordinates, source, coordinatePath)
      if (line.length < 2) fail(source, coordinatePath, 'expected at least two positions')
      line.forEach((position, index) => coordinate(position, source, `${coordinatePath}[${index}]`))
    } else if (geometry.type === 'Polygon') {
      const rings = array(geometry.coordinates, source, coordinatePath)
      if (rings.length === 0) fail(source, coordinatePath, 'expected at least one ring')
      rings.forEach((ringValue, ringIndex) => {
        const ringPath = `${coordinatePath}[${ringIndex}]`
        const ring = array(ringValue, source, ringPath)
        if (ring.length < 4) fail(source, ringPath, 'expected at least four positions')
        ring.forEach((position, index) => coordinate(position, source, `${ringPath}[${index}]`))
      })
    } else {
      fail(source, `${featurePath}.geometry.type`, 'expected Point, LineString, or Polygon')
    }
  })
  return collection as TrailCollection
}

export function validateLatestPayload(value: unknown, path: string): LatestData {
  const source = `Weather data (${path})`
  const latest = record(value, source, 'root')
  time(latest.generatedAt, source, 'generatedAt')
  text(latest.location, source, 'location')

  const summary = record(latest.summary, source, 'summary')
  for (const field of [
    'recentSnowCm',
    'forecastSnowCm',
    'mainWindDirectionDeg',
    'avgWindKph',
    'temperatureMinC',
    'temperatureMaxC',
  ]) {
    finite(summary[field], source, `summary.${field}`)
  }
  if (!['low', 'medium', 'high'].includes(String(summary.confidence))) {
    fail(source, 'summary.confidence', 'expected low, medium, or high')
  }
  text(summary.headline, source, 'summary.headline')
  const reasons = array(summary.reasons, source, 'summary.reasons')
  reasons.forEach((reason, index) => text(reason, source, `summary.reasons[${index}]`))
  optionalFiniteFields(summary, source, 'summary', [
    'maxGustKph',
    'currentWindDirectionDeg',
    'currentWindKph',
    'currentGustKph',
    'currentTemperatureC',
    'forecastWindDirectionDeg',
    'forecastAvgWindKph',
    'forecastMaxGustKph',
    'forecastTemperatureMinC',
    'forecastTemperatureMaxC',
    'recentFreezingLevelM',
    'forecastFreezingLevelM',
    'forecastRainMm',
    'forecastHoursAboveZero',
    'stormPeakSnowCm',
    'windDirectionSpreadDeg',
    'cloudLowPct',
    'cloudMidPct',
    'cloudHighPct',
    'cloudMeanPct',
    'freezingLevelM',
    'meltFreezeCycles',
    'recentRainMm',
    'hoursAboveZero',
    'hoursSinceSnow',
  ])
  if (summary.stormStartAt !== undefined) time(summary.stormStartAt, source, 'summary.stormStartAt')
  if (summary.stormEndAt !== undefined) time(summary.stormEndAt, source, 'summary.stormEndAt')
  recentTerrainSignal(summary.recentTerrainSignal, source)

  weatherHours(latest.observations, source, 'observations')
  weatherHours(latest.forecast, source, 'forecast')
  dailyForecast(latest.daily, source)
  ensembleSummary(latest.ensemble, source)
  return latest as LatestData
}
