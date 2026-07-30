import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  METERS_PER_DEGREE_LAT,
  metersPerDegreeLon,
  polylineMidpoint,
  terrainCenter,
} from '../src/lib/geo'
import { applyTrailOverrides } from '../src/lib/trailOverrides'
import { ZONE_CONFIG } from '../src/lib/zoneSummary'
import type { TerrainData, TrailCollection, TrailFeature } from '../src/types'

const DATA_DIR = join(process.cwd(), 'public', 'data')

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8')) as T
}

function distanceMeters(
  a: readonly number[],
  b: readonly number[],
  referenceLat: number,
) {
  return Math.hypot(
    (b[0] - a[0]) * metersPerDegreeLon(referenceLat),
    (b[1] - a[1]) * METERS_PER_DEGREE_LAT,
  )
}

function polylineLengthMeters(
  coordinates: readonly (readonly number[])[],
  referenceLat: number,
) {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    total += distanceMeters(coordinates[index - 1], coordinates[index], referenceLat)
  }
  return total
}

function distanceAlongLine(
  coordinates: readonly (readonly number[])[],
  point: readonly number[],
  referenceLat: number,
) {
  const lonScale = metersPerDegreeLon(referenceLat)
  let travelled = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let bestAlong = 0

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    const dx = (end[0] - start[0]) * lonScale
    const dy = (end[1] - start[1]) * METERS_PER_DEGREE_LAT
    const px = (point[0] - start[0]) * lonScale
    const py = (point[1] - start[1]) * METERS_PER_DEGREE_LAT
    const lengthSquared = dx * dx + dy * dy
    const fraction = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
    const offsetX = px - fraction * dx
    const offsetY = py - fraction * dy
    const pointDistance = Math.hypot(offsetX, offsetY)
    if (pointDistance < bestDistance) {
      bestDistance = pointDistance
      bestAlong = travelled + Math.sqrt(lengthSquared) * fraction
    }
    travelled += Math.sqrt(lengthSquared)
  }

  return { distance: bestDistance, along: bestAlong }
}

function positions(feature: TrailFeature): number[][] {
  if (feature.geometry.type === 'Point') {
    return [feature.geometry.coordinates as number[]]
  }
  if (feature.geometry.type === 'LineString') {
    return feature.geometry.coordinates as number[][]
  }
  return (feature.geometry.coordinates as number[][][]).flat()
}

// Pure geometry behavior, including the explicitly supported degenerate cases.
assert.equal(polylineMidpoint([], -43.495), null, 'an empty line must not invent an anchor')

const single = [171.54, -43.49]
const singleMidpoint = polylineMidpoint([single], -43.495)
assert.deepEqual(singleMidpoint, single, 'a single-point line must return that coordinate')
assert.notEqual(singleMidpoint, single, 'a single-point line must return a safe copy')

assert.deepEqual(
  polylineMidpoint([[0, 0], [2, 2]], 0),
  [1, 1],
  'a two-point line must anchor halfway between its endpoints',
)
assert.deepEqual(
  polylineMidpoint([[4, 5], [4, 5], [4, 5]], 0),
  [4, 5],
  'a zero-length line must return its first coordinate',
)

const nonUniform = [
  [171.5, -43.495],
  [171.501, -43.495],
  [171.504, -43.495],
]
const nonUniformMidpoint = polylineMidpoint(nonUniform, -43.495)
assert(nonUniformMidpoint, 'a non-empty line must have a midpoint')
assert(
  Math.abs(nonUniformMidpoint[0] - 171.502) < 1e-12
    && Math.abs(nonUniformMidpoint[1] + 43.495) < 1e-12,
  'midpoint must follow cumulative distance, not the middle array index',
)

const terrain = readJson<TerrainData>('terrain.json')
const trails = applyTrailOverrides(readJson<TrailCollection>('trails.geojson'))
const referenceLat = terrainCenter(terrain).lat
const bounds = terrain.bounds

for (const feature of trails.features) {
  for (const [lon, lat] of positions(feature)) {
    assert(
      lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north,
      `${feature.properties.name || 'unnamed feature'} must remain inside the terrain bounds`,
    )
  }
}

let largestLegacyShift = { name: '', metres: 0 }
for (const [zoneName, runName] of ZONE_CONFIG) {
  const feature = trails.features.find(
    (candidate) =>
      candidate.properties.name === runName
      && candidate.properties.kind === 'run'
      && candidate.geometry.type === 'LineString',
  )
  assert(feature, `${zoneName} must reference an existing post-override run (${runName})`)

  const coordinates = feature.geometry.coordinates as number[][]
  const midpoint = polylineMidpoint(coordinates, referenceLat)
  assert(midpoint, `${zoneName} must have a non-empty anchor line`)
  assert(
    midpoint[0] >= bounds.west
      && midpoint[0] <= bounds.east
      && midpoint[1] >= bounds.south
      && midpoint[1] <= bounds.north,
    `${zoneName} midpoint must remain inside the terrain bounds`,
  )

  const totalLength = polylineLengthMeters(coordinates, referenceLat)
  const located = distanceAlongLine(coordinates, midpoint, referenceLat)
  assert(
    located.distance < 0.001,
    `${zoneName} midpoint must lie on its source run (offset ${located.distance} m)`,
  )
  assert(
    Math.abs(located.along - totalLength / 2) < 0.001,
    `${zoneName} midpoint must split its source run into equal ground distances`,
  )

  const legacy = coordinates[Math.floor(coordinates.length / 2)]
  const legacyShift = distanceMeters(legacy, midpoint, referenceLat)
  if (legacyShift > largestLegacyShift.metres) {
    largestLegacyShift = { name: zoneName, metres: legacyShift }
  }
}

console.log(
  [
    'Cartographic integrity passed',
    '  distance-weighted midpoint behavior valid for empty, single, zero-length, two-point, and non-uniform lines',
    `  ${trails.features.length} trail features remain within the DEM`,
    `  ${ZONE_CONFIG.length} zone anchors exist, lie on their runs, and split distance 50/50`,
    `  largest corrected legacy zone offset: ${largestLegacyShift.name} ${largestLegacyShift.metres.toFixed(1)} m`,
  ].join('\n'),
)
