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

function createPatchGeometry(score: number, seed: number) {
  const shape = new THREE.Shape()
  const radius = 0.08 + score * 0.16
  const points = 11

  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * Math.PI * 2
    const wobble = 0.78 + ((Math.sin(seed * 12.989 + i * 2.17) + 1) / 2) * 0.42
    const x = Math.cos(angle) * radius * wobble * 1.45
    const y = Math.sin(angle) * radius * (1.05 + score * 0.3)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }

  return new THREE.ShapeGeometry(shape)
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
        position.y += 0.105
        return { ...point, score, position, geometry: createPatchGeometry(score, point.lon + point.lat) }
      })
      .filter((point) => point.score > 0.22)
  }, [latest, terrain, exaggeration, showForecast])

  if (!showRecent && !showForecast) return null

  return (
    <group>
      {patches.map((point, index) => (
        <mesh key={`${point.lon}-${point.lat}-${index}`} position={point.position} rotation={[-Math.PI / 2, 0, 0]}>
          <primitive object={point.geometry} attach="geometry" />
          <meshBasicMaterial
            color={new THREE.Color(powderColor(point.score))}
            transparent
            opacity={0.44 + point.score * 0.42}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
