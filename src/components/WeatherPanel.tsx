import { formatDistanceToNow } from 'date-fns'
import type { LatestData } from '../types'

type Props = {
  latest: LatestData
}

function windCompass(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

export function WeatherPanel({ latest }: Props) {
  const generated = new Date(latest.generatedAt)
  const maxExpectedSnow = Math.max(5, ...latest.powderGrid.map((point) => point.expectedSnowCm ?? 0))
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
            {windCompass(latest.summary.mainWindDirectionDeg)} {Math.round(latest.summary.avgWindKph)}
          </strong>
        </div>
        <div className="metric">
          <span>Confidence</span>
          <strong>{latest.summary.confidence}</strong>
        </div>
      </div>

      <h2 className="section-title">Why it is scoring this way</h2>
      <ul className="reason-list">
        {latest.summary.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h2 className="section-title">New snow scale</h2>
      <div className="snow-scale">
        <div className="snow-ramp" />
        <div className="snow-scale-labels">
          <strong>{maxExpectedSnow} cm</strong>
          <span>deeper loaded pockets</span>
          <span>lighter new snow</span>
          <strong>0 cm</strong>
        </div>
      </div>

      <p className="disclaimer">
        Updated {formatDistanceToNow(generated, { addSuffix: true })}. Recreational estimate only. Check Mt Hutt
        reports, patrol notices, closures, and avalanche information before skiing.
      </p>
    </aside>
  )
}
