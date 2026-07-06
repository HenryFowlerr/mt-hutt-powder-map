import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Cache-aware OpenTopoData terrain fetcher for the Mt Hutt ski area.
// Samples a tight ski-area bbox at high resolution, caches batches to disk
// so rate limits/failures never destroy progress, and resumes from cache.
//
// OpenTopoData public API limits: 100 locations/request, ~1 request/sec.
// Terrain is static — run this manually, not from scheduled CI.

const dataDir = join(process.cwd(), 'public', 'data')
const cacheDir = join(process.cwd(), '.terrain-cache')
mkdirSync(cacheDir, { recursive: true })

const bounds = {
  west: 171.5,
  south: -43.535,
  east: 171.592,
  north: -43.455,
}

const width = Number(process.env.TERRAIN_WIDTH ?? 120)
const height = Number(process.env.TERRAIN_HEIGHT ?? 140)
const batchSize = 100
const batchDelayMs = Number(process.env.TERRAIN_BATCH_DELAY_MS ?? 1100)
const endpoint = 'https://api.opentopodata.org/v1/nzdem8m'
const cachePath = join(cacheDir, `elevations-${width}x${height}.json`)
const terrainPath = join(dataDir, 'terrain.json')

type ElevationResult = {
  elevation: number | null
  location: { lat: number; lng: number }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchBatch(locations: string[], attempt = 0): Promise<Array<number | null>> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: new URLSearchParams({ locations: locations.join('|'), interpolation: 'bilinear' }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'mt-hutt-powder-map/0.2 (personal ski map; contact via repo owner)',
      },
    })
  } catch (error) {
    if (attempt < 6) {
      await sleep(4000 * (attempt + 1))
      return fetchBatch(locations, attempt + 1)
    }
    throw error
  }

  if (response.status === 429 && attempt < 5) {
    await sleep(5000 * (attempt + 1))
    return fetchBatch(locations, attempt + 1)
  }
  if (!response.ok) throw new Error(`OpenTopoData returned ${response.status}`)
  const json = (await response.json()) as { status: string; error?: string; results?: ElevationResult[] }
  if (json.status !== 'OK' || !json.results) throw new Error(json.error || `OpenTopoData status ${json.status}`)
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

const cache: Record<string, Array<number | null>> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, 'utf8'))
  : {}

const totalBatches = Math.ceil(locations.length / batchSize)

for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
  const key = String(batchIndex)
  if (cache[key]) continue
  const batch = locations.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
  cache[key] = await fetchBatch(batch)
  writeFileSync(cachePath, JSON.stringify(cache))
  console.log(`Fetched batch ${batchIndex + 1} / ${totalBatches}`)
  await sleep(batchDelayMs)
}

const elevations: Array<number | null> = []
for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
  elevations.push(...cache[String(batchIndex)])
}

// Fill the rare null (no-data) cell from its nearest valid neighbour in the row.
const heights = elevations.map((elevation, index) => {
  if (typeof elevation === 'number' && Number.isFinite(elevation)) return Math.round(elevation * 10) / 10
  for (let offset = 1; offset < width; offset += 1) {
    for (const neighbour of [elevations[index - offset], elevations[index + offset]]) {
      if (typeof neighbour === 'number' && Number.isFinite(neighbour)) return Math.round(neighbour * 10) / 10
    }
  }
  return 0
})

const terrain = {
  bounds,
  width,
  height,
  minElevation: Math.min(...heights),
  maxElevation: Math.max(...heights),
  heights,
  source: 'OpenTopoData nzdem8m (LINZ NZ DEM 8m)',
  generatedAt: new Date().toISOString(),
}

writeFileSync(terrainPath, `${JSON.stringify(terrain)}\n`)
console.log(`Wrote ${width}x${height} terrain to ${terrainPath}`)
