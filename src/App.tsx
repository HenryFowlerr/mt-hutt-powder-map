import { useEffect, useState } from 'react'
import { MountainScene } from './components/MountainScene'
import { Toolbar } from './components/Toolbar'
import { WeatherPanel } from './components/WeatherPanel'
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

  return (
    <main className="app-shell">
      <div className="map-stage">
        {data ? (
          <MountainScene terrain={data.terrain} trails={data.trails} latest={data.latest} />
        ) : (
          <div className="loading-state">
            <h1>Mt Hutt Powder Map</h1>
            <p>{error ?? 'Loading mountain data...'}</p>
          </div>
        )}
      </div>
      <Toolbar />
      {data ? <WeatherPanel latest={data.latest} /> : null}
    </main>
  )
}

export default App
