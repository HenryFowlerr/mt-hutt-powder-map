import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const dataDir = join(process.cwd(), 'public', 'data')
const outputPath = join(dataDir, 'trails.geojson')
const fallback = JSON.parse(readFileSync(outputPath, 'utf8'))

const bounds = {
  south: -43.535,
  west: 171.505,
  north: -43.455,
  east: 171.59,
}

const query = `
[out:json][timeout:25];
(
  way["piste:type"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["aerialway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out geom;
`

type OverpassElement = {
  id: number
  type: string
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

function difficulty(tags: Record<string, string> = {}) {
  const value = tags['piste:difficulty']
  if (value === 'easy' || value === 'novice') return 'beginner'
  if (value === 'intermediate') return 'intermediate'
  if (value === 'advanced') return 'advanced'
  if (value === 'expert') return 'expert'
  if (value === 'freeride' || value === 'extreme') return 'extreme'
  return undefined
}

function trailColor(mapped?: string) {
  if (mapped === 'beginner') return '#26a64b'
  if (mapped === 'intermediate') return '#2563eb'
  if (mapped === 'advanced' || mapped === 'expert') return '#1f2937'
  if (mapped === 'extreme') return '#111827'
  return '#d9480f'
}

async function fetchOverpass(endpoint: string) {
  const body = new URLSearchParams({ data: query })
  const response = await fetch(endpoint, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'mt-hutt-powder-map/0.1 (personal ski map; contact via repo owner)',
    },
  })
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`)
  const text = await response.text()
  if (text.trim().startsWith('<')) throw new Error(`${endpoint} returned HTML instead of JSON`)
  return JSON.parse(text) as { elements: OverpassElement[] }
}

function fetchOverpassWithCurl(endpoint: string) {
  const text = execFileSync(
    'curl',
    [
      '-sS',
      '--max-time',
      '30',
      '-A',
      'mt-hutt-powder-map/0.1 (personal ski map; contact via repo owner)',
      endpoint,
      '--data-urlencode',
      `data=${query}`,
    ],
    { encoding: 'utf8' },
  )
  if (text.trim().startsWith('<')) throw new Error(`${endpoint} returned HTML instead of JSON`)
  return JSON.parse(text) as { elements: OverpassElement[] }
}

const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

let data: { elements: OverpassElement[] } | null = null
let lastError = ''

for (const endpoint of endpoints) {
  try {
    data = await fetchOverpass(endpoint)
    break
  } catch (error) {
    lastError =
      error instanceof Error
        ? `${error.message}${'cause' in error && error.cause ? `: ${String(error.cause)}` : ''}`
        : String(error)
  }
}

if (!data) {
  for (const endpoint of endpoints) {
    try {
      data = fetchOverpassWithCurl(endpoint)
      break
    } catch (error) {
      lastError =
        error instanceof Error
          ? `${error.message}${'cause' in error && error.cause ? `: ${String(error.cause)}` : ''}`
          : String(error)
    }
  }
}

if (!data || data.elements.length < 8) {
  console.warn(`OSM trail fetch failed or returned too little data. Keeping fallback. ${lastError}`)
  process.exit(0)
}

const labelled = new Set<string>()
const features = [
  fallback.features.find((feature: any) => feature.properties.kind === 'boundary'),
  ...data.elements
    .filter((element) => element.geometry && element.geometry.length >= 2)
    .map((element) => {
      const tags = element.tags ?? {}
      const isLift = Boolean(tags.aerialway)
      const mappedDifficulty = difficulty(tags)
      const name = tags.name || `${isLift ? 'Lift' : 'Run'} ${element.id}`
      const shouldLabel = Boolean(tags.name) && labelled.size < 12 && !labelled.has(name)
      if (shouldLabel) labelled.add(name)

      return {
        type: 'Feature',
        properties: {
          name,
          kind: isLift ? 'lift' : 'run',
          difficulty: mappedDifficulty,
          color: isLift ? '#d9480f' : trailColor(mappedDifficulty),
          label: shouldLabel,
          source: 'OpenStreetMap',
          osmId: element.id,
        },
        geometry: {
          type: 'LineString',
          coordinates: element.geometry!.map((point) => [Number(point.lon.toFixed(6)), Number(point.lat.toFixed(6))]),
        },
      }
    }),
].filter(Boolean)

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      type: 'FeatureCollection',
      features,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote ${features.length} OSM trail/lift features to ${outputPath}`)
