import { useMemo } from 'react'
import { createTerrainGeometry } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
}

export function TerrainMesh({ terrain }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const geometry = useMemo(() => createTerrainGeometry(terrain, exaggeration), [terrain, exaggeration])

  return (
    <mesh geometry={geometry} receiveShadow rotation={[0, 0, 0]}>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0.01} />
    </mesh>
  )
}
