import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { WeatherBrief } from './components/WeatherBrief'
import { ForecastPanel } from './components/ForecastPanel'
import { BrandHeader } from './components/BrandHeader'
import { MapLegend } from './components/MapLegend'
import { MapErrorBoundary } from './components/MapErrorBoundary'
import { InspectorNav } from './components/InspectorNav'
import { LayersPanel } from './components/LayersPanel'
import { buildPowderField, type PowderWeather } from './lib/powderModel'
import { buildIceField, type IceWeather } from './lib/iceModel'
import { analyzeTerrain } from './lib/terrainAnalysis'
import { applyTrailOverrides } from './lib/trailOverrides'
import type { LatestData, TerrainData, TrailCollection } from './types'
import { useViewStore } from './state/viewStore'
import './index.css'

const MountainScene = lazy(() =>
  import('./components/MountainScene').then((module) => ({ default: module.MountainScene })),
)

type AppData = {
  terrain: TerrainData
  trails: TrailCollection
  latest: LatestData
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [overrides, setOverrides] = useState<TrailCollection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const inspectorView = useViewStore((state) => state.inspectorView)
  const inspectorScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inspectorScrollRef.current?.scrollTo({ top: 0 })
  }, [inspectorView])

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([
      loadJson<TerrainData>('data/terrain.json'),
      loadJson<TrailCollection>('data/trails.geojson'),
      loadJson<LatestData>('data/latest.json'),
    ])
      .then(([terrain, trails, latest]) => {
        if (!cancelled) {
          setData({ terrain, trails: applyTrailOverrides(trails), latest })
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Data failed to load')
        }
      })
    // Optional base-area detail layer (real carparks/road/buildings from OSM).
    loadJson<TrailCollection>('data/map-overrides.geojson')
      .then((nextOverrides) => {
        if (!cancelled) setOverrides(nextOverrides)
      })
      .catch(() => {
        if (!cancelled) setOverrides(null)
      })
    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  // Terrain analysis and the powder field are computed once per data load
  // and shared by the 3D scene and the side panel.
  const derived = useMemo(() => {
    if (!data) return null
    const analysis = analyzeTerrain(data.terrain, data.trails)
    const weather: PowderWeather = {
      recentSnowCm: data.latest.summary.recentSnowCm,
      forecastSnowCm: data.latest.summary.forecastSnowCm,
      mainWindDirectionDeg: data.latest.summary.mainWindDirectionDeg,
      avgWindKph: data.latest.summary.avgWindKph,
      maxGustKph: data.latest.summary.maxGustKph,
      forecastWindDirectionDeg: data.latest.summary.forecastWindDirectionDeg,
      forecastAvgWindKph: data.latest.summary.forecastAvgWindKph,
      forecastMaxGustKph: data.latest.summary.forecastMaxGustKph,
      forecastTemperatureMaxC: data.latest.summary.forecastTemperatureMaxC,
      forecastTemperatureMinC: data.latest.summary.forecastTemperatureMinC,
      forecastFreezingLevelM: data.latest.summary.forecastFreezingLevelM,
      forecastRainMm: data.latest.summary.forecastRainMm,
      forecastHoursAboveZero: data.latest.summary.forecastHoursAboveZero,
      temperatureMaxC: data.latest.summary.temperatureMaxC,
      temperatureMinC: data.latest.summary.temperatureMinC,
      cloudLowPct: data.latest.summary.cloudLowPct,
      cloudMidPct: data.latest.summary.cloudMidPct,
      cloudHighPct: data.latest.summary.cloudHighPct,
      freezingLevelM: data.latest.summary.recentFreezingLevelM ?? data.latest.summary.freezingLevelM,
      recentRainMm: data.latest.summary.recentRainMm,
      hoursAboveZero: data.latest.summary.hoursAboveZero,
      hoursSinceSnow: data.latest.summary.hoursSinceSnow,
      meltFreezeCycles: data.latest.summary.meltFreezeCycles,
    }
    const field = buildPowderField(data.terrain, analysis, weather)
    const iceWeather: IceWeather = {
      temperatureMaxC: data.latest.summary.temperatureMaxC,
      temperatureMinC: data.latest.summary.temperatureMinC,
      meltFreezeCycles: data.latest.summary.meltFreezeCycles ?? 0,
      recentRainMm: data.latest.summary.recentRainMm ?? 0,
      hoursAboveZero: data.latest.summary.hoursAboveZero ?? 0,
      hoursSinceSnow: data.latest.summary.hoursSinceSnow ?? 999,
      freezingLevelM: data.latest.summary.freezingLevelM,
    }
    const iceField = buildIceField(data.terrain, analysis, iceWeather)
    return { analysis, weather, field, iceWeather, iceField }
  }, [data])

  return (
    <main className="app-shell">
      <header className="workspace-header">
        <BrandHeader generatedAt={data?.latest.generatedAt} />
        <Toolbar />
      </header>
      <div className="workspace-body">
        <section className="map-stage" aria-label="Interactive Mt Hutt terrain map">
          {data && derived ? (
            <MapErrorBoundary>
              <Suspense
                fallback={
                  <div className="loading-state" role="status">
                    <h1>Preparing terrain</h1>
                    <p>Loading the interactive mountain map…</p>
                  </div>
                }
              >
                <MountainScene
                  terrain={data.terrain}
                  trails={data.trails}
                  analysis={derived.analysis}
                  field={derived.field}
                  weather={derived.weather}
                  iceField={derived.iceField}
                  iceWeather={derived.iceWeather}
                  overrides={overrides}
                />
              </Suspense>
            </MapErrorBoundary>
          ) : (
            <div className="loading-state" role="status">
              <h1>Mt Hutt Powder Map</h1>
              <p>{error ?? 'Loading mountain data...'}</p>
              {error ? (
                <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                  Try again
                </button>
              ) : null}
            </div>
          )}
          {derived ? <MapLegend field={derived.field} /> : null}
        </section>

        <aside className="inspector-shell" aria-label="Mountain information">
          <InspectorNav />
          <div ref={inspectorScrollRef} className="inspector-scroll">
            {inspectorView === 'brief' && data && derived ? (
              <WeatherBrief
                latest={data.latest}
                field={derived.field}
                terrain={data.terrain}
                analysis={derived.analysis}
                trails={data.trails}
                weather={derived.weather}
                iceField={derived.iceField}
              />
            ) : null}
            {inspectorView === 'forecast' && data?.latest.daily ? (
              <ForecastPanel daily={data.latest.daily} />
            ) : null}
            {inspectorView === 'layers' ? <LayersPanel /> : null}
          </div>
        </aside>
      </div>
    </main>
  )
}

export default App
