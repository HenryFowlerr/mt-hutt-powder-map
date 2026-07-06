import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = join(process.cwd(), 'public', 'data')
mkdirSync(dataDir, { recursive: true })

const latestPath = join(dataDir, 'latest.json')
const fallback = JSON.parse(readFileSync(latestPath, 'utf8'))
const lat = -43.49
const lon = 171.54
const hourly = [
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
].join(',')

const url = new URL('https://api.open-meteo.com/v1/forecast')
url.searchParams.set('latitude', String(lat))
url.searchParams.set('longitude', String(lon))
url.searchParams.set('hourly', hourly)
url.searchParams.set('past_days', '3')
url.searchParams.set('forecast_days', '14')
url.searchParams.set('timezone', 'Pacific/Auckland')

try {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
  const weather = await response.json()
  const hours: string[] = weather.hourly?.time ?? []
  const now = Date.now()

  const recentIndexes = hours
    .map((time, index) => ({ time: new Date(time).getTime(), index }))
    .filter(({ time }) => time <= now && time >= now - 72 * 60 * 60 * 1000)
    .map(({ index }) => index)
  const forecastIndexes = hours
    .map((time, index) => ({ time: new Date(time).getTime(), index }))
    .filter(({ time }) => time > now && time <= now + 72 * 60 * 60 * 1000)
    .map(({ index }) => index)

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
  const snowWeightedWindDirection = (indexes: number[], fallbackDegrees: number) => {
    let vx = 0
    let vy = 0
    for (const index of indexes) {
      const directionRad = (Number(weather.hourly?.wind_direction_10m?.[index] ?? 0) * Math.PI) / 180
      const weight = Number(weather.hourly?.snowfall?.[index] ?? 0) + 0.05
      vx += Math.sin(directionRad) * weight
      vy += Math.cos(directionRad) * weight
    }
    if (Math.hypot(vx, vy) < 0.001) return fallbackDegrees
    return ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360
  }

  const recentSnowCm = sum('snowfall', recentIndexes)
  const forecastSnowCm = sum('snowfall', forecastIndexes)
  const wind = avg('wind_speed_10m', recentIndexes)
  const forecastWind = avg('wind_speed_10m', forecastIndexes)
  const maxGustKph = percentile('wind_gusts_10m', recentIndexes, 0.9, wind * 1.6)
  const forecastMaxGustKph = percentile('wind_gusts_10m', forecastIndexes, 0.9, forecastWind * 1.6)

  // Storm wind direction: weight each hour's direction by its snowfall (plus
  // a small floor so windy-but-dry hours still count). A plain average of
  // compass degrees is meaningless across the 0/360 wrap, so average the
  // direction vectors instead.
  const windDirection = snowWeightedWindDirection(recentIndexes, fallback.summary.mainWindDirectionDeg ?? 0)
  const forecastWindDirection = snowWeightedWindDirection(forecastIndexes, windDirection)
  // Current cloud picture: average of the last 6 available hours so the 3D
  // cloud layer reflects what the mountain looks like right now.
  const nowIndexes = recentIndexes.slice(-6)
  const cloudLowPct = avg('cloud_cover_low', nowIndexes)
  const cloudMidPct = avg('cloud_cover_mid', nowIndexes)
  const cloudHighPct = avg('cloud_cover_high', nowIndexes)
  const freezingLevelM = avg('freezing_level_height', nowIndexes)

  const temperatureMinC = minValue('temperature_2m', recentIndexes, fallback.summary.temperatureMinC ?? 0)
  const temperatureMaxC = maxValue('temperature_2m', recentIndexes, fallback.summary.temperatureMaxC ?? 0)
  const forecastTemperatureMinC = minValue('temperature_2m', forecastIndexes, temperatureMinC)
  const forecastTemperatureMaxC = maxValue('temperature_2m', forecastIndexes, temperatureMaxC)
  const cloudMeanPct = avg('cloud_cover', nowIndexes)

  // --- Ice-formation inputs (last 72 h) ---
  // Melt-freeze cycles: count downward zero-crossings of temperature.
  const recentTemps = values('temperature_2m', recentIndexes)
  let meltFreezeCycles = 0
  for (let i = 1; i < recentTemps.length; i += 1) {
    if (recentTemps[i - 1] > 0.3 && recentTemps[i] <= 0) meltFreezeCycles += 1
  }
  const recentRainMm = sum('rain', recentIndexes)
  const hoursAboveZero = recentTemps.filter((temperature) => temperature > 0).length
  // Hours since the last hour of meaningful snowfall (fresh cover suppresses ice).
  let hoursSinceSnow = 999
  const recentSnowSeries = values('snowfall', recentIndexes)
  for (let i = recentSnowSeries.length - 1; i >= 0; i -= 1) {
    if (recentSnowSeries[i] > 0.2) {
      hoursSinceSnow = recentSnowSeries.length - 1 - i
      break
    }
  }

  // --- 14-day daily aggregates, computed from the hourly series so we also
  // get freezing level and cloud per day (Open-Meteo's daily API omits them).
  const dailyMap = new Map<string, number[]>()
  for (let index = 0; index < hours.length; index += 1) {
    if (new Date(hours[index]).getTime() < now - 60 * 60 * 1000) continue // today onward
    const day = hours[index].slice(0, 10)
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

  const next = {
    ...fallback,
    generatedAt: new Date().toISOString(),
    summary: {
      ...fallback.summary,
      recentSnowCm: Number(recentSnowCm.toFixed(1)),
      forecastSnowCm: Number(forecastSnowCm.toFixed(1)),
      mainWindDirectionDeg: Number(windDirection.toFixed(0)),
      avgWindKph: Number(wind.toFixed(0)),
      maxGustKph: Number(maxGustKph.toFixed(0)),
      forecastWindDirectionDeg: Number(forecastWindDirection.toFixed(0)),
      forecastAvgWindKph: Number(forecastWind.toFixed(0)),
      forecastMaxGustKph: Number(forecastMaxGustKph.toFixed(0)),
      temperatureMinC: Number(temperatureMinC.toFixed(1)),
      temperatureMaxC: Number(temperatureMaxC.toFixed(1)),
      forecastTemperatureMinC: Number(forecastTemperatureMinC.toFixed(1)),
      forecastTemperatureMaxC: Number(forecastTemperatureMaxC.toFixed(1)),
      cloudLowPct: Number(cloudLowPct.toFixed(0)),
      cloudMidPct: Number(cloudMidPct.toFixed(0)),
      cloudHighPct: Number(cloudHighPct.toFixed(0)),
      cloudMeanPct: Number(cloudMeanPct.toFixed(0)),
      freezingLevelM: Number(freezingLevelM.toFixed(0)),
      meltFreezeCycles,
      recentRainMm: Number(recentRainMm.toFixed(1)),
      hoursAboveZero,
      hoursSinceSnow,
      confidence: recentSnowCm > 4 || forecastSnowCm > 4 ? 'medium' : 'low',
      headline:
        recentSnowCm > 4
          ? 'Recent snow and wind are producing a stronger powder signal on sheltered lee terrain.'
          : 'Limited recent snow signal; sheltered upper terrain still scores best if snow stayed cold.',
      reasons: [
        `${recentSnowCm.toFixed(0)} cm estimated snowfall in the last 72 hours from Open-Meteo.`,
        `Mean recent wind around ${wind.toFixed(0)} km/h from ${windDirection.toFixed(0)} degrees.`,
        `Forecast wind trends ${forecastWind.toFixed(0)} km/h from ${forecastWindDirection.toFixed(0)} degrees over the next 72 hours.`,
        'Terrain score favours cold upper mountain bowls, gullies, and lee-facing aspects.',
      ],
    },
    observations: recentIndexes.map((index) => ({
      time: hours[index],
      temperatureC: weather.hourly.temperature_2m[index],
      snowfallCm: weather.hourly.snowfall[index],
      windKph: weather.hourly.wind_speed_10m[index],
      windDirectionDeg: weather.hourly.wind_direction_10m[index],
    })),
    // The powder model uses the next 72 h; the outlook strip and timeline use
    // the next 7 days of hourly data (14-day view uses the daily array below).
    forecast: hours
      .map((time, index) => ({ time: new Date(time).getTime(), index }))
      .filter(({ time }) => time > now && time <= now + 7 * 24 * 60 * 60 * 1000)
      .map(({ index }) => ({
        time: hours[index],
        temperatureC: weather.hourly.temperature_2m[index],
        snowfallCm: weather.hourly.snowfall[index],
        windKph: weather.hourly.wind_speed_10m[index],
        windDirectionDeg: weather.hourly.wind_direction_10m[index],
        freezingLevelM: weather.hourly.freezing_level_height?.[index],
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

  writeFileSync(latestPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Updated weather data from Open-Meteo: ${recentSnowCm.toFixed(1)} cm recent snow`)
} catch (error) {
  // Keep the existing file untouched so the app's "updated X ago" stays
  // honest about how old the data actually is.
  console.warn(`Weather update failed, keeping previous data: ${error instanceof Error ? error.message : String(error)}`)
}
