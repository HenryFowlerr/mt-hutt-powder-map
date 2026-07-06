import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, Sky } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { TerrainMesh } from './TerrainMesh'
import { TrailOverlay } from './TrailOverlay'
import { PowderOverlay } from './PowderOverlay'
import { useViewStore } from '../state/viewStore'
import type { LatestData, TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
  latest: LatestData
}

function CameraControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const resetCount = useViewStore((state) => state.resetCount)

  useEffect(() => {
    if (!controlsRef.current) return
    controlsRef.current.object.position.set(0, 8.5, 12)
    controlsRef.current.target.set(0, 0.2, 0)
    controlsRef.current.update()
  }, [resetCount])

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.48}
      minDistance={5}
      maxDistance={24}
    />
  )
}

export function MountainScene({ terrain, trails, latest }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 8.5, 12], fov: 45, near: 0.1, far: 100 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#d8e8ed']} />
      <fog attach="fog" args={['#d8e8ed', 18, 40]} />
      <Sky sunPosition={[2, 8, 4]} turbidity={2.2} rayleigh={1.4} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 3]} intensity={2.1} castShadow />
      <TerrainMesh terrain={terrain} />
      <PowderOverlay terrain={terrain} latest={latest} />
      <TrailOverlay terrain={terrain} trails={trails} />
      <Environment preset="city" />
      <CameraControls />
    </Canvas>
  )
}
