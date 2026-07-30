import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { extractContours, simplifyRing } from '../lib/marchingSquares'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  freezingLevelM?: number
}

// Live freezing-level band: a thick red contour drawn on the terrain at the
// altitude Open-Meteo currently reports for the 0degC level. It rises and
// falls with each data update — below the band is rain/wet snow territory,
// above it snow stays dry. Toggleable from the toolbar.

export function FreezingLevelBand({ terrain, freezingLevelM }: Props) {
  const showFreezingLevel = useViewStore((state) => state.showFreezingLevel)
  if (!showFreezingLevel || !freezingLevelM) return null
  return <VisibleFreezingLevelBand terrain={terrain} freezingLevelM={freezingLevelM} />
}

function VisibleFreezingLevelBand({
  terrain,
  freezingLevelM,
}: {
  terrain: TerrainData
  freezingLevelM: number
}) {
  const exaggeration = useViewStore((state) => state.exaggeration)

  const rings = useMemo(() => {
    if (freezingLevelM <= terrain.minElevation + 20 || freezingLevelM >= terrain.maxElevation - 20) {
      return []
    }
    const heights = Float32Array.from(terrain.heights)
    // Freezing-level contours often run off the grid edge (open polylines),
    // so filter by length rather than enclosed area.
    return extractContours(heights, terrain.width, terrain.height, freezingLevelM)
      .filter((ring) => ring.length >= 10)
      .map((ring) => {
        const simplified = simplifyRing(ring, 0.4)
        const points = simplified.map(([x, y]) => {
          const lon = terrain.bounds.west + (x / (terrain.width - 1)) * (terrain.bounds.east - terrain.bounds.west)
          const lat = terrain.bounds.north - (y / (terrain.height - 1)) * (terrain.bounds.north - terrain.bounds.south)
          const point = terrainPoint(lon, lat, terrain, exaggeration)
          point.y += 0.018
          return point
        })
        return points
      })
      .filter((points) => points.length >= 3)
  }, [terrain, freezingLevelM, exaggeration])

  // Off-terrain cases still deserve a message pill so the toggle always
  // gives feedback.
  const offTerrain =
    freezingLevelM <= terrain.minElevation + 20
      ? 'Freezing level below the valley floor — snow everywhere'
      : freezingLevelM >= terrain.maxElevation - 20
        ? 'Freezing level above the summit — rain risk on all terrain'
        : null

  const labelAnchor = rings[0]?.[0]

  return (
    <group>
      {rings.map((points, index) => (
        <Line
          key={index}
          points={points}
          color="#e0342f"
          lineWidth={5}
          transparent
          opacity={0.8}
          renderOrder={7}
        />
      ))}
      {labelAnchor ? (
        <Html position={labelAnchor} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="freezing-label">0°C · {Math.round(freezingLevelM)} m</span>
        </Html>
      ) : null}
      {offTerrain ? (
        <Html position={[0, 4.6, 0]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className="freezing-label">{offTerrain}</span>
        </Html>
      ) : null}
    </group>
  )
}
