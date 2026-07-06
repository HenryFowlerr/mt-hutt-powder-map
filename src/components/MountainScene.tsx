import { Canvas } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { TerrainMesh } from './TerrainMesh'
import { TrailOverlay } from './TrailOverlay'
import { PowderOverlay } from './PowderOverlay'
import { MapDetails } from './MapDetails'
import { MapLabels } from './MapLabels'
import { StormLayer } from './StormLayer'
import { terrainPoint } from '../lib/terrain'
import type { PowderField, PowderWeather } from '../lib/powderModel'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
  analysis: TerrainAnalysis
  field: PowderField
  weather: PowderWeather
}

// Camera target sits on the main ski area (mean of lift midpoints) so the
// default view opens on the mountain proper, like the official map, not on
// empty valley terrain.
function skiAreaTarget(terrain: TerrainData, trails: TrailCollection, exaggeration: number) {
  const midpoints: Array<[number, number]> = []
  for (const feature of trails.features) {
    if (feature.properties.kind !== 'lift' || feature.geometry.type !== 'LineString') continue
    const coords = feature.geometry.coordinates as number[][]
    const [lon, lat] = coords[Math.floor(coords.length / 2)]
    midpoints.push([lon, lat])
  }
  if (midpoints.length === 0) {
    return new THREE.Vector3(0, 1.5, 0)
  }
  const lon = midpoints.reduce((total, point) => total + point[0], 0) / midpoints.length
  const lat = midpoints.reduce((total, point) => total + point[1], 0) / midpoints.length
  return terrainPoint(lon, lat, terrain, exaggeration)
}

function CameraRig({ terrain, trails }: { terrain: TerrainData; trails: TrailCollection }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const resetCount = useViewStore((state) => state.resetCount)
  const mapView = useViewStore((state) => state.mapView)
  const exaggeration = useViewStore((state) => state.exaggeration)

  const target = useMemo(
    () => skiAreaTarget(terrain, trails, exaggeration),
    [terrain, trails, exaggeration],
  )

  // The official map is viewed from the east-southeast; runs face the viewer.
  const perspectivePosition = useMemo(
    () => target.clone().add(new THREE.Vector3(4.3, 2.3, 3.5)),
    [target],
  )
  const orthoPosition = useMemo(
    () => target.clone().add(new THREE.Vector3(4.2, 8.5, 3.4)),
    [target],
  )

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const position = mapView ? orthoPosition : perspectivePosition
    controls.object.position.copy(position)
    if (mapView && controls.object instanceof THREE.OrthographicCamera) {
      controls.object.zoom = 55
      controls.object.updateProjectionMatrix()
    }
    controls.target.copy(target)
    controls.update()
  }, [resetCount, mapView, target, perspectivePosition, orthoPosition])

  return (
    <>
      {mapView ? (
        <OrthographicCamera makeDefault position={orthoPosition.toArray()} zoom={55} near={-50} far={100} />
      ) : (
        <PerspectiveCamera makeDefault position={perspectivePosition.toArray()} fov={40} near={0.1} far={120} />
      )}
      <OrbitControls
        ref={controlsRef}
        target={target.toArray()}
        enableDamping
        dampingFactor={0.09}
        maxPolarAngle={Math.PI * 0.47}
        minDistance={2.4}
        maxDistance={26}
        minZoom={22}
        maxZoom={320}
      />
    </>
  )
}

export function MountainScene({ terrain, trails, analysis, field, weather }: Props) {
  return (
    <Canvas dpr={[1, 1.9]} gl={{ antialias: true }}>
      {/* No fog and no scene lighting: the map look is baked into textures
          so labels and lines stay crisp at every distance. */}
      <color attach="background" args={['#dbe7f0']} />
      <TerrainMesh terrain={terrain} analysis={analysis} />
      <PowderOverlay terrain={terrain} analysis={analysis} field={field} weather={weather} />
      <TrailOverlay terrain={terrain} trails={trails} />
      <MapDetails terrain={terrain} trails={trails} />
      <MapLabels terrain={terrain} trails={trails} />
      <StormLayer terrain={terrain} weather={weather} />
      <CameraRig terrain={terrain} trails={trails} />
    </Canvas>
  )
}
