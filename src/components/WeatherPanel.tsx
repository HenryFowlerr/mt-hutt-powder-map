import { formatDistanceToNow } from 'date-fns'
import { fieldMaxCm, type PowderField } from '../lib/powderModel'
import { useViewStore } from '../state/viewStore'
import type { LatestData } from '../types'

type Props = {
  latest: LatestData
  field: PowderField
}

function windCompass(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

export function WeatherPanel({ latest, field }: Props) {
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
