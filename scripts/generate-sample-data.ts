import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = join(process.cwd(), 'public', 'data')
mkdirSync(dataDir, { recursive: true })

const bounds = {
  west: 171.505,
  south: -43.535,
  east: 171.59,
  north: -43.455,
}

const width = 150
const height = 150
const heights: number[] = []

for (let row = 0; row < height; row += 1) {
  for (let col = 0; col < width; col += 1) {
    const x = col / (width - 1)
    const y = row / (height - 1)
    const summitRidge = 1 - Math.abs(x - 0.55) * 1.8
    const upperBasin = Math.exp(-((x - 0.55) ** 2 / 0.04 + (y - 0.35) ** 2 / 0.06))
    const southFace = Math.exp(-((x - 0.42) ** 2 / 0.035 + (y - 0.55) ** 2 / 0.08))
    const lowerRuns = Math.exp(-((x - 0.65) ** 2 / 0.08 + (y - 0.7) ** 2 / 0.12))
    const gullies = Math.sin(x * Math.PI * 9) * Math.cos(y * Math.PI * 5) * 34
    const fallLine = (1 - y) * 420
    const elevation =
      1350 +
      fallLine +
      Math.max(0, summitRidge) * 360 +
      upperBasin * 260 +
      southFace * 180 +
      lowerRuns * 80 +
      gullies
    heights.push(Math.round(elevation))
  }
}

const terrain = {
  bounds,
  width,
  height,
  minElevation: Math.min(...heights),
  maxElevation: Math.max(...heights),
  heights,
}

const p = (lon: number, lat: number) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]
const line = (
  name: string,
  kind: 'run' | 'lift' | 'boundary',
  coords: number[][],
  difficulty?: string,
  color?: string,
  label = false,
) => ({
  type: 'Feature',
  properties: { name, kind, difficulty, color, label },
  geometry: { type: 'LineString', coordinates: coords },
})

const trails = {
  type: 'FeatureCollection',
  features: [
    line(
      'Ski Area Boundary',
      'boundary',
      [
        p(171.522, -43.466),
        p(171.567, -43.463),
        p(171.583, -43.49),
        p(171.574, -43.528),
        p(171.522, -43.529),
        p(171.511, -43.493),
        p(171.522, -43.466),
      ],
      undefined,
      '#f8fafc',
    ),
    line('International Express', 'lift', [p(171.552, -43.518), p(171.548, -43.498), p(171.546, -43.476)], undefined, '#d9480f', true),
    line('Summit Six', 'lift', [p(171.56, -43.516), p(171.561, -43.495), p(171.563, -43.47)], undefined, '#d9480f', true),
    line('Towers Triple', 'lift', [p(171.536, -43.522), p(171.535, -43.501), p(171.533, -43.482)], undefined, '#d9480f', true),
    line('Magic Carpet', 'lift', [p(171.565, -43.522), p(171.568, -43.516)], undefined, '#d9480f'),
    line('Broadway', 'run', [p(171.563, -43.472), p(171.561, -43.49), p(171.559, -43.507), p(171.558, -43.521)], 'intermediate', undefined, true),
    line('Huirapa', 'run', [p(171.555, -43.474), p(171.552, -43.491), p(171.55, -43.509), p(171.548, -43.522)], 'intermediate', undefined, true),
    line('Morning Glory', 'run', [p(171.543, -43.474), p(171.539, -43.492), p(171.537, -43.509)], 'beginner', undefined, true),
    line('Virgin Mile', 'run', [p(171.548, -43.471), p(171.544, -43.486), p(171.541, -43.502), p(171.538, -43.519)], 'intermediate', undefined, true),
    line('Lower Fascination', 'run', [p(171.541, -43.497), p(171.547, -43.509), p(171.553, -43.522)], 'beginner', undefined),
    line('Wayleggo', 'run', [p(171.536, -43.48), p(171.531, -43.497), p(171.527, -43.514)], 'advanced', undefined, true),
    line('International', 'run', [p(171.552, -43.475), p(171.55, -43.49), p(171.546, -43.506)], 'expert', undefined, true),
    line('Reservoir Dogs', 'run', [p(171.558, -43.485), p(171.565, -43.501), p(171.572, -43.518)], 'advanced', undefined),
    line("Wylie's Way", 'run', [p(171.566, -43.478), p(171.571, -43.493), p(171.576, -43.51)], 'beginner', undefined),
    line('Inside Leg', 'run', [p(171.53, -43.482), p(171.524, -43.498), p(171.521, -43.515)], 'expert', undefined),
    line('Back Paddock', 'run', [p(171.571, -43.481), p(171.578, -43.497), p(171.58, -43.514)], 'intermediate', undefined),
    line('Highway 72', 'run', [p(171.568, -43.506), p(171.558, -43.515), p(171.548, -43.523)], 'beginner', undefined),
    line('Hydro Slide', 'run', [p(171.564, -43.492), p(171.568, -43.506), p(171.572, -43.521)], 'intermediate', undefined),
    line('Platter Splatter', 'run', [p(171.569, -43.515), p(171.571, -43.524)], 'beginner', undefined),
    line('Free Dive', 'run', [p(171.534, -43.477), p(171.528, -43.489), p(171.522, -43.502)], 'extreme', undefined, true),
    line('Log Chute', 'run', [p(171.529, -43.478), p(171.523, -43.49), p(171.518, -43.505)], 'extreme', undefined),
    line("Wilson's Way", 'run', [p(171.539, -43.486), p(171.534, -43.501), p(171.532, -43.516)], 'advanced', undefined),
    line('Exhibition Bowl', 'run', [p(171.544, -43.486), p(171.546, -43.499), p(171.541, -43.511)], 'advanced', undefined, true),
    line('South Face', 'run', [p(171.541, -43.471), p(171.531, -43.486), p(171.523, -43.5)], 'extreme', undefined, true),
    line('Top Towers', 'run', [p(171.535, -43.477), p(171.537, -43.491), p(171.54, -43.505)], 'advanced', undefined),
    line('Muesli Bowl', 'run', [p(171.525, -43.486), p(171.521, -43.499), p(171.519, -43.512)], 'extreme', undefined, true),
    line('Hoods Hollow', 'run', [p(171.528, -43.49), p(171.533, -43.504), p(171.536, -43.518)], 'expert', undefined),
    line('Mid Towers', 'run', [p(171.538, -43.493), p(171.536, -43.508), p(171.534, -43.522)], 'advanced', undefined),
    line('Race Hill', 'run', [p(171.55, -43.494), p(171.556, -43.509), p(171.562, -43.522)], 'intermediate', undefined),
    line('Bluffs', 'run', [p(171.516, -43.49), p(171.515, -43.505), p(171.516, -43.52)], 'extreme', undefined, true),
    line('No Dive', 'run', [p(171.521, -43.483), p(171.517, -43.496), p(171.514, -43.509)], 'extreme', undefined),
    line("Monty's Ridge", 'run', [p(171.555, -43.48), p(171.548, -43.493), p(171.542, -43.508)], 'expert', undefined),
    line('Lower Triple', 'run', [p(171.533, -43.505), p(171.54, -43.517), p(171.545, -43.526)], 'intermediate', undefined),
    line('Chair Bowl', 'run', [p(171.544, -43.502), p(171.549, -43.515), p(171.553, -43.526)], 'intermediate', undefined),
    line('Rakaia Saddle Chutes', 'run', [p(171.577, -43.473), p(171.582, -43.488), p(171.584, -43.504)], 'extreme', undefined, true),
    line("Lex's Way", 'run', [p(171.575, -43.489), p(171.572, -43.504), p(171.569, -43.52)], 'advanced', undefined),
    line("Bob's Knob", 'run', [p(171.581, -43.492), p(171.578, -43.507), p(171.575, -43.522)], 'expert', undefined),
    line("Bondy's Drop", 'run', [p(171.584, -43.498), p(171.58, -43.511), p(171.577, -43.525)], 'expert', undefined),
  ],
}

