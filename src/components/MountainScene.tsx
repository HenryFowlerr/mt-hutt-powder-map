import { Canvas } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { TerrainMesh } from './TerrainMesh'
import { TrailOverlay } from './TrailOverlay'
import { PowderOverlay } from './PowderOverlay'
import { MapDetails } from './MapDetails'
import { MapLabels } from './MapLabels'
import { StormLayer } from './StormLayer'
import { FreezingLevelBand } from './FreezingLevelBand'
import { IceOverlay } from './IceOverlay'
import { FocusMarker } from './FocusMarker'
import { ZoneMarkers } from './ZoneMarkers'
import { createTerrainGeometry, skiAreaCenter, terrainPoint } from '../lib/terrain'
import type { PowderField, PowderWeather } from '../lib/powderModel'
import type { IceField, IceWeather } from '../lib/iceModel'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import { useWebglRuntimeBudget } from '../lib/webglRuntime'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
  analysis: TerrainAnalysis
  field: PowderField
  weather: PowderWeather
  iceField: IceField
  iceWeather: IceWeather
  overrides?: TrailCollection | null
}

function CameraRig({ terrain, trails }: { terrain: TerrainData; trails: TrailCollection }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const orientationResetCount = useViewStore((state) => state.orientationResetCount)
  const resetCount = useViewStore((state) => state.resetCount)
  const mapView = useViewStore((state) => state.mapView)
  const exaggeration = useViewStore((state) => state.exaggeration)
  const setCameraBearing = useViewStore((state) => state.setCameraBearing)
  const lastOrientationResetCount = useRef(orientationResetCount)

  const target = useMemo(
    () => skiAreaCenter(terrain, trails, exaggeration),
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

  const reportBearing = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const forwardX = controls.target.x - controls.object.position.x
    const forwardZ = controls.target.z - controls.object.position.z
    if (Math.hypot(forwardX, forwardZ) < 0.0001) return
    // World north is -Z and east is +X, matching lonLatToXZ().
    const bearing = THREE.MathUtils.radToDeg(Math.atan2(forwardX, -forwardZ))
    setCameraBearing(bearing)
  }, [setCameraBearing])

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
    reportBearing()
  }, [resetCount, mapView, target, perspectivePosition, orthoPosition, reportBearing])

  useEffect(() => {
    if (orientationResetCount === lastOrientationResetCount.current) return
    lastOrientationResetCount.current = orientationResetCount
    const controls = controlsRef.current
    if (!controls) return

    const offset = controls.object.position.clone().sub(controls.target)
    const horizontalDistance = Math.max(0.001, Math.hypot(offset.x, offset.z))
    controls.object.position.set(
      controls.target.x,
      controls.target.y + offset.y,
      controls.target.z + horizontalDistance,
    )
    controls.object.up.set(0, 1, 0)
    controls.update()
    reportBearing()
  }, [orientationResetCount, reportBearing])

  // Zone click in the panel flies the camera to that zone.
  const focusPoint = useViewStore((state) => state.focusPoint)
  const focusCount = useViewStore((state) => state.focusCount)
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !focusPoint) return
    const zoneTarget = terrainPoint(focusPoint.lon, focusPoint.lat, terrain, exaggeration)
    controls.target.copy(zoneTarget)
    if (controls.object instanceof THREE.OrthographicCamera) {
      controls.object.position.copy(zoneTarget.clone().add(new THREE.Vector3(2.2, 6, 1.8)))
      controls.object.zoom = 160
      controls.object.updateProjectionMatrix()
    } else {
      controls.object.position.copy(zoneTarget.clone().add(new THREE.Vector3(2.5, 2, 2)))
    }
    controls.update()
    reportBearing()
    // focusCount retriggers the fly-to even for the same zone.
  }, [focusCount, focusPoint, terrain, exaggeration, reportBearing])

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
        minDistance={0.8}
        maxDistance={26}
        minZoom={22}
        maxZoom={900}
        onChange={reportBearing}
      />
    </>
  )
}

export function MountainScene({
  terrain,
  trails,
  analysis,
  field,
  weather,
  iceField,
  iceWeather,
  overrides,
}: Props) {
  const clearFocus = useViewStore((state) => state.clearFocus)
  const focusPoint = useViewStore((state) => state.focusPoint)
  const exaggeration = useViewStore((state) => state.exaggeration)
  const [webglContextLost, setWebglContextLost] = useState(false)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
  const handleWebglContextLost = useCallback(() => setWebglContextLost(true), [])
  const { animate, dpr, lowPower } = useWebglRuntimeBudget()
  const terrainGeometry = useMemo(
    () => createTerrainGeometry(terrain, exaggeration),
    [terrain, exaggeration],
  )

  useEffect(() => () => terrainGeometry.dispose(), [terrainGeometry])
  useEffect(() => {
    if (!canvasElement) return
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      handleWebglContextLost()
    }
    canvasElement.addEventListener('webglcontextlost', handleContextLost)
    canvasElement.dataset.contextGuard = 'ready'
    return () => {
      canvasElement.removeEventListener('webglcontextlost', handleContextLost)
      delete canvasElement.dataset.contextGuard
    }
  }, [canvasElement, handleWebglContextLost])

  if (webglContextLost) {
    throw new Error('WebGL context lost')
  }

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: true }}
      onCreated={({ gl }) => setCanvasElement(gl.domElement)}
      onPointerMissed={() => {
        // Clicking empty space (not the panel, not a zone) deselects a focus.
        if (focusPoint) clearFocus()
      }}
    >
      {/* No fog and no scene lighting: the map look is baked into textures
          so labels and lines stay crisp at every distance. */}
      <color attach="background" args={['#dce9ef']} />
      <TerrainMesh terrain={terrain} analysis={analysis} geometry={terrainGeometry} />
      <PowderOverlay
        terrain={terrain}
        analysis={analysis}
        field={field}
        weather={weather}
        geometry={terrainGeometry}
      />
      <IceOverlay
        terrain={terrain}
        analysis={analysis}
        field={iceField}
        weather={iceWeather}
        geometry={terrainGeometry}
      />
      <TrailOverlay terrain={terrain} trails={trails} />
      <MapDetails terrain={terrain} trails={trails} overrides={overrides} />
      <MapLabels terrain={terrain} trails={trails} />
      <ZoneMarkers
        terrain={terrain}
        trails={trails}
        analysis={analysis}
        field={field}
        weather={weather}
      />
      <FocusMarker terrain={terrain} />
      <StormLayer terrain={terrain} weather={weather} animate={animate} lowPower={lowPower} />
      <FreezingLevelBand terrain={terrain} freezingLevelM={weather.freezingLevelM} />
      <CameraRig terrain={terrain} trails={trails} />
    </Canvas>
  )
}
