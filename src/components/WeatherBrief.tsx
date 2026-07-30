import { formatDistanceToNow } from 'date-fns'
import { useMemo } from 'react'
import { ChevronRight, ExternalLink, Info, ShieldAlert } from 'lucide-react'
import { conditionsAdvice } from '../lib/advice'
import { assessForecastConfidence } from '../lib/forecastConfidence'
import { assessRecentTerrainSignal } from '../lib/recentTerrainSignal'
import { fieldMaxRisk, iceRiskLabel, type IceField } from '../lib/iceModel'
import { buildAspectRose, buildElevationBands, buildSnowTimeline, pickBestDay } from '../lib/insights'
import { fieldMaxCm, powderColorForCm, type PowderField, type PowderWeather } from '../lib/powderModel'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import { buildZoneSummaries } from '../lib/zoneSummary'
import { useViewStore } from '../state/viewStore'
import type {
  EnsembleSnowfallSummary,
  LatestData,
  TerrainData,
  TrailCollection,
  WeatherHour,
} from '../types'
import { WindArcIcon } from './AlpineIcons'
import { Meteocon } from './Meteocon'

type Props = {
  latest: LatestData
  field: PowderField
  terrain: TerrainData
  analysis: TerrainAnalysis
  trails: TrailCollection
  weather: PowderWeather
  iceField: IceField
}

type DayOutlook = {
  label: string
  snowCm: number
  windKph: number
  minC: number
  maxC: number
}

function windCompass(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(degrees / 45) % 8]
}

function formatSnowDepth(value: number) {
  if (value > 0 && value < 1) return value.toFixed(1)
  return String(Math.round(value))
}

function formatSnowRange(range: { min: number; max: number }) {
  return `${formatSnowDepth(range.min)}–${formatSnowDepth(range.max)}`
}

function ensembleAgreementCopy(
  ensemble: EnsembleSnowfallSummary | undefined,
  primarySnowCm: number,
) {
  if (!ensemble) return null
  const medianCm = ensemble.snowfallCm.p50
  const relativeGap =
    Math.abs(primarySnowCm - medianCm) / Math.max(1, primarySnowCm, medianCm)
  const agreement =
    relativeGap <= 0.25 ? 'Close model agreement' : relativeGap <= 0.6 ? 'Mixed model agreement' : 'Low model agreement'
  const probability =
    medianCm >= 10
      ? { threshold: 10, value: ensemble.probabilityPct.atLeast10Cm }
      : medianCm >= 5
        ? { threshold: 5, value: ensemble.probabilityPct.atLeast5Cm }
        : { threshold: 1, value: ensemble.probabilityPct.atLeast1Cm }

  return `${agreement} · ensemble median ${formatSnowDepth(medianCm)} cm · ${Math.round(probability.value)}% chance of at least ${probability.threshold} cm mountain-wide`
}

function stormTime(value: string | undefined) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-NZ', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

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
    if (hours.length < 4) continue
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

function freezingCopy(level: number | undefined) {
  if (!level) return null
  if (level < 1450) return `Snow to the access road · freezing level ${Math.round(level)} m`
  if (level < 1900) return `Drier snow up high · freezing level ${Math.round(level)} m`
  return `Warm lower mountain · freezing level ${Math.round(level)} m`
}

function temperatureAtElevation(temperatureC: number, elevationM: number) {
  return temperatureC - (elevationM - 1600) * 0.0065
}

function surfaceLabel(elevationM: number, freezingLevelM: number | undefined, maxC: number) {
  const localMax = temperatureAtElevation(maxC, elevationM)
  if (freezingLevelM !== undefined && elevationM < freezingLevelM - 120) return 'Wet / mixed'
  if (localMax <= -2) return 'Dry snow'
  if (localMax <= 0.5) return 'Snow'
  return 'Softening'
}

