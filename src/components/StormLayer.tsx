import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { WORLD_UNITS_PER_METER, terrainWorldSize } from '../lib/geo'
import { renderSurfaceElevation, elevationToY } from '../lib/terrain'
import { xzToLonLat } from '../lib/geo'
import { clamp01 } from '../lib/terrainAnalysis'
import type { PowderWeather } from '../lib/powderModel'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  weather: PowderWeather
}

// Optional 3D storm visualisation driven by the same Open-Meteo data as the
// powder model: cloud deck, falling snow, and wind streaks all match the
// storm the model is scoring (recent storm or forecast, following the
// active powder mode).

const MAX_SNOWFLAKES = 6000
const STREAK_COUNT = 56
const TIME_SCALE = 24 // real m/s feels static at map scale; speed time up

function windVector(windFromDeg: number, windKph: number) {
  // Wind FROM windFromDeg blows TOWARD windFromDeg + 180. Bearing 0 = north
  // (-z), 90 = east (+x).
  const towardRad = ((windFromDeg + 180) * Math.PI) / 180
  const speed = (windKph / 3.6) * WORLD_UNITS_PER_METER * TIME_SCALE
  return { vx: Math.sin(towardRad) * speed, vz: -Math.cos(towardRad) * speed }
}

function createCloudTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create cloud texture context')

  // Layered soft blobs make a puffy storm-cloud sprite.
  context.clearRect(0, 0, size, size)
  for (let blob = 0; blob < 26; blob += 1) {
    const x = size * (0.2 + Math.random() * 0.6)
    const y = size * (0.3 + Math.random() * 0.4)
    const radius = size * (0.08 + Math.random() * 0.16)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(148, 163, 178, 0.2)')
    gradient.addColorStop(1, 'rgba(148, 163, 178, 0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Tileable blotchy cloud-deck texture for the horizontal storm layer.
function createCloudDeckTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create cloud deck texture context')

  context.clearRect(0, 0, size, size)
  for (let blob = 0; blob < 240; blob += 1) {
    const x = Math.random() * size
    const y = Math.random() * size
    const radius = size * (0.03 + Math.random() * 0.09)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(150, 165, 180, 0.34)')
    gradient.addColorStop(1, 'rgba(150, 165, 180, 0)')
    context.fillStyle = gradient
    // Draw wrapped copies so the texture tiles seamlessly while drifting.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        context.beginPath()
        context.arc(x + ox, y + oy, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function StormLayer({ terrain, weather }: Props) {
  const showStorm = useViewStore((state) => state.showStorm)
  const powderMode = useViewStore((state) => state.powderMode)
  const exaggeration = useViewStore((state) => state.exaggeration)

  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'
  const windFromDeg =
    mode === 'forecast'
      ? (weather.forecastWindDirectionDeg ?? weather.mainWindDirectionDeg)
      : weather.mainWindDirectionDeg
  const windKph =
    mode === 'forecast' ? (weather.forecastAvgWindKph ?? weather.avgWindKph) : weather.avgWindKph
  const gustKph =
    mode === 'forecast'
      ? (weather.forecastMaxGustKph ?? weather.maxGustKph ?? windKph * 1.6)
      : (weather.maxGustKph ?? windKph * 1.6)
  const snowCm = mode === 'forecast' ? weather.forecastSnowCm : weather.recentSnowCm

  const intensity = clamp01(snowCm / 40)
  const flakeCount = Math.round(800 + (MAX_SNOWFLAKES - 800) * intensity)

  const world = useMemo(() => terrainWorldSize(terrain), [terrain])
  const cloudBaseY = useMemo(
    () => elevationToY(terrain.maxElevation + 170, terrain, exaggeration),
    [terrain, exaggeration],
  )
  const wind = useMemo(() => windVector(windFromDeg, windKph), [windFromDeg, windKph])

  // --- Snowflakes ---
  const flakePositions = useMemo(() => {
    const positions = new Float32Array(MAX_SNOWFLAKES * 3)
    for (let i = 0; i < MAX_SNOWFLAKES; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * world.x
      positions[i * 3 + 1] = Math.random() * cloudBaseY
      positions[i * 3 + 2] = (Math.random() - 0.5) * world.z
    }
    return positions
  }, [world, cloudBaseY])
  const flakeGeometry = useRef<THREE.BufferGeometry | null>(null)

  // --- Wind streaks ---
  const streakPositions = useMemo(() => new Float32Array(STREAK_COUNT * 2 * 3), [])
  const streakState = useMemo(() => {
    const state = new Float32Array(STREAK_COUNT * 2) // x, z per streak
    for (let i = 0; i < STREAK_COUNT; i += 1) {
      state[i * 2] = (Math.random() - 0.5) * world.x
      state[i * 2 + 1] = (Math.random() - 0.5) * world.z
    }
    return state
  }, [world])
  const streakGeometry = useRef<THREE.BufferGeometry | null>(null)

  // --- Clouds ---
  const cloudTexture = useMemo(() => createCloudTexture(), [])
  const cloudDeckTexture = useMemo(() => createCloudDeckTexture(), [])
  const cloudRefs = useRef<Array<THREE.Sprite | null>>([])
  const clouds = useMemo(() => {
    const items: Array<{ x: number; z: number; scale: number; opacity: number }> = []
    const count = 6 + Math.round(6 * intensity)
    for (let i = 0; i < count; i += 1) {
      items.push({
        x: (Math.random() - 0.5) * world.x * 1.1,
        z: (Math.random() - 0.5) * world.z * 1.1,
        scale: 2.6 + Math.random() * 3.4,
        opacity: 0.5 + 0.4 * intensity * Math.random(),
      })
    }
    return items
  }, [world, intensity])

  useEffect(() => () => cloudTexture.dispose(), [cloudTexture])
  useEffect(() => () => cloudDeckTexture.dispose(), [cloudDeckTexture])

  useFrame((_, delta) => {
    if (!showStorm) return
    const dt = Math.min(delta, 0.05)

    // Snow: fall + wind drift, wrapping within the volume.
    const geometry = flakeGeometry.current
    if (geometry) {
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
      const array = attribute.array as Float32Array
      const fall = 1.4 * WORLD_UNITS_PER_METER * TIME_SCALE * dt
      const dx = wind.vx * dt
      const dz = wind.vz * dt
      const halfX = world.x / 2
      const halfZ = world.z / 2
      for (let i = 0; i < flakeCount; i += 1) {
        let x = array[i * 3] + dx + (Math.random() - 0.5) * fall * 0.4
        let y = array[i * 3 + 1] - fall
        let z = array[i * 3 + 2] + dz
        if (y < 0) y = cloudBaseY * (0.9 + Math.random() * 0.1)
        if (x > halfX) x -= world.x
        if (x < -halfX) x += world.x
        if (z > halfZ) z -= world.z
        if (z < -halfZ) z += world.z
        array[i * 3] = x
        array[i * 3 + 1] = y
        array[i * 3 + 2] = z
      }
      attribute.needsUpdate = true
      geometry.setDrawRange(0, flakeCount)
    }

    // Wind streaks: advected just above the terrain surface, tail behind.
    const streaks = streakGeometry.current
    if (streaks) {
      const attribute = streaks.getAttribute('position') as THREE.BufferAttribute
      const array = attribute.array as Float32Array
      const gustScale = Math.max(1, gustKph / Math.max(windKph, 1)) * 0.5
      const tailLength = 0.15 + 0.5 * clamp01(windKph / 60) + 0.3 * clamp01(gustScale - 0.5)
      const speed = Math.hypot(wind.vx, wind.vz) || 0.001
      const dirX = wind.vx / speed
      const dirZ = wind.vz / speed
      const halfX = world.x / 2
      const halfZ = world.z / 2
      for (let i = 0; i < STREAK_COUNT; i += 1) {
        let x = streakState[i * 2] + wind.vx * dt * 1.6
        let z = streakState[i * 2 + 1] + wind.vz * dt * 1.6
        if (x > halfX || x < -halfX || z > halfZ || z < -halfZ) {
          x = (Math.random() - 0.5) * world.x
          z = (Math.random() - 0.5) * world.z
        }
        streakState[i * 2] = x
        streakState[i * 2 + 1] = z
        const { lon, lat } = xzToLonLat(x, z, terrain)
        const y = elevationToY(renderSurfaceElevation(lon, lat, terrain), terrain, exaggeration) + 0.09
        array[i * 6] = x
        array[i * 6 + 1] = y
        array[i * 6 + 2] = z
        array[i * 6 + 3] = x - dirX * tailLength
        array[i * 6 + 4] = y + 0.015
        array[i * 6 + 5] = z - dirZ * tailLength
      }
      attribute.needsUpdate = true
    }

    // The cloud deck texture scrolls with the wind.
    const deckDrift = 0.02
    cloudDeckTexture.offset.x -= wind.vx * dt * deckDrift * 10
    cloudDeckTexture.offset.y -= wind.vz * dt * deckDrift * 10

    // Cloud puffs drift slowly with the wind.
    const halfX = world.x * 0.65
    const halfZ = world.z * 0.65
    for (const sprite of cloudRefs.current) {
      if (!sprite) continue
      sprite.position.x += wind.vx * dt * 0.35
      sprite.position.z += wind.vz * dt * 0.35
      if (sprite.position.x > halfX) sprite.position.x -= halfX * 2
      if (sprite.position.x < -halfX) sprite.position.x += halfX * 2
      if (sprite.position.z > halfZ) sprite.position.z -= halfZ * 2
      if (sprite.position.z < -halfZ) sprite.position.z += halfZ * 2
    }
  })

  if (!showStorm) return null

  return (
    <group>
      <points renderOrder={9}>
        <bufferGeometry ref={flakeGeometry}>
          <bufferAttribute attach="attributes-position" args={[flakePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#8fa6b8"
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </points>

      <lineSegments renderOrder={9}>
        <bufferGeometry ref={streakGeometry}>
          <bufferAttribute attach="attributes-position" args={[streakPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#5f89a6" transparent opacity={0.6} depthWrite={false} />
      </lineSegments>

      <mesh
        position={[0, cloudBaseY + 0.4, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
      >
        <planeGeometry args={[world.x * 1.3, world.z * 1.3]} />
        <meshBasicMaterial
          map={cloudDeckTexture}
          transparent
          opacity={0.35 + 0.5 * intensity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {clouds.map((cloud, index) => (
        <sprite
          key={index}
          ref={(sprite) => {
            cloudRefs.current[index] = sprite
          }}
          position={[cloud.x, cloudBaseY + 0.25 + (index % 3) * 0.12, cloud.z]}
          scale={[cloud.scale, cloud.scale * 0.42, 1]}
          renderOrder={10}
        >
          <spriteMaterial
            map={cloudTexture}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            color="#aebfcd"
          />
        </sprite>
      ))}
    </group>
  )
}