const powderGrid = []
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) {
    const lon = bounds.west + (x + 0.5) * ((bounds.east - bounds.west) / 8)
    const lat = bounds.north - (y + 0.5) * ((bounds.north - bounds.south) / 8)
    const leeBoost = x < 4 && y < 5 ? 0.22 : 0
    const elevationBoost = y < 5 ? 0.15 : -0.05
    const sheltered = Math.sin(x * 1.7) * Math.cos(y * 1.1) * 0.1
    const score = Math.max(0.12, Math.min(0.92, 0.42 + leeBoost + elevationBoost + sheltered))
    powderGrid.push({
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      score: Number(score.toFixed(2)),
      recentScore: Number(score.toFixed(2)),
      forecastScore: Number(Math.max(0.1, Math.min(0.96, score + (x > 3 ? 0.12 : -0.04))).toFixed(2)),
      expectedSnowCm: Math.round(32 * score),
      reason: 'Sheltered upper terrain with probable wind loading.',
    })
  }
}

const latest = {
  generatedAt: new Date().toISOString(),
  location: 'Mt Hutt',
  summary: {
    recentSnowCm: 18,
    forecastSnowCm: 9,
    mainWindDirectionDeg: 235,
    avgWindKph: 38,
    temperatureMinC: -6,
    temperatureMaxC: -1,
    confidence: 'medium',
    headline: 'Recent southwest wind and cold snowfall favour sheltered lee pockets around upper bowls and gullies.',
    reasons: [
      'Recent snow is weighted higher on colder upper mountain terrain.',
      'Southwest winds boost likely loading on lee-facing pockets.',
      'Exposed ridges are penalised where wind scouring is more likely.',
    ],
  },
  observations: [],
  forecast: [],
  powderGrid,
}

writeFileSync(join(dataDir, 'terrain.json'), `${JSON.stringify(terrain)}\n`)
writeFileSync(join(dataDir, 'trails.geojson'), `${JSON.stringify(trails, null, 2)}\n`)
writeFileSync(join(dataDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`)

console.log(`Generated terrain, trails, and latest data in ${dataDir}`)
