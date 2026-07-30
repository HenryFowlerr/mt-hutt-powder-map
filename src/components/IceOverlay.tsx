import { Html } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { xzToLonLat } from '../lib/geo'
import { describeIce, iceRiskLabel, type IceField, type IceWeather } from '../lib/iceModel'
import { lonLatToGrid, sampleGrid, smoothstep, type TerrainAnalysis } from '../lib/terrainAnalysis'
import { useViewStore } from '../state/viewStore'
import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  analysis: TerrainAnalysis
  field: IceField
  weather: IceWeather
  geometry: THREE.BufferGeometry
}

const TEXTURE_WIDTH = 720
const TEXTURE_HEIGHT = 840

// Ice risk bands (cool blue-white), painted onto a clone of the terrain
// surface — irregular, terrain-following, like the powder overlay but
// answering "where is it likely icy / hard?".
const BANDS: Array<[number, [number, number, number], number]> = [
  [0.75, [74, 163, 217], 0.7],
  [0.55, [124, 192, 228], 0.58],
  [0.38, [169, 214, 239], 0.44],
  [0.22, [207, 232, 246], 0.3],
]

function createIceTexture(field: IceField) {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create ice texture context')
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT)

  for (let py = 0; py < TEXTURE_HEIGHT; py += 1) {
    const gy = (py / (TEXTURE_HEIGHT - 1)) * (field.height - 1)
    for (let px = 0; px < TEXTURE_WIDTH; px += 1) {
      const gx = (px / (TEXTURE_WIDTH - 1)) * (field.width - 1)
      const risk = sampleGrid(field.risk, field.width, field.height, gx, gy)
      const offset = (py * TEXTURE_WIDTH + px) * 4
      if (risk < 0.2) {
        image.data[offset + 3] = 0
        continue
      }
      let color = BANDS[BANDS.length - 1][1]
      let alpha = BANDS[BANDS.length - 1][2]
      for (const [threshold, bandColor, bandAlpha] of BANDS) {
        if (risk >= threshold) {
          color = bandColor
          alpha = bandAlpha
          break
        }
      }
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = Math.round(smoothstep(0.2, 0.32, risk) * alpha * 255)
    }
  }

  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function IceOverlay(props: Props) {
  const showIce = useViewStore((state) => state.showIce)
  if (!showIce) return null
  return <VisibleIceOverlay {...props} />
}

function VisibleIceOverlay({ terrain, analysis, field, weather, geometry }: Props) {
  const [hover, setHover] = useState<{ position: THREE.Vector3; risk: number; reason: string } | null>(null)
  const lastHover = useRef(0)

  const texture = useMemo(() => createIceTexture(field), [field])

  useEffect(() => () => texture.dispose(), [texture])

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    const now = performance.now()
    if (now - lastHover.current < 60) return
    lastHover.current = now
    const { lon, lat } = xzToLonLat(event.point.x, event.point.z, terrain)
    const gridPos = lonLatToGrid(lon, lat, terrain)
    const risk = sampleGrid(field.risk, field.width, field.height, gridPos.x, gridPos.y)
    if (risk < 0.2) {
      setHover(null)
      return
    }
    const index =
      Math.round(Math.min(terrain.height - 1, Math.max(0, gridPos.y))) * terrain.width +
      Math.round(Math.min(terrain.width - 1, Math.max(0, gridPos.x)))
    setHover({
      position: event.point.clone().add(new THREE.Vector3(0, 0.06, 0)),
      risk,
      reason: describeIce(index, terrain, analysis, weather),
    })
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        dispose={null}
        position={[0, 0.008, 0]}
        renderOrder={2}
        onPointerMove={handleMove}
        onPointerOut={() => setHover(null)}
      >
        <meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
      </mesh>
      {hover ? (
        <Html position={hover.position} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="map-tooltip ice">
            <strong>{iceRiskLabel(hover.risk)}</strong>
            <span>{hover.reason}</span>
            <em>Ice risk {(hover.risk * 100).toFixed(0)}%</em>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
