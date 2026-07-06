import { useMemo } from 'react'
import * as THREE from 'three'
import { powderColor } from '../lib/colors'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { LatestData, TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  latest: LatestData
}

export function PowderOverlay({ terrain, latest }: Props) {
  const showRecent = useViewStore((state) => state.showRecent)
  const showForecast = useViewStore((state) => state.showForecast)
  const exaggeration = useViewStore((state) => state.exaggeration)

  const patches = useMemo(() => {
    return latest.powderGrid
      .map((point) => {
        const score = showForecast ? point.forecastScore : point.recentScore
        const position = terrainPoint(point.lon, point.lat, terrain, exaggeration)
        position.y += 0.075
        return { ...point, score, position }
      })
      .filter((point) => point.score > 0.18)
  }, [latest, terrain, exaggeration, showForecast])

  if (!showRecent && !showForecast) return null

  return (
    <group>
      {patches.map((point, index) => (
        <mesh key={`${point.lon}-${point.lat}-${index}`} position={point.position} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.46 + point.score * 0.38, 32]} />
          <meshBasicMaterial
            color={new THREE.Color(powderColor(point.score))}
            transparent
            opacity={0.18 + point.score * 0.34}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
