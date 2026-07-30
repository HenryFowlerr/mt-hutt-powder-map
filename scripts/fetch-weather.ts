import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { summariseGfsEnsemble } from './ensemble-summary'
import { dateKeyAtZone, openMeteoUnixIso, openMeteoUnixMs } from './weather-time'
import {
  assessRecentTerrainSignal,
  legacyConfidenceForRecentSignal,
} from '../src/lib/recentTerrainSignal'
import type { EnsembleSnowfallSummary } from '../src/types'

const dataDir = process.env.MT_HUTT_DATA_DIR
  ? resolve(process.env.MT_HUTT_DATA_DIR)
  : join(process.cwd(), 'public', 'data')
mkdirSync(dataDir, { recursive: true })

const latestPath = join(dataDir, 'latest.json')
const fallback = JSON.parse(readFileSync(latestPath, 'utf8'))
const fetchTimeoutMs = Number(process.env.WEATHER_FETCH_TIMEOUT_MS ?? 20_000)
if (!Number.isFinite(fetchTimeoutMs) || fetchTimeoutMs <= 0) {
  throw new Error('WEATHER_FETCH_TIMEOUT_MS must be a positive number')
}
const lat = -43.49
const lon = 171.54
const hourlyFields = [
  'temperature_2m',
  'precipitation',
  'rain',
  'snowfall',
  'snow_depth',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'freezing_level_height',
  'weather_code',
]
const hourly = hourlyFields.join(',')

