import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { WORLD_UNITS_PER_METER, terrainWorldSize, xzToLonLat } from '../lib/geo'
import { renderSurfaceElevation, elevationToY } from '../lib/terrain'
import { clamp01 } from '../lib/terrainAnalysis'
import type { PowderWeather } from '../lib/powderModel'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  weather: PowderWeather
  animate: boolean
  lowPower: boolean
}

// Live 3D weather layers driven by the same Open-Meteo data as the powder
// model. Clouds sit at the altitude the data reports (low cloud wraps the
// mountain, high cloud sits well above it), snowfall intensity matches the
// storm, and wind streaks follow the real direction/speed. Each layer has
// its own toolbar toggle.

const MAX_SNOWFLAKES = 6000
const STREAK_COUNT = 110
const TIME_SCALE = 24 // real m/s feels static at map scale; speed time up

function windVector(windFromDeg: number, windKph: number) {
  // Wind FROM windFromDeg blows TOWARD windFromDeg + 180. Bearing 0 = north
  // (-z), 90 = east (+x).
  const towardRad = ((windFromDeg + 180) * Math.PI) / 180
  const speed = (windKph / 3.6) * WORLD_UNITS_PER_METER * TIME_SCALE
  return { vx: Math.sin(towardRad) * speed, vz: -Math.cos(towardRad) * speed }
}

