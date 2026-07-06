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
].join(',')

const url = new URL('https://api.open-meteo.com/v1/forecast')
url.searchParams.set('latitude', String(lat))
url.searchParams.set('longitude', String(lon))
url.searchParams.set('hourly', hourly)
url.searchParams.set('past_days', '3')
url.searchParams.set('forecast_days', '3')
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

  const recentSnowCm = sum('snowfall', recentIndexes)
  const forecastSnowCm = sum('snowfall', forecastIndexes)
  const wind = avg('wind_speed_10m', recentIndexes)
  const temperatures = values('temperature_2m', recentIndexes)
  // 90th-percentile gust: robust against single-hour spikes in the model data.
  const gusts = values('wind_gusts_10m', recentIndexes).sort((a, b) => a - b)
  const maxGustKph = gusts.length ? gusts[Math.floor(gusts.length * 0.9)] : wind * 1.6

  // Storm wind direction: weight each hour's direction by its snowfall (plus
  // a small floor so windy-but-dry hours still count). A plain average of
  // compass degrees is meaningless across the 0/360 wrap, so average the
  // direction vectors instead.
  let vx = 0
  let vy = 0
  for (const index of recentIndexes) {
    const directionRad = (Number(weather.hourly?.wind_direction_10m?.[index] ?? 0) * Math.PI) / 180
    const weight = Number(weather.hourly?.snowfall?.[index] ?? 0) + 0.05
    vx += Math.sin(directionRad) * weight
    vy += Math.cos(directionRad) * weight
  }
  const windDirection = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360

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
      temperatureMinC: Number(Math.min(...temperatures).toFixed(1)),
      temperatureMaxC: Number(Math.max(...temperatures).toFixed(1)),
      confidence: recentSnowCm > 4 || forecastSnowCm > 4 ? 'medium' : 'low',
      headline:
        recentSnowCm > 4
          ? 'Recent snow and wind are producing a stronger powder signal on sheltered lee terrain.'
          : 'Limited recent snow signal; sheltered upper terrain still scores best if snow stayed cold.',
      reasons: [
        `${recentSnowCm.toFixed(0)} cm estimated snowfall in the last 72 hours from Open-Meteo.`,
        `Mean recent wind around ${wind.toFixed(0)} km/h from ${windDirection.toFixed(0)} degrees.`,
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
    forecast: forecastIndexes.map((index) => ({
      time: hours[index],
      temperatureC: weather.hourly.temperature_2m[index],
      snowfallCm: weather.hourly.snowfall[index],
      windKph: weather.hourly.wind_speed_10m[index],
      windDirectionDeg: weather.hourly.wind_direction_10m[index],
    })),
  }

  writeFileSync(latestPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Updated weather data from Open-Meteo: ${recentSnowCm.toFixed(1)} cm recent snow`)
} catch (error) {
  console.warn(`Weather update failed, keeping fallback data: ${error instanceof Error ? error.message : String(error)}`)
  writeFileSync(latestPath, `${JSON.stringify({ ...fallback, generatedAt: new Date().toISOString() }, null, 2)}\n`)
}