type WeatherPayload = {
  hourly: Record<string, number[]> & { time: number[] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseWeatherPayload(payload: unknown): WeatherPayload {
  if (!isRecord(payload) || !isRecord(payload.hourly)) {
    throw new Error('Open-Meteo response is missing the hourly weather object')
  }

  const times = payload.hourly.time
  if (!Array.isArray(times) || times.length < 48) {
    throw new Error('Open-Meteo response has insufficient hourly timestamps')
  }
  const parsedTimes = times.map((time) => {
    openMeteoUnixMs(time)
    return time as number
  })
  for (let index = 1; index < parsedTimes.length; index += 1) {
    if (parsedTimes[index] <= parsedTimes[index - 1]) {
      throw new Error('Open-Meteo hourly timestamps are not strictly increasing')
    }
  }

  const parsedHourly: Record<string, number[]> & { time: number[] } = {
    time: parsedTimes,
  }
  for (const field of hourlyFields) {
    const series = payload.hourly[field]
    if (!Array.isArray(series) || series.length !== parsedTimes.length) {
      throw new Error(`Open-Meteo hourly.${field} is missing or has the wrong length`)
    }
    if (series.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Open-Meteo hourly.${field} contains a non-finite value`)
    }
    parsedHourly[field] = series as number[]
  }

  return { hourly: parsedHourly }
}

function writeLatestAtomically(contents: string) {
  const temporaryPath = `${latestPath}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(temporaryPath, contents, { flag: 'wx' })
    renameSync(temporaryPath, latestPath)
  } catch (error) {
    try {
      unlinkSync(temporaryPath)
    } catch {
      // Nothing to clean up when the temporary file was never created.
    }
    throw error
  }
}

const url = new URL('https://api.open-meteo.com/v1/forecast')
url.searchParams.set('latitude', String(lat))
url.searchParams.set('longitude', String(lon))
// Match the model's mid-mountain reference elevation so Open-Meteo's
// statistical downscaling and our lapse-rate adjustment share a datum.
url.searchParams.set('elevation', '1600')
url.searchParams.set('hourly', hourly)
url.searchParams.set('past_days', '3')
url.searchParams.set('forecast_days', '14')
url.searchParams.set('timezone', 'Pacific/Auckland')
url.searchParams.set('timeformat', 'unixtime')

const ensembleUrl = new URL('https://ensemble-api.open-meteo.com/v1/ensemble')
ensembleUrl.searchParams.set('latitude', String(lat))
ensembleUrl.searchParams.set('longitude', String(lon))
ensembleUrl.searchParams.set('elevation', '1600')
ensembleUrl.searchParams.set('hourly', 'snowfall')
ensembleUrl.searchParams.set('models', 'gfs_seamless')
ensembleUrl.searchParams.set('forecast_hours', '72')
ensembleUrl.searchParams.set('timezone', 'Pacific/Auckland')
ensembleUrl.searchParams.set('timeformat', 'unixtime')

async function fetchEnsembleSummary(): Promise<EnsembleSnowfallSummary | undefined> {
  try {
    const response = await fetch(ensembleUrl, {
      signal: AbortSignal.timeout(Math.min(fetchTimeoutMs, 15_000)),
    })
    if (!response.ok) throw new Error(`Open-Meteo ensemble ${response.status}`)
    const summary = summariseGfsEnsemble(await response.json())
    if (!summary) throw new Error('Open-Meteo ensemble response had fewer than two valid members')
    return summary
  } catch (error) {
    console.warn(
      `Ensemble update unavailable; continuing with deterministic data: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return undefined
  }
}

// Start this alongside the deterministic request. It is strictly optional,
// handles its own failures, and has a timeout so it cannot prevent a normal
// weather update from being published.
const ensemblePromise = fetchEnsembleSummary()

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) })
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
  const weather = parseWeatherPayload(await response.json())
  const hours: unknown[] = weather.hourly.time
  const hourTimes = hours.map(openMeteoUnixMs)
  const now = Date.now()

  const recentIndexes = hourTimes
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time <= now && time >= now - 72 * 60 * 60 * 1000)
    .map(({ index }) => index)
  const forecastIndexes = hourTimes
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time > now && time <= now + 72 * 60 * 60 * 1000)
    .map(({ index }) => index)
  if (recentIndexes.length < 24 || forecastIndexes.length < 24) {
    throw new Error(
      `Open-Meteo response has insufficient current coverage (${recentIndexes.length} recent, ${forecastIndexes.length} forecast hours)`,
    )
  }

  const sum = (field: string, indexes: number[]) =>
    indexes.reduce((total, index) => total + Number(weather.hourly?.[field]?.[index] ?? 0), 0)
  const avg = (field: string, indexes: number[]) =>
    indexes.length ? indexes.reduce((total, index) => total + Number(weather.hourly?.[field]?.[index] ?? 0), 0) / indexes.length : 0
  const values = (field: string, indexes: number[]) => indexes.map((index) => Number(weather.hourly?.[field]?.[index] ?? 0))
  const percentile = (field: string, indexes: number[], p: number, fallbackValue: number) => {
    const sorted = values(field, indexes).sort((a, b) => a - b)
    return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : fallbackValue
  }
  const minValue = (field: string, indexes: number[], fallbackValue: number) => {
    const nums = values(field, indexes)
    return nums.length ? Math.min(...nums) : fallbackValue
  }
  const maxValue = (field: string, indexes: number[], fallbackValue: number) => {
    const nums = values(field, indexes)
    return nums.length ? Math.max(...nums) : fallbackValue
  }
  const stormIndexes = (indexes: number[]) => {
    const snowing = new Set(
      indexes.filter((index) => Number(weather.hourly?.snowfall?.[index] ?? 0) >= 0.05),
    )
    if (snowing.size === 0) return indexes
    // Wind immediately before and after snowfall affects transport too.
    return indexes.filter((index) => {
      for (let offset = -2; offset <= 3; offset += 1) {
        if (snowing.has(index + offset)) return true
      }
      return false
    })
  }
  const snowWeightedAverage = (field: string, indexes: number[], fallbackValue: number) => {
    let total = 0
    let totalWeight = 0
    for (const index of indexes) {
      const value = Number(weather.hourly?.[field]?.[index])
      if (!Number.isFinite(value)) continue
      const weight = Number(weather.hourly?.snowfall?.[index] ?? 0) + 0.03
      total += value * weight
      totalWeight += weight
    }
    return totalWeight > 0 ? total / totalWeight : fallbackValue
  }
  const snowWeightedWindDirection = (indexes: number[], fallbackDegrees: number) => {
    let vx = 0
    let vy = 0
    for (const index of indexes) {
      const directionRad = (Number(weather.hourly?.wind_direction_10m?.[index] ?? 0) * Math.PI) / 180
      const weight = Number(weather.hourly?.snowfall?.[index] ?? 0) + 0.03
      vx += Math.sin(directionRad) * weight
      vy += Math.cos(directionRad) * weight
    }
    if (Math.hypot(vx, vy) < 0.001) return fallbackDegrees
    return ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360
  }
  const windDirectionSpread = (indexes: number[]) => {
    let vx = 0
    let vy = 0
    let weightTotal = 0
    for (const index of indexes) {
      const directionRad = (Number(weather.hourly?.wind_direction_10m?.[index] ?? 0) * Math.PI) / 180
      const weight = Number(weather.hourly?.snowfall?.[index] ?? 0) + 0.03
      vx += Math.sin(directionRad) * weight
      vy += Math.cos(directionRad) * weight
      weightTotal += weight
    }
    if (weightTotal <= 0) return 180
    const concentration = Math.max(0.0001, Math.min(1, Math.hypot(vx, vy) / weightTotal))
    return Math.min(180, Math.sqrt(-2 * Math.log(concentration)) * (180 / Math.PI))
  }

  const recentSnowCm = sum('snowfall', recentIndexes)
  const forecastSnowCm = sum('snowfall', forecastIndexes)
  const recentStormIndexes = stormIndexes(recentIndexes)
  const forecastStormIndexes = stormIndexes(forecastIndexes)
  const wind = snowWeightedAverage('wind_speed_10m', recentStormIndexes, avg('wind_speed_10m', recentIndexes))
  const forecastWind = snowWeightedAverage(
    'wind_speed_10m',
    forecastStormIndexes,
    avg('wind_speed_10m', forecastIndexes),
  )
  const maxGustKph = percentile('wind_gusts_10m', recentStormIndexes, 0.9, wind * 1.6)
  const forecastMaxGustKph = percentile('wind_gusts_10m', forecastStormIndexes, 0.9, forecastWind * 1.6)

  // Storm wind direction: weight each hour's direction by its snowfall (plus
  // a small floor so windy-but-dry hours still count). A plain average of
  // compass degrees is meaningless across the 0/360 wrap, so average the
  // direction vectors instead.
  const windDirection = snowWeightedWindDirection(recentStormIndexes, fallback.summary.mainWindDirectionDeg ?? 0)
  const forecastWindDirection = snowWeightedWindDirection(forecastStormIndexes, windDirection)
  // Current cloud picture: average of the last 6 available hours so the 3D
  // cloud layer reflects what the mountain looks like right now.
  const nowIndexes = recentIndexes.slice(-6)
  const currentWindDirection = snowWeightedWindDirection(nowIndexes, windDirection)
  const currentWindKph = avg('wind_speed_10m', nowIndexes)
  const currentGustKph = percentile('wind_gusts_10m', nowIndexes, 0.9, currentWindKph * 1.6)
  const currentTemperatureC = avg('temperature_2m', nowIndexes)
  const cloudLowPct = avg('cloud_cover_low', nowIndexes)
  const cloudMidPct = avg('cloud_cover_mid', nowIndexes)
  const cloudHighPct = avg('cloud_cover_high', nowIndexes)
  const freezingLevelM = avg('freezing_level_height', nowIndexes)
  const recentFreezingLevelM = snowWeightedAverage(
    'freezing_level_height',
    recentStormIndexes,
    freezingLevelM,
  )
  const forecastFreezingLevelM = snowWeightedAverage(
    'freezing_level_height',
    forecastStormIndexes,
    freezingLevelM,
  )

  const temperatureMinC = minValue(
    'temperature_2m',
    recentStormIndexes,
    fallback.summary.temperatureMinC ?? 0,
  )
  const temperatureMaxC = maxValue(
    'temperature_2m',
    recentStormIndexes,
    fallback.summary.temperatureMaxC ?? 0,
  )
  const forecastTemperatureMinC = minValue('temperature_2m', forecastStormIndexes, temperatureMinC)
  const forecastTemperatureMaxC = maxValue('temperature_2m', forecastStormIndexes, temperatureMaxC)
  const cloudMeanPct = avg('cloud_cover', nowIndexes)

  // --- Ice-formation inputs (last 72 h) ---
  // Melt-freeze cycles: count downward zero-crossings of temperature.
  const recentTemps = values('temperature_2m', recentIndexes)
  let meltFreezeCycles = 0
  for (let i = 1; i < recentTemps.length; i += 1) {
    if (recentTemps[i - 1] > 0.3 && recentTemps[i] <= 0) meltFreezeCycles += 1
  }
  const recentRainMm = sum('rain', recentIndexes)
  const forecastRainMm = sum('rain', forecastIndexes)
  const hoursAboveZero = recentTemps.filter((temperature) => temperature > 0).length
  const forecastTemps = values('temperature_2m', forecastIndexes)
  const forecastHoursAboveZero = forecastTemps.filter((temperature) => temperature > 0).length
  // Hours since the last hour of meaningful snowfall (fresh cover suppresses ice).
  let hoursSinceSnow = 999
  const recentSnowSeries = values('snowfall', recentIndexes)
  for (let i = recentSnowSeries.length - 1; i >= 0; i -= 1) {
    if (recentSnowSeries[i] > 0.2) {
      hoursSinceSnow = recentSnowSeries.length - 1 - i
      break
    }
  }
  const snowfallForecastIndexes = forecastIndexes.filter(
    (index) => Number(weather.hourly?.snowfall?.[index] ?? 0) >= 0.05,
  )
  const stormStartAt = snowfallForecastIndexes.length
    ? openMeteoUnixIso(hours[snowfallForecastIndexes[0]])
    : undefined
  const stormEndAt = snowfallForecastIndexes.length
    ? openMeteoUnixIso(hours[snowfallForecastIndexes[snowfallForecastIndexes.length - 1]])
    : undefined
  const stormPeakSnowCm = maxValue('snowfall', forecastIndexes, 0)
  const directionSpread = windDirectionSpread(forecastStormIndexes)
  const formatSnow = (value: number) => (value > 0 && value < 1 ? value.toFixed(1) : value.toFixed(0))

  // --- 14-day daily aggregates, computed from the hourly series so we also
  // get freezing level and cloud per day (Open-Meteo's daily API omits them).
  const dailyMap = new Map<string, number[]>()
  for (let index = 0; index < hours.length; index += 1) {
    if (hourTimes[index] < now - 60 * 60 * 1000) continue // today onward
    const day = dateKeyAtZone(hours[index])
    const list = dailyMap.get(day)
    if (list) list.push(index)
    else dailyMap.set(day, [index])
  }
  const codeMode = (indexes: number[]) => {
    const counts = new Map<number, number>()
    for (const index of indexes) {
      const code = Number(weather.hourly?.weather_code?.[index] ?? 0)
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    let best = 0
    let bestCount = -1
    for (const [code, count] of counts) {
      if (count > bestCount) {
        best = code
        bestCount = count
      }
    }
    return best
  }
  const daily = [...dailyMap.entries()]
    .filter(([, indexes]) => indexes.length >= 6)
    .slice(0, 14)
    .map(([day, indexes]) => ({
      date: day,
      snowfallCm: Number(sum('snowfall', indexes).toFixed(1)),
      precipMm: Number(sum('precipitation', indexes).toFixed(1)),
      rainMm: Number(sum('rain', indexes).toFixed(1)),
      tempMinC: Number(minValue('temperature_2m', indexes, 0).toFixed(1)),
      tempMaxC: Number(maxValue('temperature_2m', indexes, 0).toFixed(1)),
      windMeanKph: Number(avg('wind_speed_10m', indexes).toFixed(0)),
      gustMaxKph: Number(maxValue('wind_gusts_10m', indexes, 0).toFixed(0)),
      windDirectionDeg: Number(snowWeightedWindDirection(indexes, windDirection).toFixed(0)),
      cloudPct: Number(avg('cloud_cover', indexes).toFixed(0)),
      freezingLevelM: Number(avg('freezing_level_height', indexes).toFixed(0)),
      weatherCode: codeMode(indexes),
    }))

  const ensemble = await ensemblePromise
  const generatedAt = new Date().toISOString()
  const recentTerrainSignal = assessRecentTerrainSignal({
    recentSnowCm,
    generatedAt,
    now: generatedAt,
    coverageHours: recentIndexes.length,
  })
  const next = {
    ...fallback,
    generatedAt,
    ensemble,
    summary: {
      ...fallback.summary,
      recentSnowCm: Number(recentSnowCm.toFixed(1)),
      forecastSnowCm: Number(forecastSnowCm.toFixed(1)),
      mainWindDirectionDeg: Number(windDirection.toFixed(0)),
      avgWindKph: Number(wind.toFixed(0)),
      maxGustKph: Number(maxGustKph.toFixed(0)),
      currentWindDirectionDeg: Number(currentWindDirection.toFixed(0)),
      currentWindKph: Number(currentWindKph.toFixed(0)),
      currentGustKph: Number(currentGustKph.toFixed(0)),
      currentTemperatureC: Number(currentTemperatureC.toFixed(1)),
      forecastWindDirectionDeg: Number(forecastWindDirection.toFixed(0)),
      forecastAvgWindKph: Number(forecastWind.toFixed(0)),
      forecastMaxGustKph: Number(forecastMaxGustKph.toFixed(0)),
      temperatureMinC: Number(temperatureMinC.toFixed(1)),
      temperatureMaxC: Number(temperatureMaxC.toFixed(1)),
      forecastTemperatureMinC: Number(forecastTemperatureMinC.toFixed(1)),
      forecastTemperatureMaxC: Number(forecastTemperatureMaxC.toFixed(1)),
      recentFreezingLevelM: Number(recentFreezingLevelM.toFixed(0)),
      forecastFreezingLevelM: Number(forecastFreezingLevelM.toFixed(0)),
      forecastRainMm: Number(forecastRainMm.toFixed(1)),
      forecastHoursAboveZero,
      stormStartAt,
      stormEndAt,
      stormPeakSnowCm: Number(stormPeakSnowCm.toFixed(1)),
      windDirectionSpreadDeg: Number(directionSpread.toFixed(0)),
      cloudLowPct: Number(cloudLowPct.toFixed(0)),
      cloudMidPct: Number(cloudMidPct.toFixed(0)),
      cloudHighPct: Number(cloudHighPct.toFixed(0)),
      cloudMeanPct: Number(cloudMeanPct.toFixed(0)),
      freezingLevelM: Number(freezingLevelM.toFixed(0)),
      meltFreezeCycles,
      recentRainMm: Number(recentRainMm.toFixed(1)),
      hoursAboveZero,
      hoursSinceSnow,
      recentTerrainSignal,
      confidence: legacyConfidenceForRecentSignal(recentTerrainSignal),
      headline:
        recentSnowCm > 4
          ? 'Recent snow and wind are producing a stronger powder signal on sheltered lee terrain.'
          : 'Limited recent snow signal; sheltered upper terrain still scores best if snow stayed cold.',
      reasons: [
        `${formatSnow(recentSnowCm)} cm estimated snowfall in the last 72 hours from Open-Meteo.`,
        `Mean recent wind around ${wind.toFixed(0)} km/h from ${windDirection.toFixed(0)} degrees.`,
        `Forecast wind trends ${forecastWind.toFixed(0)} km/h from ${forecastWindDirection.toFixed(0)} degrees over the next 72 hours.`,
        'Terrain score favours cold upper mountain bowls, gullies, and lee-facing aspects.',
      ],
    },
    observations: recentIndexes.map((index) => ({
      time: openMeteoUnixIso(hours[index]),
      temperatureC: weather.hourly.temperature_2m[index],
      snowfallCm: weather.hourly.snowfall[index],
      windKph: weather.hourly.wind_speed_10m[index],
      windDirectionDeg: weather.hourly.wind_direction_10m[index],
      freezingLevelM: weather.hourly.freezing_level_height?.[index],
      gustKph: weather.hourly.wind_gusts_10m?.[index],
      rainMm: weather.hourly.rain?.[index],
      precipitationMm: weather.hourly.precipitation?.[index],
      cloudPct: weather.hourly.cloud_cover?.[index],
    })),
    // The powder model uses the next 72 h; the outlook strip and timeline use
    // the next 7 days of hourly data (14-day view uses the daily array below).
    forecast: hours
      .map((time, index) => ({ time: openMeteoUnixMs(time), index }))
      .filter(({ time }) => time > now && time <= now + 7 * 24 * 60 * 60 * 1000)
      .map(({ index }) => ({
        time: openMeteoUnixIso(hours[index]),
        temperatureC: weather.hourly.temperature_2m[index],
        snowfallCm: weather.hourly.snowfall[index],
        windKph: weather.hourly.wind_speed_10m[index],
        windDirectionDeg: weather.hourly.wind_direction_10m[index],
        freezingLevelM: weather.hourly.freezing_level_height?.[index],
        gustKph: weather.hourly.wind_gusts_10m?.[index],
        rainMm: weather.hourly.rain?.[index],
        precipitationMm: weather.hourly.precipitation?.[index],
        cloudPct: weather.hourly.cloud_cover?.[index],
      })),
    daily,
  }

  // Never write garbage: if the API returned something unusable, keep the
  // previous file (its generatedAt then honestly reflects the data age).
  const criticalNumbers = [
    next.summary.recentSnowCm,
    next.summary.forecastSnowCm,
    next.summary.mainWindDirectionDeg,
    next.summary.avgWindKph,
    next.summary.temperatureMinC,
    next.summary.temperatureMaxC,
  ]
  if (criticalNumbers.some((value) => !Number.isFinite(value))) {
    throw new Error('Open-Meteo response produced non-finite summary values')
  }

  writeLatestAtomically(`${JSON.stringify(next, null, 2)}\n`)
  console.log(`Updated weather data from Open-Meteo: ${recentSnowCm.toFixed(1)} cm recent snow`)
} catch (error) {
  // Keep the existing file untouched so the app's "updated X ago" stays
  // honest about how old the data actually is.
  console.error(`Weather update failed, keeping previous data: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
