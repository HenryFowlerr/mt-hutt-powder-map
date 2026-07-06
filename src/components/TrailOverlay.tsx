import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BOUNDARY_COLOR, LIFT_CASING, LIFT_COLOR, trailColor } from '../lib/colors'
import { METERS_PER_DEGREE_LAT, metersPerDegreeLon } from '../lib/geo'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection, TrailFeature } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
}

// Densify sparse OSM linestrings (~every 35 m) so lines drape along the
// terrain surface instead of cutting through rolls and gullies.
function densifiedPoints(
  coords: number[][],
  terrain: TerrainData,
  exaggeration: number,
  heightOffset: number,
) {
  const mLon = metersPerDegreeLon((terrain.bounds.south + terrain.bounds.north) / 2)
  const stepMeters = 35
  const points: THREE.Vector3[] = []

  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lon0, lat0] = coords[i]
    const [lon1, lat1] = coords[i + 1]
    const segmentMeters = Math.hypot((lon1 - lon0) * mLon, (lat1 - lat0) * METERS_PER_DEGREE_LAT)
    const steps = Math.max(1, Math.ceil(segmentMeters / stepMeters))
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      const point = terrainPoint(lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t, terrain, exaggeration)
      point.y += heightOffset
      points.push(point)
    }
  }
  const last = coords[coords.length - 1]
  const end = terrainPoint(last[0], last[1], terrain, exaggeration)
  end.y += heightOffset
  points.push(end)
  return points
}

// Lift cables hang straight between stations rather than following terrain.
function liftPoints(coords: number[][], terrain: TerrainData, exaggeration: number) {
  return coords.map(([lon, lat]) => {
    const point = terrainPoint(lon, lat, terrain, exaggeration)
    point.y += 0.045
    return point
  })
}

function TrailLine({ feature, terrain }: { feature: TrailFeature; terrain: TerrainData }) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const isLift = feature.properties.kind === 'lift'
  const isBoundary = feature.properties.kind === 'boundary'
  const isNamed = Boolean(feature.properties.name) && !/^(Run|Lift) \d+$/.test(feature.properties.name)

  const points = useMemo(() => {
    if (feature.geometry.type !== 'LineString') return []
    const coords = feature.geometry.coordinates as number[][]
    if (coords.length < 2) return []
    if (isLift) return liftPoints(coords, terrain, exaggeration)
    return densifiedPoints(coords, terrain, exaggeration, isBoundary ? 0.02 : 0.012)
  }, [feature, terrain, exaggeration, isLift, isBoundary])

  if (points.length < 2) return null

  if (isBoundary) {
    return (
      <Line
        points={points}
        color={BOUNDARY_COLOR}
        lineWidth={2.6}
        dashed
        dashSize={0.055}
        gapSize={0.05}
        transparent
        opacity={0.95}
      />
    )
  }

  if (isLift) {
    return (
      <group>
        <Line points={points} color={LIFT_CASING} lineWidth={5.4} transparent opacity={0.85} />
        <Line points={points} color={LIFT_COLOR} lineWidth={3} opacity={1} />
        {/* Tower ticks along the cable, echoing the official map's lift styling. */}
        <Line points={points} color="#23282c" lineWidth={5.2} dashed dashSize={0.012} gapSize={0.16} />
      </group>
    )
  }

  const color = trailColor(feature.properties.difficulty, feature.properties.color)
  // Unnamed OSM fragments render thin and quiet so named runs dominate.
  const casingWidth = isNamed ? 4.4 : 2.6
  const lineWidth = isNamed ? 2.3 : 1.3

  return (
    <group>
      <Line points={points} color="#ffffff" lineWidth={casingWidth} transparent opacity={0.85} />
      <Line points={points} color={color} lineWidth={lineWidth} transparent opacity={0.95} />
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
