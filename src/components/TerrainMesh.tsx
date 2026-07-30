import { useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import { createTerrainTexture } from '../lib/terrain'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  analysis: TerrainAnalysis
  geometry: THREE.BufferGeometry
}

export function TerrainMesh({ terrain, analysis, geometry }: Props) {
  const texture = useMemo(() => createTerrainTexture(terrain, analysis), [terrain, analysis])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh geometry={geometry} name="terrain" dispose={null}>
      {/* Lighting is baked into the texture so the terrain reads like a printed map. */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
