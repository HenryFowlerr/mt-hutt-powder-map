import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { CSSProperties } from 'react'
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
  id: string
  text: string
  className: string
  kind: 'lift' | 'run' | 'area' | 'elevation'
  position: THREE.Vector3
  priority: number
  minDetail: 0 | 1 | 2
}

const MAJOR_LIFTS = new Set(['Summit Six Chair', 'Towers Triple Chair', 'Norwest Express'])
const LIFT_DISPLAY: Record<string, string> = {
  'Norwest Express': "NOR'WEST EXPRESS",
  'Summit Six Chair': 'SUMMIT SIX CHAIR',
  'Towers Triple Chair': 'TOWERS TRIPLE CHAIR',
}
const MAJOR_RUNS = new Set(['Broadway', 'International'])

// Named areas anchored to real OSM run geometry so they georeference
// correctly without hand-traced coordinates. Verified against the official
// 2026 map: the chutes west of the summit (Chute 3, Whistle Bowl, Dog Leg)
// belong to the South Face zone — Rakaia Saddle Chutes is a separate
// off-map restricted area shown only as an inset on the official map.
const AREA_ANCHOR_RUNS: Array<[string, string]> = [
  ['SOUTH FACE', 'Saddle Face'],
  ['TOP TOWERS', "Jan's Face"],
  ['MID TOWERS', 'Mid Towers 2'],
  ['MUESLI BOWL', 'Muesli Bowl'],
  ['LOWER TRIPLE', 'Log Chute'],
]

const AREA_PRIORITY: Record<string, number> = {
  'SOUTH FACE': 2,
  'TOP TOWERS': 3,
  'MUESLI BOWL': 4,
  'MID TOWERS': 5,
  'LOWER TRIPLE': 6,
}

const HALO_STYLE: CSSProperties = {
  padding: 0,
  border: 0,
  borderRadius: 0,
  background: 'transparent',
  boxShadow: 'none',
  backdropFilter: 'none',
  textShadow:
    '-1px -1px 0 rgba(250,253,254,.94), 1px -1px 0 rgba(250,253,254,.94), -1px 1px 0 rgba(250,253,254,.94), 1px 1px 0 rgba(250,253,254,.94), 0 1px 3px rgba(250,253,254,.9)',
}

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
        labels.push({
          id: `lift-${name}`,
          text: LIFT_DISPLAY[name] ?? name.toUpperCase(),
          className: 'map-label lift',
          kind: 'lift',
          position,
          priority: name === 'Summit Six Chair' ? 1 : name === 'Norwest Express' ? 2 : 4,
          minDetail: 0,
        })
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
      id: `run-${name}`,
      text: name,
      className: `map-label run ${difficulty}`,
      kind: 'run',
      position,
      priority: MAJOR_RUNS.has(name) ? 7 : 10,
      minDetail: MAJOR_RUNS.has(name) ? 1 : 2,
    })
  }

  for (const [text, runName] of AREA_ANCHOR_RUNS) {
    const coords = runByName(trails, runName)
    if (!coords) continue
    const [lon, lat] = lineMidpoint(coords)
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.08)
    labels.push({
      id: `area-${text}`,
      text,
      className: 'map-label area',
      kind: 'area',
      position,
      priority: AREA_PRIORITY[text] ?? 6,
      minDetail: text === 'SOUTH FACE' || text === 'TOP TOWERS' ? 0 : 1,
    })
  }

  if (summitTop) {
    const [lon, lat] = summitTop
    const elevation = Math.round(sampleElevation(lon, lat, terrain))
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.06)
    labels.push({
      id: 'summit-elevation',
      text: `SUMMIT · ${elevation} M`,
      className: 'map-label elevation',
      kind: 'elevation',
      position,
      priority: 0,
      minDetail: 0,
    })
  }

  if (baseBottom) {
    const [lon, lat] = baseBottom
    const elevation = Math.round(sampleElevation(lon, lat, terrain))
    const position = terrainPoint(lon, lat, terrain, exaggeration)
    position.y += lift(0.04)
    labels.push({
      id: 'base-elevation',
      text: `BASE · ${elevation} M`,
      className: 'map-label area',
      kind: 'area',
      position,
      priority: 0,
      minDetail: 0,
    })
  }

  return labels
}

