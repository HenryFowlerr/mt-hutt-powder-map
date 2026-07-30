import { Html, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { xzToLonLat } from '../lib/geo'
import { terrainPoint } from '../lib/terrain'
import { extractContours, ringArea, simplifyRing } from '../lib/marchingSquares'
import {
  buildPowderDisplayField,
  describeCell,
  powderColorForCm,
  powderDisplayScale,
  type PowderDisplayScale,
  type PowderField,
  type PowderMode,
  type PowderWeather,
} from '../lib/powderModel'
import { lonLatToGrid, sampleGrid, smoothstep, type TerrainAnalysis } from '../lib/terrainAnalysis'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  analysis: TerrainAnalysis
  field: PowderField
  weather: PowderWeather
  geometry: THREE.BufferGeometry
}

type HoverInfo = {
  position: THREE.Vector3
  cm: number
  score: number
  reason: string
  dominantFactor: string
}

const BAND_COLORS: Array<[number, [number, number, number]]> = [
  [40, [7, 95, 63]],
  [30, [8, 120, 75]],
  [20, [12, 150, 89]],
  [10, [34, 182, 109]],
  [5, [88, 207, 142]],
  [2, [136, 223, 172]],
  [0.5, [184, 236, 203]],
  [0.15, [159, 228, 184]],
]
const BAND_ALPHAS = [0.86, 0.8, 0.73, 0.65, 0.55, 0.44, 0.34, 0.48]

const TEXTURE_WIDTH = 720
const TEXTURE_HEIGHT = 840

// Bakes the powder cm field into a translucent banded texture draped over
// a clone of the terrain mesh — irregular, terrain-following patches with
// feathered edges instead of grid blobs.
function createPowderTexture(
  field: PowderField,
  displayGrid: Float32Array,
  mode: PowderMode,
  scale: PowderDisplayScale,
) {
  const rawGrid = mode === 'recent' ? field.recentCm : field.forecastCm
  const scoreGrid = mode === 'recent' ? field.recentScore : field.forecastScore
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create powder texture context')
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT)

  for (let py = 0; py < TEXTURE_HEIGHT; py += 1) {
    const gy = (py / (TEXTURE_HEIGHT - 1)) * (field.height - 1)
    for (let px = 0; px < TEXTURE_WIDTH; px += 1) {
      const gx = (px / (TEXTURE_WIDTH - 1)) * (field.width - 1)
      const displayCm = sampleGrid(displayGrid, field.width, field.height, gx, gy)
      const offset = (py * TEXTURE_WIDTH + px) * 4

      if (displayCm < scale.minimumCm) {
        image.data[offset + 3] = 0
        continue
      }

      const cm = sampleGrid(rawGrid, field.width, field.height, gx, gy)
      const score = sampleGrid(scoreGrid, field.width, field.height, gx, gy)
      let color: [number, number, number] = BAND_COLORS[BAND_COLORS.length - 1][1]
      let bandAlpha = scale.maxCm < 1 ? 0.58 : 0.28
      for (let bandIndex = 0; bandIndex < BAND_COLORS.length; bandIndex += 1) {
        if (cm >= BAND_COLORS[bandIndex][0]) {
          color = BAND_COLORS[bandIndex][1]
          bandAlpha = Math.max(BAND_ALPHAS[bandIndex], scale.maxCm < 1 ? 0.58 : 0)
          break
        }
      }

      // Make modest 5–10 cm events legible too; those are often the most
      // useful terrain decisions on Mt Hutt, not visual noise.
      const edgeFeather = smoothstep(scale.minimumCm, scale.usefulCm, displayCm)
      const confidence = smoothstep(0.18, 0.44, score)
      const alpha = edgeFeather * (0.55 + 0.45 * confidence) * bandAlpha
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = Math.round(alpha * 255)
    }
  }

  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function gridToLonLat(x: number, y: number, terrain: TerrainData) {
  return {
    lon: terrain.bounds.west + (x / (terrain.width - 1)) * (terrain.bounds.east - terrain.bounds.west),
    lat: terrain.bounds.north - (y / (terrain.height - 1)) * (terrain.bounds.north - terrain.bounds.south),
  }
}

