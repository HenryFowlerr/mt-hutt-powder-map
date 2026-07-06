import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = join(process.cwd(), 'public', 'data')
const terrainPath = join(dataDir, 'terrain.json')
const fallback = JSON.parse(readFileSync(terrainPath, 'utf8'))

const bounds = fallback.bounds
const width = Number(process.env.TERRAIN_WIDTH ?? 32)
const height = Number(process.env.TERRAIN_HEIGHT ?? 32)
const batchSize = Number(process.env.TERRAIN_BATCH_SIZE ?? 80)
const batchDelayMs = Number(process.env.TERRAIN_BATCH_DELAY_MS ?? 1200)
const endpoint = 'https://api.opentopodata.org/v1/nzdem8m'

type ElevationResult = {
  elevation: number | null
  location: {
    lat: number
    lng: number
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchBatch(locations: string[]) {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: new URLSearchParams({
      locations: locations.join('|'),
      interpolation: 'bilinear',
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'mt-hutt-powder-map/0.1 (personal ski map; contact via repo owner)',
    },
  })

  if (!response.ok) throw new Error(`OpenTopoData returned ${response.status}`)
  const json = (await response.json()) as { status: string; error?: string; results?: ElevationResult[] }
  if (json.status !== 'OK' || !json.results) {
    throw new Error(json.error || `OpenTopoData status ${json.status}`)
  }
  return json.results.map((result) => result.elevation)
}

const locations: string[] = []
for (let row = 0; row < height; row += 1) {
  for (let col = 0; col < width; col += 1) {
    const lon = bounds.west + (col / (width - 1)) * (bounds.east - bounds.west)
    const lat = bounds.north - (row / (height - 1)) * (bounds.north - bounds.south)
    locations.push(`${lat.toFixed(6)},${lon.toFixed(6)}`)
  }
}

const elevations: Array<number | null> = []

try {
  for (let i = 0; i < locations.length; i += batchSize) {
    const batch = locations.slice(i, i + batchSize)
    elevations.push(...(await fetchBatch(batch)))
    await sleep(batchDelayMs)
    console.log(`Fetched ${Math.min(i + batch.length, locations.length)} / ${locations.length} terrain points`)
  }

  const fallbackHeights = fallback.heights as number[]
  const heights = elevations.map((elevation, index) => {
    if (typeof elevation === 'number' && Number.isFinite(elevation)) return Math.round(elevation)
    const fallbackIndex = Math.round((index / elevations.length) * (fallbackHeights.length - 1))
    return fallbackHeights[fallbackIndex]
  })

  const terrain = {
    bounds,
    width,
    height,
    minElevation: Math.min(...heights),
    maxElevation: Math.max(...heights),
    heights,
    source: 'OpenTopoData nzdem8m',
    generatedAt: new Date().toISOString(),
  }

  writeFileSync(terrainPath, `${JSON.stringify(terrain)}\n`)
  console.log(`Wrote ${width}x${height} OpenTopoData terrain to ${terrainPath}`)
} catch (error) {
  console.warn(`Terrain fetch failed, keeping fallback terrain: ${error instanceof Error ? error.message : String(error)}`)
}
