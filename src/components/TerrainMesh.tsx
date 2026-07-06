import { useEffect, useMemo } from 'react'
import { createTerrainGeometry, createTerrainTexture } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  analysis: TerrainAnalysis
}

export function TerrainMesh({ terrain, analysis }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const geometry = useMemo(() => createTerrainGeometry(terrain, exaggeration), [terrain, exaggeration])
  const texture = useMemo(() => createTerrainTexture(terrain, analysis), [terrain, analysis])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh geometry={geometry} name="terrain">
      {/* Lighting is baked into the texture so the terrain reads like a printed map. */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
