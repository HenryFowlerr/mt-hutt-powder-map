import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { sampleElevation, terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
  overrides?: TrailCollection | null
}

// Base-area details. When public/data/map-overrides.geojson (real OSM
// parking polygons, access road, base buildings) is present it is rendered
// directly; otherwise carparks fall back to offsets from the Norwest
// Express bottom station toward the south-west, where the access road
// actually arrives (verified against the official map).

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

function polygonCentroid(ring: number[][]) {
  let lon = 0
  let lat = 0
  for (const [x, y] of ring) {
    lon += x
    lat += y
  }
  return [lon / ring.length, lat / ring.length]
}

export function MapDetails({ terrain, trails, overrides }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const showTrails = useViewStore((state) => state.showTrails)

  const overrideLayers = useMemo(() => {
    if (!overrides) return null
    const roads: THREE.Vector3[][] = []
    const parkingOutlines: THREE.Vector3[][] = []
    const parkingMarkers: Array<{ lon: number; lat: number }> = []
    const buildings: THREE.Vector3[][] = []

    for (const feature of overrides.features) {
      const kind = feature.properties.kind as unknown as string
      if (kind === 'road' && feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates as number[][]
        roads.push(
          coords.map(([lon, lat]) => {
            const point = terrainPoint(lon, lat, terrain, exaggeration)
            point.y += 0.01
            return point
          }),
        )
      }
      if (feature.geometry.type === 'Polygon') {
        const ring = (feature.geometry.coordinates as number[][][])[0]
        const points = ring.map(([lon, lat]) => {
          const point = terrainPoint(lon, lat, terrain, exaggeration)
          point.y += 0.012
          return point
        })
        if (kind === 'parking') {
          parkingOutlines.push(points)
          const [lon, lat] = polygonCentroid(ring)
          parkingMarkers.push({ lon, lat })
        } else if (kind === 'building') {
          buildings.push(points)
        }
      }
    }
    return { roads, parkingOutlines, parkingMarkers, buildings }
  }, [overrides, terrain, exaggeration])

  const fallbackMarkers = useMemo(() => {
    if (overrideLayers && overrideLayers.parkingMarkers.length > 0) return []
    const base = liftBottom(trails, 'Norwest Express', terrain) ?? liftBottom(trails, 'Summit Six Chair', terrain)
    if (!base) return []
    const [baseLon, baseLat] = base
    return [
      { lon: baseLon - 0.0006, lat: baseLat - 0.001 },
      { lon: baseLon - 0.0018, lat: baseLat - 0.002 },
    ]
  }, [overrideLayers, trails, terrain])

  const baseMarker = useMemo(() => {
    const base = liftBottom(trails, 'Norwest Express', terrain) ?? liftBottom(trails, 'Summit Six Chair', terrain)
    if (!base) return null
    const position = terrainPoint(base[0], base[1], terrain, exaggeration)
    position.y += 0.05
    return position
  }, [trails, terrain, exaggeration])

  if (!showTrails) return null

  return (
    <group>
      {overrideLayers?.roads.map((points, index) => (
        <Line
          key={`road-${index}`}
          points={points}
          color="#8a8378"
          lineWidth={2}
          transparent
          opacity={0.75}
          renderOrder={3}
        />
      ))}
      {overrideLayers?.parkingOutlines.map((points, index) => (
        <Line
          key={`parking-${index}`}
          points={[...points, points[0]]}
          color="#4a6f96"
          lineWidth={1.6}
          transparent
          opacity={0.8}
          renderOrder={3}
        />
      ))}
      {overrideLayers?.buildings.map((points, index) => (
        <Line
          key={`building-${index}`}
          points={[...points, points[0]]}
          color="#3d454b"
          lineWidth={2.2}
          transparent
          opacity={0.85}
          renderOrder={3}
        />
      ))}
      {(overrideLayers?.parkingMarkers.length ? overrideLayers.parkingMarkers : fallbackMarkers).map(
        (marker, index) => {
          const position = terrainPoint(marker.lon, marker.lat, terrain, exaggeration)
          position.y += 0.04
          return (
            <Html
              key={`carpark-${index}`}
              position={position}
              center
              zIndexRange={[3, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <span className="map-marker carpark">P</span>
            </Html>
          )
        },
      )}
      {baseMarker ? (
        <Html position={baseMarker} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="map-marker base">⌂</span>
        </Html>
      ) : null}
    </group>
  )
}