function estimatedBounds(label: MapLabel, x: number, y: number) {
  const characterWidth = label.kind === 'area' ? 6.8 : label.kind === 'lift' ? 5.2 : 5
  const width = Math.max(30, label.text.length * characterWidth + 6)
  const height = label.kind === 'area' ? 15 : 14
  return {
    left: x - width / 2 - 4,
    right: x + width / 2 + 4,
    top: y - height / 2 - 3,
    bottom: y + height / 2 + 3,
  }
}

function overlaps(
  a: ReturnType<typeof estimatedBounds>,
  b: ReturnType<typeof estimatedBounds>,
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function MapLabels({ terrain, trails }: Props) {
  const exaggeration = useViewStore((state) => state.exaggeration)
  const showTrails = useViewStore((state) => state.showTrails)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const visibleSignature = useRef('')
  const frameCount = useRef(0)

  const labels = useMemo(
    () => buildLabels(terrain, trails, exaggeration),
    [terrain, trails, exaggeration],
  )

  const center = useMemo(
    () => skiAreaCenter(terrain, trails, exaggeration),
    [terrain, trails, exaggeration],
  )

  // Layout happens in projected screen space, so labels retain their fixed
  // typographic size without colliding as the camera moves. A small label
  // budget keeps the mobile overview deliberately quieter than desktop.
  useFrame(() => {
    frameCount.current += 1
    if (frameCount.current % 8 !== 0) return

    const distance = camera.position.distanceTo(center)
    const detail: 0 | 1 | 2 =
      camera instanceof THREE.OrthographicCamera
        ? camera.zoom >= 155
          ? 2
          : camera.zoom >= 90
            ? 1
            : 0
        : distance <= 2.8
          ? 2
          : distance <= 4.8
            ? 1
            : 0
    const mobile = size.width < 620
    const budget = mobile
      ? detail === 0
        ? 6
        : detail === 1
          ? 11
          : 17
      : detail === 0
        ? 9
        : detail === 1
          ? 16
          : 28

    const accepted: ReturnType<typeof estimatedBounds>[] = []
    const nextVisible: string[] = []
    const projected = new THREE.Vector3()
    const ordered = labels
      .filter((label) => label.minDetail <= detail)
      .sort((a, b) => a.priority - b.priority || a.text.localeCompare(b.text))

    for (const label of ordered) {
      projected.copy(label.position).project(camera)
      if (projected.z < -1 || projected.z > 1) continue
      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const bounds = estimatedBounds(label, x, y)
      if (
        bounds.left < 8 ||
        bounds.right > size.width - 8 ||
        bounds.top < 8 ||
        bounds.bottom > size.height - 8 ||
        accepted.some((candidate) => overlaps(bounds, candidate))
      ) {
        continue
      }
      accepted.push(bounds)
      nextVisible.push(label.id)
      if (nextVisible.length >= budget) break
    }

    const signature = nextVisible.join('|')
    if (signature !== visibleSignature.current) {
      visibleSignature.current = signature
      setVisibleIds(new Set(nextVisible))
    }
  })

  if (!showTrails) return null

  return (
    <group>
      {labels
        .filter((label) => visibleIds.has(label.id))
        .map((label) => (
          <Html
            key={label.id}
            position={label.position}
            center
            zIndexRange={[3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span
              aria-hidden="true"
              className={label.className}
              style={label.kind === 'run' || label.kind === 'lift' ? HALO_STYLE : undefined}
            >
              {label.text}
            </span>
          </Html>
        ))}
    </group>
  )
}
