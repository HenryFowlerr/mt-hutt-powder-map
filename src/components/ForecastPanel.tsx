import { useState } from 'react'
import { X } from 'lucide-react'
import { conditionsAdvice } from '../lib/advice'
import { useViewStore } from '../state/viewStore'
import type { DailyForecast } from '../types'

type Props = {
  daily: DailyForecast[]
}

function windCompass(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  return new Date(`${date}T12:00`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function ForecastPanel({ daily }: Props) {
  const forecastOpen = useViewStore((state) => state.forecastOpen)
  const toggleForecast = useViewStore((state) => state.toggleForecast)
  const [openDay, setOpenDay] = useState<string | null>(null)

  if (!forecastOpen) return null

  const maxSnow = Math.max(3, ...daily.map((day) => day.snowfallCm))

  return (
    <aside className="forecast-panel" aria-label="14 day forecast">
      <header className="forecast-header">
        <div>
          <p className="panel-eyebrow">Mt Hutt · aviation-grade</p>
          <h2>14-day forecast</h2>
        </div>
        <button type="button" className="forecast-close" onClick={toggleForecast} aria-label="Close forecast">
          <X size={18} />
        </button>
      </header>

      <p className="forecast-sub">Tap a day for detail. Snowfall bar scaled to the biggest day.</p>

      <ul className="forecast-days">
        {daily.map((day, index) => {
          const advice = conditionsAdvice({
            tempMinC: day.tempMinC,
            tempMaxC: day.tempMaxC,
            windKph: day.windMeanKph,
            gustKph: day.gustMaxKph,
            cloudPct: day.cloudPct,
            weatherCode: day.weatherCode,
            snowfallCm: day.snowfallCm,
            rainMm: day.rainMm,
          })
          const isOpen = openDay === day.date
          return (
            <li key={day.date} className={isOpen ? 'open' : ''}>
              <button
                type="button"
                className="forecast-day"
                onClick={() => setOpenDay(isOpen ? null : day.date)}
                aria-expanded={isOpen}
              >
                <span className="fd-icon">{advice.icon}</span>
                <span className="fd-label">{dayLabel(day.date, index)}</span>
                <span className="fd-bar-wrap">
                  <span
                    className="fd-bar"
                    style={{ width: `${(day.snowfallCm / maxSnow) * 100}%` }}
                  />
                </span>
                <span className={`fd-snow ${day.snowfallCm >= 3 ? 'snowy' : ''}`}>
                  {day.snowfallCm >= 0.5 ? `${Math.round(day.snowfallCm)}cm` : '—'}
                </span>
                <span className="fd-temp">
                  {Math.round(day.tempMinC)}° / {Math.round(day.tempMaxC)}°
                </span>
              </button>
              {isOpen ? (
                <div className="forecast-detail">
                  <p className="fd-note">
                    {advice.icon} {advice.sky} · {advice.note}
                  </p>
                  <div className="fd-grid">
                    <div>
                      <span>Snow</span>
                      <strong>{day.snowfallCm.toFixed(1)} cm</strong>
                    </div>
                    <div>
                      <span>Rain</span>
                      <strong>{day.rainMm.toFixed(1)} mm</strong>
                    </div>
                    <div>
                      <span>Wind</span>
                      <strong>
                        {windCompass(day.windDirectionDeg)} {day.windMeanKph}
                        <em> g{day.gustMaxKph}</em>
                      </strong>
                    </div>
                    <div>
                      <span>Cloud</span>
                      <strong>{day.cloudPct}%</strong>
                    </div>
                    <div>
                      <span>Freezing lvl</span>
                      <strong>{Math.round(day.freezingLevelM)} m</strong>
                    </div>
                    <div>
                      <span>Feels</span>
                      <strong>{advice.feelsLike}</strong>
                    </div>
                  </div>
                  <p className="fd-layers">
                    <strong>Wear:</strong> {advice.layers.join(' · ')}
                  </p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
