import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { trailColor } from '../lib/colors'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection, TrailFeature } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
}

function linePoints(feature: TrailFeature, terrain: TerrainData, exaggeration: number) {
  if (feature.geometry.type !== 'LineString') return []
  return (feature.geometry.coordinates as number[][]).map(([lon, lat]) => {
    const point = terrainPoint(lon, lat, terrain, exaggeration)
    point.y += feature.properties.kind === 'lift' ? 0.08 : 0.055
    return point
  })
}

function TrailLine({ feature, terrain }: { feature: TrailFeature; terrain: TerrainData }) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const points = useMemo(() => linePoints(feature, terrain, exaggeration), [feature, terrain, exaggeration])
  const isLift = feature.properties.kind === 'lift'
  const isBoundary = feature.properties.kind === 'boundary'
  const color = trailColor(feature.properties.difficulty, feature.properties.color)
  const mid = points[Math.floor(points.length / 2)]

  if (points.length < 2) return null

  return (
    <group>
      <Line points={points} color={color} lineWidth={isLift ? 2.8 : 2} transparent opacity={isBoundary ? 0.78 : 0.94} />
      {feature.properties.label && mid ? (
        <Html position={[mid.x, mid.y + 0.18, mid.z]} center distanceFactor={9}>
          <span className="scene-label">{feature.properties.name}</span>
        </Html>
      ) : null}
    </group>
  )
}

export function TrailOverlay({ terrain, trails }: Props) {
  const showTrails = useViewStore((state) => state.showTrails)
  if (!showTrails) return null

  return (
    <group>
      {trails.features.map((feature, index) => (
        <TrailLine key={`${feature.properties.name}-${index}`} feature={feature} terrain={terrain} />
      ))}
    </group>
  )
}
