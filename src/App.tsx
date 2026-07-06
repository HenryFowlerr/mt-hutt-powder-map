import { useEffect, useMemo, useState } from 'react'
import { MountainScene } from './components/MountainScene'
import { Toolbar } from './components/Toolbar'
import { WeatherPanel } from './components/WeatherPanel'
import { buildPowderField, type PowderWeather } from './lib/powderModel'
import { analyzeTerrain } from './lib/terrainAnalysis'
import type { LatestData, TerrainData, TrailCollection } from './types'
import './index.css'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      loadJson<TerrainData>('data/terrain.json'),
      loadJson<TrailCollection>('data/trails.geojson'),
      loadJson<LatestData>('data/latest.json'),
    ])
      .then(([terrain, trails, latest]) => setData({ terrain, trails, latest }))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Data failed to load')
      })
  }, [])

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
      temperatureMaxC: data.latest.summary.temperatureMaxC,
      temperatureMinC: data.latest.summary.temperatureMinC,
    }
    const field = buildPowderField(data.terrain, analysis, weather)
    return { analysis, weather, field }
  }, [data])

  return (
    <main className="app-shell">
      <div className="map-stage">
        {data && derived ? (
          <MountainScene
            terrain={data.terrain}
            trails={data.trails}
            analysis={derived.analysis}
            field={derived.field}
            weather={derived.weather}
          />
        ) : (
          <div className="loading-state">
            <h1>Mt Hutt Powder Map</h1>
            <p>{error ?? 'Loading mountain data...'}</p>
          </div>
        )}
      </div>
      <Toolbar />
      {data && derived ? <WeatherPanel latest={data.latest} field={derived.field} /> : null}
    </main>
  )
}

export default App