export function WeatherBrief({ latest, field, terrain, analysis, trails, weather, iceField }: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  const setPowderMode = useViewStore((state) => state.setPowderMode)
  const showIce = useViewStore((state) => state.showIce)
  const focusOn = useViewStore((state) => state.focusOn)
  const setInspectorView = useViewStore((state) => state.setInspectorView)
  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'
  const generated = new Date(latest.generatedAt)
  const isStale = Date.now() - generated.getTime() > 24 * 60 * 60 * 1000
  const maxCm = fieldMaxCm(field, mode)
  const snowCm = mode === 'forecast' ? latest.summary.forecastSnowCm : latest.summary.recentSnowCm
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

  const zones = useMemo(
    () => buildZoneSummaries(terrain, analysis, field, weather, trails, mode).slice(0, 4),
    [terrain, analysis, field, weather, trails, mode],
  )
  const outlook = useMemo(() => buildOutlook(latest.forecast ?? []), [latest.forecast])
  const bestDay = useMemo(() => pickBestDay(outlook), [outlook])
  const timeline = useMemo(
    () => buildSnowTimeline(latest.observations ?? [], latest.forecast ?? []),
    [latest.observations, latest.forecast],
  )
  const timelineMax = Math.max(1, ...timeline.map((bucket) => bucket.snowCm))
  const rose = useMemo(() => buildAspectRose(analysis, field, mode), [analysis, field, mode])
  const elevationBands = useMemo(
    () => buildElevationBands(terrain, analysis, field, mode),
    [terrain, analysis, field, mode],
  )
  const advice = useMemo(
    () =>
      conditionsAdvice({
        tempMinC: temperatureMin,
        tempMaxC: temperatureMax,
        windKph: windSpeed,
        gustKph: windGust,
        cloudPct: latest.summary.cloudMeanPct ?? latest.summary.cloudLowPct ?? 60,
        snowfallCm: snowCm,
        rainMm:
          mode === 'forecast'
            ? (latest.summary.forecastRainMm ?? latest.summary.recentRainMm)
            : latest.summary.recentRainMm,
      }),
    [latest.summary, mode, snowCm, temperatureMax, temperatureMin, windGust, windSpeed],
  )
  const effectiveFreezingLevel =
    mode === 'forecast'
      ? (latest.summary.forecastFreezingLevelM ?? latest.summary.freezingLevelM)
      : latest.summary.freezingLevelM
  const snowline = freezingCopy(effectiveFreezingLevel)
  const stormStart = stormTime(latest.summary.stormStartAt)
  const stormEnd = stormTime(latest.summary.stormEndAt)
  const mountainProfile = [
    { label: 'Summit', elevation: 2066 },
    { label: 'Mid', elevation: 1820 },
    { label: 'Base', elevation: 1606 },
  ].map((point) => ({
    ...point,
    minC: Math.round(temperatureAtElevation(temperatureMin, point.elevation)),
    maxC: Math.round(temperatureAtElevation(temperatureMax, point.elevation)),
    surface: surfaceLabel(point.elevation, effectiveFreezingLevel, temperatureMax),
  }))
  const forecastAssessment =
    mode === 'forecast'
      ? assessForecastConfidence({
          forecastSnowCm: maxCm,
          ensembleSnowfallCm: latest.ensemble
            ? {
                ...latest.ensemble.snowfallCm,
                memberCount: latest.ensemble.memberCount,
              }
            : undefined,
          generatedAt: latest.ensemble?.generatedAt ?? latest.generatedAt,
          forecastHours: latest.forecast,
          expectedHorizonHours: latest.ensemble?.windowHours,
          forecastTemperatureMaxC: latest.summary.forecastTemperatureMaxC,
          forecastFreezingLevelM:
            latest.summary.forecastFreezingLevelM ?? latest.summary.freezingLevelM,
          forecastRainMm: latest.summary.forecastRainMm,
          forecastHoursAboveZero: latest.summary.forecastHoursAboveZero,
          forecastAvgWindKph:
            latest.summary.forecastAvgWindKph ?? latest.summary.avgWindKph,
          forecastMaxGustKph:
            latest.summary.forecastMaxGustKph ?? latest.summary.maxGustKph,
          windDirectionSpreadDeg: latest.summary.windDirectionSpreadDeg,
        })
      : null
  const forecastRange =
    forecastAssessment?.rangeCm ?? (mode === 'forecast' ? { min: maxCm, max: maxCm } : null)
  const confidenceDrivers =
    forecastAssessment?.drivers
      .filter((driver) => driver.effect === 'limits' && driver.code !== 'ensemble')
      .slice(0, 2) ?? []
  const confidenceDriverCopy =
    confidenceDrivers.length > 0
      ? confidenceDrivers.map((driver) => driver.message).join(' ')
      : forecastAssessment?.drivers[0]?.message
  const ensembleAgreement = ensembleAgreementCopy(
    latest.ensemble,
    latest.summary.forecastSnowCm,
  )
  const recentTerrainSignal = assessRecentTerrainSignal({
    recentSnowCm: latest.summary.recentSnowCm,
    generatedAt: latest.generatedAt,
    recentHours: latest.observations,
  })
  const forecastConfidence = forecastAssessment?.level ?? 'low'
  const recentSignalTone =
    recentTerrainSignal.strength === 'strong'
      ? 'high'
      : recentTerrainSignal.strength === 'moderate' || recentTerrainSignal.strength === 'trace'
        ? 'medium'
        : 'low'
  const statusTone = mode === 'forecast' ? forecastConfidence : recentSignalTone

  return (
    <section className="brief-view" aria-label="Mt Hutt snow brief">
      <div className="brief-content">
        <div className="brief-topline">
          <span>Snow brief</span>
          <span
            className={`model-status ${statusTone}`}
            aria-label={
              mode === 'forecast'
                ? `Forecast confidence ${forecastConfidence}`
                : `Recent terrain signal ${recentTerrainSignal.strength}. Data quality ${recentTerrainSignal.dataQuality}; ${recentTerrainSignal.coverageHours} of ${recentTerrainSignal.expectedHours} recent model hours.`
            }
            title={mode === 'recent' ? recentTerrainSignal.reason : undefined}
          >
            <i />
            {mode === 'forecast'
              ? `Forecast · ${forecastConfidence} confidence`
              : `Terrain signal · ${recentTerrainSignal.strength}${
                  recentTerrainSignal.dataQuality === 'low' ? ' · stale or incomplete' : ''
                }`}
          </span>
        </div>

        <div className="mode-switch" role="group" aria-label="Snow estimate timeframe">
          <button
            type="button"
            className={mode === 'recent' ? 'active' : ''}
            onClick={() => {
              if (mode !== 'recent') setPowderMode('recent')
            }}
            aria-pressed={mode === 'recent'}
          >
            Last 72 hours
          </button>
          <button
            type="button"
            className={mode === 'forecast' ? 'active' : ''}
            onClick={() => {
              if (mode !== 'forecast') setPowderMode('forecast')
            }}
            aria-pressed={mode === 'forecast'}
          >
            Next 72 hours
          </button>
        </div>

        <a
          className="official-status-link"
          href="https://www.mthutt.co.nz/weather-report/"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          <span>Check official live mountain, road &amp; lift status</span>
        </a>

        <section className="depth-hero" aria-live="polite">
          <p>{mode === 'forecast' ? 'Likely deepest modelled pocket' : 'Deepest modelled pocket'}</p>
          <div
            className={`depth-reading ${mode === 'forecast' ? 'range-reading' : ''}`}
            aria-label={
              forecastRange
                ? `Likely deepest modelled pocket ${formatSnowRange(forecastRange)} centimetres, centred on ${formatSnowDepth(maxCm)} centimetres`
                : `Deepest modelled pocket ${formatSnowDepth(maxCm)} centimetres`
            }
          >
            <strong>
              {forecastRange ? formatSnowRange(forecastRange) : formatSnowDepth(maxCm)}
            </strong>
            <span>cm</span>
          </div>
          <p className="depth-context">
            {maxCm > 0
              ? `About ${formatSnowDepth(snowCm)} cm mountain-wide · ${leeSide}-facing terrain favoured`
              : mode === 'recent'
                ? 'No meaningful fresh accumulation yet'
                : 'No meaningful accumulation in this window'}
          </p>
          {forecastAssessment ? (
            <div
              className="forecast-confidence-read"
              aria-label={`${forecastAssessment.level} forecast confidence. ${confidenceDriverCopy ?? ''} ${ensembleAgreement ?? ''}`}
            >
              <div>
                <strong>{forecastAssessment.level} confidence</strong>
                <span>
                  Centred on {formatSnowDepth(maxCm)} cm
                  {latest.ensemble ? ` · ${latest.ensemble.memberCount} forecast runs` : ''}
                </span>
              </div>
              {confidenceDriverCopy ? <p>{confidenceDriverCopy}</p> : null}
              {ensembleAgreement ? <small>{ensembleAgreement}</small> : null}
            </div>
          ) : null}
        </section>

        {mode === 'forecast' && stormStart && stormEnd ? (
          <div className="storm-window-read" aria-label={`Forecast storm window ${stormStart} to ${stormEnd}`}>
            <span>
              <small>Storm window</small>
              <strong>{stormStart} → {stormEnd}</strong>
            </span>
            <span>
              <small>Peak hour</small>
              <strong>{(latest.summary.stormPeakSnowCm ?? 0).toFixed(1)} cm</strong>
            </span>
          </div>
        ) : null}

        {bestDay ? (
          <button type="button" className="ski-window" onClick={() => setInspectorView('forecast')}>
            <span>
              <small>Best window</small>
              <strong>{bestDay.label}</strong>
            </span>
            <span>{bestDay.reason}</span>
            <ChevronRight size={17} />
          </button>
        ) : null}

        <div className="brief-metrics">
          <div>
            <span>Air</span>
            <strong>
              {Math.round(temperatureMin)}° <i /> {Math.round(temperatureMax)}°
            </strong>
          </div>
          <div>
            <span>{mode === 'forecast' ? 'Storm wind' : 'Event wind'}</span>
            <strong>
              {windFrom} {Math.round(windSpeed)}
              <small>{windGust ? `Gust ${Math.round(windGust)} km/h` : 'km/h'}</small>
            </strong>
          </div>
          <div>
            <span>Fresh snow</span>
            <strong>{formatSnowDepth(snowCm)} cm</strong>
          </div>
        </div>

        <div className="condition-line">
          <span className="condition-glyph">
            <Meteocon condition={advice.sky} size={58} className="primary-meteocon" />
          </span>
          <span>
            <strong>{advice.sky}</strong>
            <small>{advice.feelsLike} · {snowline ?? advice.note}</small>
          </span>
        </div>

        <section className="mountain-profile" aria-label="Conditions by mountain elevation">
          <div className="profile-heading">
            <span>By elevation</span>
            <strong>
              {effectiveFreezingLevel !== undefined
                ? `${Math.round(effectiveFreezingLevel)} m freezing`
                : 'Freezing level unavailable'}
            </strong>
          </div>
          <div className="profile-grid">
            {mountainProfile.map((point) => (
              <div key={point.label}>
                <span>{point.label} · {point.elevation} m</span>
                <strong>{point.minC}° / {point.maxC}°</strong>
                <small>{point.surface}</small>
              </div>
            ))}
          </div>
        </section>

        {showIce ? (
          <div className="ice-callout">
            <ShieldAlert size={16} />
            <span>
              <strong>Surface watch</strong>
              {fieldMaxRisk(iceField) < 0.2
                ? 'Fresh snow should cover most old surfaces.'
                : `${iceRiskLabel(fieldMaxRisk(iceField))} hardpack risk in blue areas.`}
            </span>
          </div>
        ) : null}

        <section className="zone-section">
          <div className="section-heading">
            <div>
              <span>Terrain signal</span>
              <h2>Where to look</h2>
            </div>
            <span>{mode === 'forecast' ? '72 h forecast' : 'Now'}</span>
          </div>
          <ol className="zone-rank">
            {zones.map((zone, index) => (
              <li key={zone.name}>
                <button type="button" onClick={() => focusOn(zone.anchorLon, zone.anchorLat)}>
                  <span className="zone-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="zone-title">
                    <strong>{zone.name}</strong>
                    <small>{zone.reason.split('.')[0]}</small>
                  </span>
                  <span className="zone-depth">
                    <i style={{ background: powderColorForCm(zone.maxCm) }} />
                    {zone.maxCm} cm
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {outlook.length > 0 ? (
          <section className="outlook-section">
            <div className="section-heading">
              <div>
                <span>Five-day read</span>
                <h2>The week</h2>
              </div>
              <button type="button" onClick={() => setInspectorView('forecast')}>14 days</button>
            </div>
            <div className="week-strip">
              {outlook.map((day) => (
                <div key={day.label} className={bestDay?.label === day.label ? 'best' : ''}>
                  <span>{day.label}</span>
                  <strong>{Math.round(day.snowCm)}<small>cm</small></strong>
                  <em>{Math.round(day.minC)}° / {Math.round(day.maxC)}°</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <details className="model-detail">
          <summary>
            <span>
              <Info size={16} />
              Inside the model
            </span>
            <ChevronRight size={16} />
          </summary>
          <div className="model-detail-body">
            {timeline.length > 0 ? (
              <section>
                <h3>Storm pulse</h3>
                <div className="timeline premium" aria-label="Snowfall timeline">
                  {timeline.map((bucket, index) => (
                    <i
                      key={`${bucket.label}-${index}`}
                      className={bucket.future ? 'future' : ''}
                      title={`${bucket.label} · ${bucket.snowCm.toFixed(1)} cm`}
                      style={{ height: `${Math.max(5, (bucket.snowCm / timelineMax) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="timeline-axis"><span>-72 h</span><span>Now</span><span>+72 h</span></div>
              </section>
            ) : null}

            <section>
              <h3>Wind loading</h3>
              <div className="loading-read">
                <WindArcIcon size={24} />
                <span><strong>{windFrom} wind</strong><small>{leeSide}-facing terrain holds the better chance of drifted snow.</small></span>
              </div>
              <div className="aspect-bars">
                {rose.meanCm.map((cm, index) => (
                  <span key={rose.labels[index]}>
                    <i style={{ height: `${Math.max(5, (cm / rose.maxCm) * 100)}%`, background: powderColorForCm(cm) }} />
                    <small>{rose.labels[index]}</small>
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h3>Snow by elevation</h3>
              <div className="elevation-list">
                {elevationBands.map((band) => (
                  <div key={band.label}>
                    <span>{band.label}</span>
                    <strong>{band.meanCm} cm avg</strong>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3>Why the map looks this way</h3>
              <p>{mode === 'forecast' ? 'Forecast' : 'Recent'} {windFrom} wind loads sheltered {leeSide}-facing bowls and gullies while exposed ridges are more likely to scour.</p>
              {mode === 'forecast' && latest.summary.windDirectionSpreadDeg !== undefined ? (
                <p className="model-calibration">
                  Wind direction spread: {Math.round(latest.summary.windDirectionSpreadDeg)}° · wider shifts reduce terrain certainty.
                </p>
              ) : null}
            </section>
          </div>
        </details>

        <footer className="brief-footer">
          <p>
            <span>Updated {formatDistanceToNow(generated, { addSuffix: true })}</span>
            {isStale ? <strong>Data may be stale</strong> : null}
          </p>
          <div>
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Weather data by Open-Meteo <ExternalLink size={12} />
            </a>
            <a href="https://www.avalanche.net.nz/" target="_blank" rel="noreferrer">
              Avalanche advisory <ExternalLink size={12} />
            </a>
          </div>
          <small>Experimental terrain model. Never a safety or access decision.</small>
        </footer>
      </div>
    </section>
  )
}