function formatPowderCm(value: number) {
  return value > 0 && value < 1 ? value.toFixed(1) : String(Math.round(value))
}

export function PowderOverlay(props: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  if (powderMode === 'off') return null
  return <VisiblePowderOverlay {...props} mode={powderMode} />
}

function VisiblePowderOverlay({
  terrain,
  analysis,
  field,
  weather,
  geometry,
  mode,
}: Props & { mode: Exclude<PowderMode, 'off'> }) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const lastHoverTime = useRef(0)

  const grid = mode === 'recent' ? field.recentCm : field.forecastCm
  const displayScale = useMemo(() => powderDisplayScale(field, mode), [field, mode])
  const displayGrid = useMemo(() => buildPowderDisplayField(field, analysis, mode), [field, analysis, mode])

  const texture = useMemo(
    () => createPowderTexture(field, displayGrid, mode, displayScale),
    [field, displayGrid, mode, displayScale],
  )

  // Contour outlines from marching squares give the patches crisp,
  // irregular, terrain-anchored edges like snow-depth isolines.
  const contours = useMemo(() => {
    const lines: Array<{ points: THREE.Vector3[]; color: string; key: string }> = []
    for (const threshold of displayScale.contours) {
      const rings = extractContours(displayGrid, field.width, field.height, threshold)
      rings.forEach((ring, ringIndex) => {
        // Keep pockets down to ~1.5 grid cells so small terrain features
        // (single gullies, short lee walls) still get an outline.
        if (ringArea(ring) < 1.5) return
        const simplified = simplifyRing(ring, 0.3)
        if (simplified.length < 3) return
        const points = simplified.map(([x, y]) => {
          const { lon, lat } = gridToLonLat(x, y, terrain)
          const point = terrainPoint(lon, lat, terrain, exaggeration)
          point.y += 0.01
          return point
        })
        points.push(points[0].clone())
        lines.push({ points, color: powderColorForCm(threshold + 1), key: `${threshold}-${ringIndex}` })
      })
    }
    return lines
  }, [displayGrid, displayScale, field, terrain, exaggeration])

  useEffect(() => () => texture.dispose(), [texture])

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    const now = performance.now()
    if (now - lastHoverTime.current < 60) return
    lastHoverTime.current = now

    const { lon, lat } = xzToLonLat(event.point.x, event.point.z, terrain)
    const gridPos = lonLatToGrid(lon, lat, terrain)
    const displayCm = sampleGrid(displayGrid, field.width, field.height, gridPos.x, gridPos.y)
    if (displayCm < displayScale.minimumCm) {
      setHover(null)
      return
    }
    const cm = sampleGrid(grid, field.width, field.height, gridPos.x, gridPos.y)
    const scoreGrid = mode === 'recent' ? field.recentScore : field.forecastScore
    const score = sampleGrid(scoreGrid, field.width, field.height, gridPos.x, gridPos.y)
    const index =
      Math.round(Math.min(terrain.height - 1, Math.max(0, gridPos.y))) * terrain.width +
      Math.round(Math.min(terrain.width - 1, Math.max(0, gridPos.x)))
    const { reason, dominantFactor } = describeCell(index, terrain, analysis, weather, mode)
    setHover({
      position: event.point.clone().add(new THREE.Vector3(0, 0.06, 0)),
      cm,
      score,
      reason,
      dominantFactor,
    })
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        dispose={null}
        position={[0, 0.006, 0]}
        renderOrder={2}
        onPointerMove={handleMove}
        onPointerOut={() => setHover(null)}
      >
        <meshBasicMaterial
          map={texture}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          toneMapped={false}
        />
      </mesh>
      {contours.map((contour) => (
        <Line
          key={contour.key}
          points={contour.points}
          color={contour.color}
          lineWidth={1.6}
          transparent
          opacity={0.75}
          renderOrder={3}
        />
      ))}
      {hover ? (
        <Html position={hover.position} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="powder-tooltip">
            <strong>
              ~{formatPowderCm(hover.cm)} cm {mode === 'forecast' ? 'forecast' : 'recent'} powder
            </strong>
            <span>{hover.reason}</span>
            <em>
              Dominant factor: {hover.dominantFactor} · score {(hover.score * 100).toFixed(0)}%
            </em>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
