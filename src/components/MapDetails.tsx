import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { sampleElevation, terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
}

// Base-area orientation markers (carparks, base facilities), anchored off
// the real bottom station of Norwest Express so they georeference without
// hand-traced coordinates.

function liftBottom(trails: TrailCollection, name: string, terrain: TerrainData) {
  const feature = trails.features.find(
    (candidate) => candidate.properties.name === name && candidate.geometry.type === 'LineString',
  )
  if (!feature) return null
  const coords = feature.geometry.coordinates as number[][]
  const first = coords[0]
  const last = coords[coords.length - 1]
  return sampleElevation(first[0], first[1], terrain) < sampleElevation(last[0], last[1], terrain)
    ? first
    : last
}

export function MapDetails({ terrain, trails }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const showTrails = useViewStore((state) => state.showTrails)

  const markers = useMemo(() => {
    const base = liftBottom(trails, 'Norwest Express', terrain) ?? liftBottom(trails, 'Summit Six Chair', terrain)
    if (!base) return []
    const [baseLon, baseLat] = base

    const items: Array<{ key: string; lon: number; lat: number; className: string; text: string; lift: number }> = [
      { key: 'base', lon: baseLon, lat: baseLat, className: 'map-marker base', text: '⌂', lift: 0.05 },
      { key: 'carpark-1', lon: baseLon + 0.0014, lat: baseLat - 0.001, className: 'map-marker carpark', text: 'P', lift: 0.04 },
      { key: 'carpark-2', lon: baseLon + 0.0032, lat: baseLat - 0.0024, className: 'map-marker carpark', text: 'P', lift: 0.04 },
    ]
    return items.map((item) => {
      const position = terrainPoint(item.lon, item.lat, terrain, exaggeration)
      position.y += item.lift
      return { ...item, position }
    })
  }, [trails, terrain, exaggeration])

  if (!showTrails) return null

  return (
    <group>
      {markers.map((marker) => (
        <Html
          key={marker.key}
          position={marker.position}
          center
          zIndexRange={[3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className={marker.className}>{marker.text}</span>
        </Html>
      ))}
    </group>
  )
}