// Soft round flake sprite so falling snow reads as snow, not square pixels.
function createFlakeTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create flake texture context')
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.35, 'rgba(248, 251, 255, 0.9)')
  gradient.addColorStop(0.7, 'rgba(230, 240, 250, 0.35)')
  gradient.addColorStop(1, 'rgba(230, 240, 250, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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
    gradient.addColorStop(0, 'rgba(168, 181, 194, 0.22)')
    gradient.addColorStop(1, 'rgba(168, 181, 194, 0)')
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
    gradient.addColorStop(0, 'rgba(160, 173, 187, 0.36)')
    gradient.addColorStop(1, 'rgba(160, 173, 187, 0)')
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

// Where the cloud deck sits, from the reported low/mid/high cloud cover.
// Low cloud wraps the ski area; mid sits above the summit; high cloud is a
// thin veil well overhead.
function cloudLevel(terrain: TerrainData, weather: PowderWeather) {
  const low = weather.cloudLowPct ?? 0
  const mid = weather.cloudMidPct ?? 0
  const high = weather.cloudHighPct ?? 0

  // Low cloud hugs the upper mountain (deck slices the summit ridge), mid
  // cloud sits above the peak, high cloud is a thin veil well overhead.
  if (low >= 20) {
    return { baseM: terrain.maxElevation - 160, cover: clamp01(low / 100), kind: 'low' as const }
  }
  if (mid >= 20) {
    return { baseM: terrain.maxElevation + 420, cover: clamp01(mid / 100), kind: 'mid' as const }
  }
  if (high >= 15) {
    return { baseM: terrain.maxElevation + 950, cover: clamp01(high / 100) * 0.6, kind: 'high' as const }
  }
  return { baseM: terrain.maxElevation + 500, cover: 0.12, kind: 'clear' as const }
}

export function StormLayer({ terrain, weather, animate, lowPower }: Props) {
  const showClouds = useViewStore((state) => state.showClouds)
  const showSnowfall = useViewStore((state) => state.showSnowfall)
  const showWind = useViewStore((state) => state.showWind)
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
  const flakeCount = Math.round(1200 + (MAX_SNOWFLAKES - 1200) * intensity)

  const world = useMemo(() => terrainWorldSize(terrain), [terrain])
  const level = useMemo(() => cloudLevel(terrain, weather), [terrain, weather])
  const cloudBaseY = useMemo(
    () => elevationToY(level.baseM, terrain, exaggeration),
    [level, terrain, exaggeration],
  )
  // Snow always falls from above the summit so it is visible over the whole
  // ski area even when the cloud deck itself sits below the ridge line.
  const snowTopY = useMemo(
    () => Math.max(cloudBaseY, elevationToY(terrain.maxElevation + 250, terrain, exaggeration)),
    [cloudBaseY, terrain, exaggeration],
  )
  const wind = useMemo(() => windVector(windFromDeg, windKph), [windFromDeg, windKph])

  // --- Snowflakes ---
  const flakeTexture = useMemo(() => (showSnowfall ? createFlakeTexture() : null), [showSnowfall])
  const flakePositions = useMemo(() => {
    if (!showSnowfall) return new Float32Array(0)
    const positions = new Float32Array(MAX_SNOWFLAKES * 3)
    for (let i = 0; i < MAX_SNOWFLAKES; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * world.x
      positions[i * 3 + 1] = Math.random() * Math.max(snowTopY, 1)
      positions[i * 3 + 2] = (Math.random() - 0.5) * world.z
    }
    return positions
  }, [showSnowfall, world, snowTopY])
  const flakeGeometry = useRef<THREE.BufferGeometry | null>(null)

  // --- Wind streaks ---
  const streakPositions = useMemo(
    () => new Float32Array(showWind ? STREAK_COUNT * 2 * 3 : 0),
    [showWind],
  )
  const streakState = useMemo(() => {
    if (!showWind) return new Float32Array(0)
    const state = new Float32Array(STREAK_COUNT * 2) // x, z per streak
    for (let i = 0; i < STREAK_COUNT; i += 1) {
      state[i * 2] = (Math.random() - 0.5) * world.x
      state[i * 2 + 1] = (Math.random() - 0.5) * world.z
    }
    return state
  }, [showWind, world])
  const streakGeometry = useRef<THREE.BufferGeometry | null>(null)

  // --- Clouds ---
  const cloudTexture = useMemo(() => (showClouds ? createCloudTexture() : null), [showClouds])
  const cloudDeckTexture = useMemo(
    () => (showClouds ? createCloudDeckTexture() : null),
    [showClouds],
  )
  const cloudRefs = useRef<Array<THREE.Sprite | null>>([])
  const clouds = useMemo(() => {
    if (!showClouds) return []
    const items: Array<{ x: number; z: number; scale: number; opacity: number }> = []
    const count = Math.round(4 + 10 * level.cover)
    for (let i = 0; i < count; i += 1) {
      items.push({
        x: (Math.random() - 0.5) * world.x * 1.1,
        z: (Math.random() - 0.5) * world.z * 1.1,
        scale: 2.6 + Math.random() * 3.4,
        opacity: 0.35 + 0.5 * level.cover * Math.random(),
      })
    }
    return items
  }, [showClouds, world, level])

  useEffect(() => () => cloudTexture?.dispose(), [cloudTexture])
  useEffect(() => () => cloudDeckTexture?.dispose(), [cloudDeckTexture])
  useEffect(() => () => flakeTexture?.dispose(), [flakeTexture])

  const windFrameTime = useRef(0)
  useFrame((_, delta) => {
    if (!animate || (!showSnowfall && !showWind && !showClouds)) return
    const dt = Math.min(delta, 0.05)

    // Snow: fall + wind drift, wrapping within the volume below cloud base.
    const geometry = flakeGeometry.current
    if (showSnowfall && geometry) {
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
      const array = attribute.array as Float32Array
      const fall = 1.4 * WORLD_UNITS_PER_METER * TIME_SCALE * dt
      const dx = wind.vx * dt
      const dz = wind.vz * dt
      const halfX = world.x / 2
      const halfZ = world.z / 2
      const now = performance.now()
      for (let i = 0; i < flakeCount; i += 1) {
        // Per-flake sway so flakes flutter rather than fall in straight lines.
        const sway = Math.sin(now * 0.0011 + i * 1.7) * fall * 0.35
        let x = array[i * 3] + dx + sway
        let y = array[i * 3 + 1] - fall * (0.75 + ((i * 37) % 17) / 34)
        let z = array[i * 3 + 2] + dz + Math.cos(now * 0.0009 + i * 2.3) * fall * 0.25
        if (y < 0) y = Math.max(snowTopY, 1) * (0.9 + Math.random() * 0.1)
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
    if (showWind) windFrameTime.current += dt
    else windFrameTime.current = 0
    const windInterval = lowPower ? 1 / 24 : 1 / 45
    if (showWind && streaks && windFrameTime.current >= windInterval) {
      const windDt = windFrameTime.current
      windFrameTime.current = 0
      const attribute = streaks.getAttribute('position') as THREE.BufferAttribute
      const array = attribute.array as Float32Array
      const gustScale = Math.max(1, gustKph / Math.max(windKph, 1)) * 0.5
      const tailLength = 0.25 + 0.7 * clamp01(windKph / 60) + 0.4 * clamp01(gustScale - 0.5)
      const speed = Math.hypot(wind.vx, wind.vz) || 0.001
      const dirX = wind.vx / speed
      const dirZ = wind.vz / speed
      const halfX = world.x / 2
      const halfZ = world.z / 2
      for (let i = 0; i < STREAK_COUNT; i += 1) {
        let x = streakState[i * 2] + wind.vx * windDt * 1.6
        let z = streakState[i * 2 + 1] + wind.vz * windDt * 1.6
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

    if (showClouds && cloudDeckTexture) {
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
    }
  })

  return (
    <group>
      {showSnowfall ? (
        <points renderOrder={9}>
          <bufferGeometry ref={flakeGeometry}>
            <bufferAttribute attach="attributes-position" args={[flakePositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={flakeTexture ?? undefined}
            color="#ffffff"
            size={0.038}
            sizeAttenuation
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </points>
      ) : null}

      {showWind ? (
        <lineSegments renderOrder={9}>
          <bufferGeometry ref={streakGeometry}>
            <bufferAttribute attach="attributes-position" args={[streakPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#39647f" transparent opacity={0.8} depthWrite={false} />
        </lineSegments>
      ) : null}

      {showClouds ? (
        <>
          <mesh position={[0, cloudBaseY, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <planeGeometry args={[world.x * 1.3, world.z * 1.3]} />
            <meshBasicMaterial
              map={cloudDeckTexture ?? undefined}
              transparent
              opacity={0.3 + 0.6 * level.cover}
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
              position={[cloud.x, cloudBaseY + 0.18 + (index % 3) * 0.12, cloud.z]}
              scale={[cloud.scale, cloud.scale * 0.42, 1]}
              renderOrder={10}
            >
              <spriteMaterial
                map={cloudTexture ?? undefined}
                transparent
                opacity={cloud.opacity}
                depthWrite={false}
                color="#9db0c0"
              />
            </sprite>
          ))}
        </>
      ) : null}
    </group>
  )
}
