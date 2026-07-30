import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { lonLatToXZ, xzToLonLat } from '../lib/geo'
import { terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
}

const RING_RADIUS = 0.15
const RING_SEGMENTS = 56

function terrainRing(
  lon: number,
  lat: number,
  terrain: TerrainData,
  exaggeration: number,
  heightOffset: number,
) {
  const center = lonLatToXZ(lon, lat, terrain)
  const points: THREE.Vector3[] = []

  for (let segment = 0; segment <= RING_SEGMENTS; segment += 1) {
    const angle = (segment / RING_SEGMENTS) * Math.PI * 2
    const { lon: ringLon, lat: ringLat } = xzToLonLat(
      center.x + Math.cos(angle) * RING_RADIUS,
      center.z + Math.sin(angle) * RING_RADIUS,
      terrain,
    )
    const point = terrainPoint(ringLon, ringLat, terrain, exaggeration)
    point.y += heightOffset
    points.push(point)
  }

  return points
}

export function FocusMarker({ terrain }: Props) {
  const focusPoint = useViewStore((state) => state.focusPoint)
  const exaggeration = useViewStore((state) => state.exaggeration)

  const marker = useMemo(() => {
    if (!focusPoint) return null
    const center = terrainPoint(focusPoint.lon, focusPoint.lat, terrain, exaggeration)
    center.y += 0.045
    return {
      center,
      casing: terrainRing(
        focusPoint.lon,
        focusPoint.lat,
        terrain,
        exaggeration,
        0.026,
      ),
      ring: terrainRing(focusPoint.lon, focusPoint.lat, terrain, exaggeration, 0.034),
    }
  }, [focusPoint, terrain, exaggeration])

  if (!marker) return null

  return (
    <group>
      {/* A terrain-following target, intentionally free of HTML or texture
          allocation. The inspector remains the accessible source of detail. */}
      <Line
        points={marker.casing}
        color="#f8fcfd"
        lineWidth={6}
        transparent
        opacity={0.92}
        renderOrder={11}
      />
      <Line
        points={marker.ring}
        color="#0b6678"
        lineWidth={3.2}
        renderOrder={12}
      />
      <mesh position={marker.center} renderOrder={12}>
        <sphereGeometry args={[0.034, 16, 10]} />
        <meshBasicMaterial color="#f8fcfd" depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={marker.center} renderOrder={13}>
        <sphereGeometry args={[0.021, 16, 10]} />
        <meshBasicMaterial color="#0b6678" depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
