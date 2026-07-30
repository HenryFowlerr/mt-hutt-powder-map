import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractContours, ringArea, simplifyRing } from '../src/lib/marchingSquares'
import {
  buildPowderField,
  buildPowderDisplayField,
  describeCell,
  powderDisplayScale,
  type PowderWeather,
} from '../src/lib/powderModel'
import { analyzeTerrain } from '../src/lib/terrainAnalysis'
import type { LatestData, PowderPolygon, TerrainData, TrailCollection } from '../src/types'

// Builds terrain-following powder polygons from the dense powder field and
// writes them into public/data/latest.json (powderPolygons). Replaces the
// old grid-of-points output entirely.

const dataDir = join(process.cwd(), 'public', 'data')
const latestPath = join(dataDir, 'latest.json')
const terrain = JSON.parse(readFileSync(join(dataDir, 'terrain.json'), 'utf8')) as TerrainData
const latest = JSON.parse(readFileSync(latestPath, 'utf8')) as LatestData & { powderGrid?: unknown }
const trails = JSON.parse(readFileSync(join(dataDir, 'trails.geojson'), 'utf8')) as TrailCollection

const weather: PowderWeather = {
  recentSnowCm: latest.summary.recentSnowCm,
  forecastSnowCm: latest.summary.forecastSnowCm,
  mainWindDirectionDeg: latest.summary.mainWindDirectionDeg,
  avgWindKph: latest.summary.avgWindKph,
  maxGustKph: latest.summary.maxGustKph,
  forecastWindDirectionDeg: latest.summary.forecastWindDirectionDeg,
  forecastAvgWindKph: latest.summary.forecastAvgWindKph,
  forecastMaxGustKph: latest.summary.forecastMaxGustKph,
  forecastTemperatureMaxC: latest.summary.forecastTemperatureMaxC,
  forecastTemperatureMinC: latest.summary.forecastTemperatureMinC,
  forecastFreezingLevelM: latest.summary.forecastFreezingLevelM,
  forecastRainMm: latest.summary.forecastRainMm,
  forecastHoursAboveZero: latest.summary.forecastHoursAboveZero,
  temperatureMaxC: latest.summary.temperatureMaxC,
  temperatureMinC: latest.summary.temperatureMinC,
  freezingLevelM: latest.summary.recentFreezingLevelM ?? latest.summary.freezingLevelM,
  recentRainMm: latest.summary.recentRainMm,
  hoursAboveZero: latest.summary.hoursAboveZero,
  hoursSinceSnow: latest.summary.hoursSinceSnow,
  meltFreezeCycles: latest.summary.meltFreezeCycles,
}

const analysis = analyzeTerrain(terrain, trails)
const field = buildPowderField(terrain, analysis, weather)

function gridToLonLat(x: number, y: number) {
  return [
    Number((terrain.bounds.west + (x / (terrain.width - 1)) * (terrain.bounds.east - terrain.bounds.west)).toFixed(6)),
    Number((terrain.bounds.north - (y / (terrain.height - 1)) * (terrain.bounds.north - terrain.bounds.south)).toFixed(6)),
  ]
}

function ringCentroidIndex(ring: Array<[number, number]>) {
  let cx = 0
  let cy = 0
  for (const [x, y] of ring) {
    cx += x
    cy += y
  }
  cx /= ring.length
  cy /= ring.length
  const col = Math.round(Math.max(0, Math.min(terrain.width - 1, cx)))
  const row = Math.round(Math.max(0, Math.min(terrain.height - 1, cy)))
  return row * terrain.width + col
}

function buildPolygons(mode: 'recent' | 'forecast'): PowderPolygon[] {
  const grid = mode === 'recent' ? field.recentCm : field.forecastCm
  const displayGrid = buildPowderDisplayField(field, analysis, mode)
  const scores = mode === 'recent' ? field.recentScore : field.forecastScore
  const scale = powderDisplayScale(field, mode)
  const polygons: PowderPolygon[] = []
  let counter = 0

  // These polygons are a compact cache for non-browser consumers. The live
  // app paints the dense field directly, so retaining the largest terrain
  // signals at up to three useful contour levels is both clearer and far
  // smaller than serialising every tiny collector.
  const thresholds = scale.contours.slice(-3)
  for (const threshold of thresholds) {
    const rings = extractContours(displayGrid, terrain.width, terrain.height, threshold)
      .map((ring) => ({ ring, area: ringArea(ring) }))
      .filter(({ area }) => area >= 10)
      .sort((a, b) => b.area - a.area)
      .slice(0, 12)

    for (const { ring } of rings) {
      const simplified = simplifyRing(ring, 0.6) as Array<[number, number]>
      if (simplified.length < 3) continue

      // Sample cm/score inside the region (at the ring centroid cell).
      const index = ringCentroidIndex(simplified)
      const { reason, dominantFactor } = describeCell(index, terrain, analysis, weather, mode)
      counter += 1

      polygons.push({
        id: `${mode}-${String(counter).padStart(3, '0')}`,
        mode,
        thresholdCm: threshold,
        expectedSnowCm: Math.round(Math.max(grid[index], threshold)),
        score: Number(scores[index].toFixed(2)),
        reason,
        dominantFactor,
        coordinates: [simplified.map(([x, y]) => gridToLonLat(x, y))],
      })
    }
  }
  return polygons
}

// A polygon-build failure must not break the scheduled data update: the app
// computes its own overlay from the summary, so stale polygons are the
// lesser evil versus a failed workflow.
try {
  const powderPolygons = [...buildPolygons('recent'), ...buildPolygons('forecast')]

  // powderGrid (old schema) is intentionally dropped.
  delete latest.powderGrid
  const next = { ...latest, powderPolygons }

  writeFileSync(latestPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(
    `Built ${powderPolygons.length} powder polygons (${powderPolygons.filter((p) => p.mode === 'recent').length} recent, ${powderPolygons.filter((p) => p.mode === 'forecast').length} forecast)`,
  )
} catch (error) {
  console.warn(
    `Powder polygon build failed, keeping previous polygons: ${error instanceof Error ? error.message : String(error)}`,
  )
}
