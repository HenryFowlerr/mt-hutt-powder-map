import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// One-off fetch of base-area map details from OSM: carpark polygons, the
// access road, and base buildings. Written to public/data/map-overrides.geojson
// and committed — this is static reference geometry, not part of the
// scheduled data updates.

const dataDir = join(process.cwd(), 'public', 'data')
const outputPath = join(dataDir, 'map-overrides.geojson')

const query = `
[out:json][timeout:40];
(
  way["amenity"="parking"](-43.535,171.50,-43.455,171.60);
  way["highway"~"^(unclassified|track|service|residential|tertiary)$"](-43.525,171.52,-43.47,171.60);
  way["building"](-43.505,171.52,-43.485,171.56);
);
out geom tags;
`

type OverpassElement = {
  id: number
  type: string
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

async function fetchOverpass(): Promise<{ elements: OverpassElement[] }> {
  let lastError = ''
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const endpoint = endpoints[attempt % endpoints.length]
    try {
      // curl instead of fetch: some networks break node's fetch to these
      // hosts while curl works (same workaround as fetch-osm-trails).
      const text = execFileSync(
        'curl',
        [
          '-sS',
          '--max-time',
          '55',
          '-A',
          'mt-hutt-powder-map/0.2 (personal ski map; contact via repo owner)',
          endpoint,
          '--data-urlencode',
          `data=${query}`,
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      )
      if (text.trim().startsWith('<')) throw new Error(`${endpoint} returned HTML (busy)`)
      const json = JSON.parse(text) as { elements: OverpassElement[] }
      if (!json.elements || json.elements.length < 3) throw new Error(`${endpoint} returned too little data`)
      return json
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.warn(`Attempt ${attempt + 1} failed: ${lastError}`)
      await sleep(20000)
    }
  }
  throw new Error(`All Overpass attempts failed: ${lastError}`)
}

const data = await fetchOverpass()

const features = data.elements
  .filter((element) => element.geometry && element.geometry.length >= 2)
  .map((element) => {
    const tags = element.tags ?? {}
    const kind = tags.amenity === 'parking' ? 'parking' : tags.building ? 'building' : 'road'
    const closed =
      element.geometry!.length > 3 &&
      element.geometry![0].lat === element.geometry![element.geometry!.length - 1].lat &&
      element.geometry![0].lon === element.geometry![element.geometry!.length - 1].lon
    const coordinates = element.geometry!.map((point) => [
      Number(point.lon.toFixed(6)),
      Number(point.lat.toFixed(6)),
    ])
    return {
      type: 'Feature' as const,
      properties: { kind, name: tags.name ?? '', osmId: element.id },
      geometry:
        kind === 'road' && !closed
          ? { type: 'LineString' as const, coordinates }
          : { type: 'Polygon' as const, coordinates: [coordinates] },
    }
  })

writeFileSync(
  outputPath,
  `${JSON.stringify({ type: 'FeatureCollection', features }, null, 1)}\n`,
)
const counts: Record<string, number> = {}
for (const feature of features) counts[feature.properties.kind] = (counts[feature.properties.kind] ?? 0) + 1
console.log(`Wrote ${features.length} base-detail features to ${outputPath}`, counts)

// Keep a marker so re-runs know the file is real data, not a placeholder.
if (!existsSync(outputPath)) throw new Error('write failed')
void readFileSync(outputPath, 'utf8')
