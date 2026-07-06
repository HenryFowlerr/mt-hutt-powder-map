import { formatDistanceToNow } from 'date-fns'
import { useMemo } from 'react'
import { fieldMaxCm, powderColorForCm, type PowderField, type PowderWeather } from '../lib/powderModel'
import { buildZoneSummaries } from '../lib/zoneSummary'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import { useViewStore } from '../state/viewStore'
import type { LatestData, TerrainData, TrailCollection, WeatherHour } from '../types'

type Props = {
  latest: LatestData
  field: PowderField
  terrain: TerrainData
  analysis: TerrainAnalysis
  trails: TrailCollection
  weather: PowderWeather
}

function windCompass(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

type DayOutlook = {
  label: string
  snowCm: number
  windKph: number
  minC: number
  maxC: number
}

// Aggregate the hourly forecast into per-day rows for the outlook strip.
function buildOutlook(forecast: WeatherHour[]): DayOutlook[] {
  const byDay = new Map<string, WeatherHour[]>()
  for (const hour of forecast) {
    const day = hour.time.slice(0, 10)
    const list = byDay.get(day)
    if (list) list.push(hour)
    else byDay.set(day, [hour])
  }
  const days: DayOutlook[] = []
  for (const [day, hours] of byDay) {
    if (hours.length < 4) continue // skip fragments at the range edges
    const temps = hours.map((hour) => hour.temperatureC)
    days.push({
      label: new Date(`${day}T12:00`).toLocaleDateString('en-NZ', { weekday: 'short' }),
      snowCm: hours.reduce((total, hour) => total + hour.snowfallCm, 0),
      windKph: hours.reduce((total, hour) => total + hour.windKph, 0) / hours.length,
      minC: Math.min(...temps),
      maxC: Math.max(...temps),
    })
  }
  return days.slice(0, 5)
}

function snowlineSentence(freezingLevelM: number | undefined) {
  if (!freezingLevelM) return null
  if (freezingLevelM < 1450) return `Freezing level ~${Math.round(freezingLevelM)} m — snow falling to the access road.`
  if (freezingLevelM < 1900)
    return `Freezing level ~${Math.round(freezingLevelM)} m — wet low down, drier snow up high.`
  return `Freezing level ~${Math.round(freezingLevelM)} m — warm, rain risk on most of the mountain.`
}

export function WeatherPanel({ latest, field, terrain, analysis, trails, weather }: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  const generated = new Date(latest.generatedAt)
  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'
  const maxCm = Math.round(fieldMaxCm(field, mode))
  const windDirection =
    mode === 'forecast'
      ? (latest.summary.forecastWindDirectionDeg ?? latest.summary.mainWindDirectionDeg)
      : latest.summary.mainWindDirectionDeg
  const windSpeed =
    mode === 'forecast'
      ? (latest.summary.forecastAvgWindKph ?? latest.summary.avgWindKph)
      : latest.summary.avgWindKph
  const windGust =
    mode === 'forecast'
      ? (latest.summary.forecastMaxGustKph ?? latest.summary.maxGustKph)
      : latest.summary.maxGustKph
  const temperatureMin =
    mode === 'forecast'
      ? (latest.summary.forecastTemperatureMinC ?? latest.summary.temperatureMinC)
      : latest.summary.temperatureMinC
  const temperatureMax =
    mode === 'forecast'
      ? (latest.summary.forecastTemperatureMaxC ?? latest.summary.temperatureMaxC)
      : latest.summary.temperatureMaxC
  const windFrom = windCompass(windDirection)
  const leeSide = windCompass((windDirection + 180) % 360)
  const snowCm = mode === 'forecast' ? latest.summary.forecastSnowCm : latest.summary.recentSnowCm

  const zones = useMemo(
    () => buildZoneSummaries(terrain, analysis, field, weather, trails, mode).slice(0, 5),
    [terrain, analysis, field, weather, trails, mode],
  )
  const outlook = useMemo(() => buildOutlook(latest.forecast ?? []), [latest.forecast])
  const snowline = snowlineSentence(latest.summary.freezingLevelM)

  return (
    <aside className="weather-panel">
      <p className="panel-eyebrow">Mt Hutt powder model</p>

      <div className="hero">
        <div className="hero-number">
          <strong>~{maxCm}</strong>
          <span>cm</span>
        </div>
        <div className="hero-caption">
          <span>deepest {mode === 'forecast' ? 'forecast' : 'recent'} pocket</span>
          <span className={`confidence-chip ${latest.summary.confidence}`}>
            {latest.summary.confidence} confidence
          </span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span>{mode === 'forecast' ? 'Next 72 h' : 'Last 72 h'}</span>
          <strong>{Math.round(snowCm)} cm</strong>
        </div>
        <div className="stat">
          <span>Wind</span>
          <strong>
            {windFrom} {Math.round(windSpeed)}
            {windGust ? <em> g{Math.round(windGust)}</em> : null}
          </strong>
        </div>
        <div className="stat">
          <span>Temp</span>
          <strong>
            {Math.round(temperatureMin)}…{Math.round(temperatureMax)}°
          </strong>
        </div>
      </div>

      {snowline ? <p className="snowline">{snowline}</p> : null}

      <h2 className="panel-section">Best zones · {mode === 'forecast' ? 'next 72 h' : 'right now'}</h2>
      <ul className="zone-list">
        {zones.map((zone) => (
          <li key={zone.name} title={zone.reason}>
            <span className="zone-swatch" style={{ background: powderColorForCm(zone.maxCm) }} />
            <span className="zone-name">{zone.name}</span>
            <span className="zone-cm">
              ~{zone.maxCm} <em>cm</em>
            </span>
          </li>
        ))}
      </ul>

      {outlook.length > 0 ? (
        <>
          <h2 className="panel-section">Outlook</h2>
          <div className="outlook-strip">
            {outlook.map((day) => (
              <div key={day.label} className="outlook-day">
                <span className="outlook-label">{day.label}</span>
                <strong className={day.snowCm >= 5 ? 'snowy' : ''}>{Math.round(day.snowCm)}cm</strong>
                <span>{Math.round(day.windKph)}km/h</span>
                <span>
                  {Math.round(day.minC)}°…{Math.round(day.maxC)}°
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="legend-bar-wrap">
        <div className="legend-bar" />
        <div className="legend-ticks">
          <span>5</span>
          <span>10</span>
          <span>20</span>
          <span>30</span>
          <span>40+ cm</span>
        </div>
      </div>
      <p className="legend-hint">
        {windFrom} wind loads sheltered {leeSide}-facing terrain. Hover a green patch for the local
        estimate.
      </p>

      <details className="why-details">
        <summary>Why these patches?</summary>
        <ul className="reason-list">
          <li>
            {mode === 'forecast' ? 'Forecast' : 'Recent'} {windFrom} wind transports snow onto sheltered{' '}
            {leeSide}-facing gullies and bowls; exposed {windFrom}-facing ridges are more likely scoured.
          </li>
          {latest.summary.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>

      <p className="disclaimer">
        Updated {formatDistanceToNow(generated, { addSuffix: true })} · recreational estimate only, powder
        never guaranteed. Check Mt Hutt reports and avalanche advisories.
      </p>
    </aside>
  )
}
