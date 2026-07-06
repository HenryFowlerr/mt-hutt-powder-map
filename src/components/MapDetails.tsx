import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
}

const rockBands = [
  [
    [171.523, -43.486],
    [171.53, -43.494],
    [171.535, -43.506],
  ],
  [
    [171.516, -43.498],
    [171.52, -43.509],
    [171.522, -43.522],
  ],
  [
    [171.574, -43.493],
    [171.579, -43.505],
    [171.582, -43.518],
  ],
]

const carparkAnchors = [
  [171.548, -43.519],
  [171.553, -43.522],
  [171.558, -43.524],
]

export function MapDetails({ terrain }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)

  return (
    <group>
      {rockBands.map((band, index) => (
        <Line
          key={`rock-${index}`}
          points={band.map(([lon, lat]) => {
            const point = terrainPoint(lon, lat, terrain, exaggeration)
            point.y += 0.09
            return point
          })}
          color="#111111"
          lineWidth={3}
          dashed
          dashSize={0.07}
          gapSize={0.06}
          transparent
          opacity={0.82}
        />
      ))}
      {carparkAnchors.map(([lon, lat], index) => {
        const position = terrainPoint(lon, lat, terrain, exaggeration)
        position.y += 0.08
        return (
          <group key={`carpark-${index}`} position={position} rotation={[-Math.PI / 2, 0, 0.22]}>
            <mesh>
              <boxGeometry args={[0.48, 0.2, 0.02]} />
              <meshBasicMaterial color="#7f8b90" transparent opacity={0.9} />
            </mesh>
            <lineSegments position={[0, 0, 0.02]}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[
                    new Float32Array([
                      -0.2, -0.06, 0, 0.2, -0.06, 0, -0.2, 0, 0, 0.2, 0, 0, -0.2, 0.06, 0, 0.2, 0.06, 0,
                    ]),
                    3,
                  ]}
                />
              </bufferGeometry>
              <lineBasicMaterial color={new THREE.Color('#d8e4e7')} transparent opacity={0.75} />
            </lineSegments>
          </group>
        )
      })}
    </group>
  )
}
