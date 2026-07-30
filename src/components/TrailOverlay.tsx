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

const PRIMARY_LIFTS = new Set(['Summit Six Chair', 'Towers Triple Chair', 'Norwest Express'])
const PRIMARY_RUNS = new Set(['Broadway', 'International'])

// Densify sparse OSM linestrings (~every 35 m) so lines drape along the
// terrain surface instead of cutting through rolls and gullies.
function densifiedPoints(
  coords: number[][],
  terrain: TerrainData,
  exaggeration: number,
  heightOffset: number,
) {
  const mLon = metersPerDegreeLon((terrain.bounds.south + terrain.bounds.north) / 2)
  const stepMeters = 25
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
    point.y += 0.06
    return point
  })
}

function TrailLine({ feature, terrain }: { feature: TrailFeature; terrain: TerrainData }) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const isLift = feature.properties.kind === 'lift'
  const isBoundary = feature.properties.kind === 'boundary'
  const isPrimaryLift = isLift && PRIMARY_LIFTS.has(feature.properties.name)
  const isPrimaryRun =
    feature.properties.kind === 'run' && PRIMARY_RUNS.has(feature.properties.name)
  const isNamed = Boolean(feature.properties.name) && !/^(Run|Lift) \d+$/.test(feature.properties.name)

  const points = useMemo(() => {
    if (feature.geometry.type !== 'LineString') return []
    const coords = feature.geometry.coordinates as number[][]
    if (coords.length < 2) return []
    if (isLift) return liftPoints(coords, terrain, exaggeration)
    return densifiedPoints(coords, terrain, exaggeration, isBoundary ? 0.02 : 0.014)
  }, [feature, terrain, exaggeration, isLift, isBoundary])

  // Two Line2s on identical points z-fight per segment (renderOrder does
  // not help), so casings sit a few metres below their colour line — depth
  // then resolves consistently and the casing reads as an outline.
  const casingPoints = useMemo(
    () => points.map((point) => new THREE.Vector3(point.x, point.y - 0.006, point.z)),
    [points],
  )

  if (points.length < 2) return null

  // Casing and colour lines share identical positions, so explicit
  // renderOrder (casing first, colour second) is what keeps the colour on
  // top — transparent distance-sorting alone is unstable at equal depth.
  if (isBoundary) {
    return (
      <Line
        points={points}
        color={BOUNDARY_COLOR}
        lineWidth={2.2}
        dashed
        dashSize={0.05}
        gapSize={0.05}
        transparent
        opacity={0.86}
        renderOrder={6}
      />
    )
  }

  if (isLift) {
    const tickPoints = points.map((point) => new THREE.Vector3(point.x, point.y + 0.006, point.z))
    return (
      <group>
        <Line
          points={casingPoints}
          color={LIFT_CASING}
          lineWidth={isPrimaryLift ? 4.4 : 2.8}
          renderOrder={6}
        />
        <Line
          points={points}
          color={LIFT_COLOR}
          lineWidth={isPrimaryLift ? 2.4 : 1.4}
          renderOrder={7}
        />
        {isPrimaryLift ? (
          <Line
            points={tickPoints}
            color="#23282c"
            lineWidth={3.8}
            dashed
            dashSize={0.01}
            gapSize={0.18}
            renderOrder={8}
          />
        ) : null}
      </group>
    )
  }

  const color = trailColor(feature.properties.difficulty, feature.properties.color)
  // The line hierarchy mirrors the label hierarchy: destination runs are
  // strongest, named connectors remain legible, and raw OSM fragments recede.
  const casingWidth = isPrimaryRun ? 4.2 : isNamed ? 3.3 : 1.9
  const lineWidth = isPrimaryRun ? 2.2 : isNamed ? 1.65 : 0.85

  return (
    <group>
      <Line points={casingPoints} color="#f8fbfc" lineWidth={casingWidth} renderOrder={4} />
      <Line points={points} color={color} lineWidth={lineWidth} renderOrder={5} />
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
