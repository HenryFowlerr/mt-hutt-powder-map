import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { sampleElevation, skiAreaCenter, terrainPoint } from '../lib/terrain'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
}

type MapLabel = {
  text: string
  className: string
  position: THREE.Vector3
  major: boolean
}

// Labels use screen-space HTML at a fixed pixel size (no distanceFactor),
// so zooming never makes them huge or blurry. Minor labels only appear
// when the camera is close.

const MAJOR_LIFTS = new Set(['Summit Six Chair', 'Towers Triple Chair', 'Norwest Express'])
const LIFT_DISPLAY: Record<string, string> = {
  'Norwest Express': "NOR'WEST EXPRESS",
  'Summit Six Chair': 'SUMMIT SIX CHAIR',
  'Towers Triple Chair': 'TOWERS TRIPLE CHAIR',
}
const MAJOR_RUNS = new Set(['Broadway', 'International'])

// Named areas anchored to real OSM run geometry so they georeference
// correctly without hand-traced coordinates.
const AREA_ANCHOR_RUNS: Array<[string, string]> = [
  ['SOUTH FACE', 'Saddle Face'],
  ['MID TOWERS', 'Mid Towers 2'],
  ['MUESLI BOWL', 'Muesli Bowl'],
  ['LOWER TRIPLE', 'Log Chute'],
  ['RAKAIA SADDLE CHUTES', 'Chute 3'],
]

function lineMidpoint(coords: number[][]) {
  return coords[Math.floor(coords.length / 2)]
}

function runByName(trails: TrailCollection, name: string) {
  const feature = trails.features.find(
    (candidate) => candidate.properties.name === name && candidate.geometry.type === 'LineString',
  )
  return feature ? (feature.geometry.coordinates as number[][]) : null
}

function buildLabels(terrain: TerrainData, trails: TrailCollection, exaggeration: number): MapLabel[] {
  const labels: MapLabel[] = []
  const lift = (offset: number) => 0.06 + offset

  const seenRuns = new Set<string>()
  let summitTop: number[] | null = null
  let baseBottom: number[] | null = null

  for (const feature of trails.features) {
    if (feature.geometry.type !== 'LineString') continue
    const coords = feature.geometry.coordinates as number[][]
    if (coords.length < 2) continue
    const name = feature.properties.name

    if (feature.properties.kind === 'lift') {
      const first = coords[0]
      const last = coords[coords.length - 1]
      const firstElev = sampleElevation(first[0], first[1], terrain)
      const lastElev = sampleElevation(last[0], last[1], terrain)
      const top = firstElev > lastElev ? first : last
      const bottom = firstElev > lastElev ? last : first

      if (name === 'Summit Six Chair') summitTop = top
      if (name === 'Norwest Express') baseBottom = bottom

      if (MAJOR_LIFTS.has(name)) {
        const [lon, lat] = lineMidpoint(coords)
        const position = terrainPoint(lon, lat, terrain, exaggeration)
        position.y += lift(0.05)
        labels.push({ text: LIFT_DISPLAY[name] ?? name.toUpperCase(), className: 'map-label lift', position, major: true })
      }
      continue
    }

    if (feature.properties.kind !== 'run') continue
    const isNamed = Boolean(name) && !/^(Run|Lift) \d+$/.test(name)
    if (!isNamed || seenRuns.has(name)) continue
    seenRuns.add(name)

    const [lon, lat] = lineMidpoint(coords)
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0)
    const difficulty = feature.properties.difficulty ?? 'unknown'
    labels.push({
      text: name,
      className: `map-label run ${difficulty}`,
      position,
      major: MAJOR_RUNS.has(name),
    })
  }

  for (const [text, runName] of AREA_ANCHOR_RUNS) {
    const coords = runByName(trails, runName)
    if (!coords) continue
    const [lon, lat] = lineMidpoint(coords)
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.08)
    labels.push({ text, className: 'map-label area', position, major: true })
  }

  if (summitTop) {
    const [lon, lat] = summitTop
    const elevation = Math.round(sampleElevation(lon, lat, terrain))
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.06)
    labels.push({ text: `${elevation} m`, className: 'map-label elevation', position, major: true })
  }

  if (baseBottom) {
    const [lon, lat] = baseBottom
    const elevation = Math.round(sampleElevation(lon, lat, terrain))
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.04)
    labels.push({ text: `BASE ${elevation} m`, className: 'map-label area', position, major: true })
  }

  return labels
}

export function MapLabels({ terrain, trails }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const showTrails = useViewStore((state) => state.showTrails)
  const camera = useThree((state) => state.camera)
  const [closeZoom, setCloseZoom] = useState(false)
  const frameCount = useRef(0)

  const labels = useMemo(
    () => buildLabels(terrain, trails, exaggeration),
    [terrain, trails, exaggeration],
  )

  const center = useMemo(
    () => skiAreaCenter(terrain, trails, exaggeration),
    [terrain, trails, exaggeration],
  )

  // Check zoom level a few times a second instead of every frame. Minor
  // labels appear only when the camera moves close to the ski area.
  useFrame(() => {
    frameCount.current += 1
    if (frameCount.current % 12 !== 0) return
    const distance = camera.position.distanceTo(center)
    const zoomedIn =
      camera instanceof THREE.OrthographicCamera ? camera.zoom > 110 : distance < 4.4
    if (zoomedIn !== closeZoom) setCloseZoom(zoomedIn)
  })

  if (!showTrails) return null

  return (
    <group>
      {labels
        .filter((label) => label.major || closeZoom)
        .map((label) => (
          <Html
            key={`${label.text}-${label.position.x.toFixed(3)}`}
            position={label.position}
            center
            zIndexRange={[3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className={label.className}>{label.text}</span>
          </Html>
        ))}
    </group>
  )
}
