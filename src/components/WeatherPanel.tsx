import { formatDistanceToNow } from 'date-fns'
import { fieldMaxCm, powderColorForCm, type PowderField } from '../lib/powderModel'
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

const LEGEND_BANDS: Array<[string, number]> = [
  ['40+ cm', 41],
  ['30–40 cm', 31],
  ['20–30 cm', 21],
  ['10–20 cm', 11],
  ['5–10 cm', 6],
]

export function WeatherPanel({ latest, field }: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  const generated = new Date(latest.generatedAt)
  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'
  const maxCm = Math.round(fieldMaxCm(field, mode))
  const windFrom = windCompass(latest.summary.mainWindDirectionDeg)
  const leeSide = windCompass((latest.summary.mainWindDirectionDeg + 180) % 360)

  return (
    <aside className="weather-panel">
      <p className="panel-eyebrow">Mt Hutt powder model</p>
      <h1>Best powder estimate</h1>
      <p className="headline">{latest.summary.headline}</p>

      <div className="metric-grid">
        <div className="metric">
          <span>Recent snow</span>
          <strong>{Math.round(latest.summary.recentSnowCm)} cm</strong>
        </div>
        <div className="metric">
          <span>Forecast snow</span>
          <strong>{Math.round(latest.summary.forecastSnowCm)} cm</strong>
        </div>
        <div className="metric">
          <span>Wind</span>
          <strong>
            {windFrom} {Math.round(latest.summary.avgWindKph)}
            {latest.summary.maxGustKph ? ` g${Math.round(latest.summary.maxGustKph)}` : ''}
          </strong>
        </div>
        <div className="metric">
          <span>Temp</span>
          <strong>
            {Math.round(latest.summary.temperatureMinC)}° to {Math.round(latest.summary.temperatureMaxC)}°
          </strong>
        </div>
      </div>

      <h2 className="section-title">Why it is scoring this way</h2>
      <ul className="reason-list">
        <li>
          {windFrom} wind transports snow onto sheltered {leeSide}-facing terrain; exposed {windFrom}-facing
          ridges are more likely scoured.
        </li>
        {latest.summary.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h2 className="section-title">
        Expected {mode} powder · max ~{maxCm} cm · confidence {latest.summary.confidence}
      </h2>
      <ul className="powder-legend">
        {LEGEND_BANDS.map(([label, sampleCm]) => (
          <li key={label}>
            <span className="legend-swatch" style={{ background: powderColorForCm(sampleCm) }} />
            {label}
          </li>
        ))}
      </ul>
      <p className="legend-hint">Hover a green patch on the map for the local estimate and reason.</p>

      <p className="disclaimer">
        Updated {formatDistanceToNow(generated, { addSuffix: true })}. Recreational estimate only — powder is
        never guaranteed. Check Mt Hutt reports, patrol notices, closures, and avalanche information before
        skiing.
      </p>
    </aside>
  )
}
