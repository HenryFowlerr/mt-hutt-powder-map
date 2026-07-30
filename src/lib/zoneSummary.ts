import {
  METERS_PER_DEGREE_LAT,
  metersPerDegreeLon,
  polylineMidpoint,
} from './geo'
import { describeCell, type PowderField, type PowderMode, type PowderWeather } from './powderModel'
import { lonLatToGrid, type TerrainAnalysis } from './terrainAnalysis'
import type { TerrainData, TrailCollection } from '../types'

// Per-zone powder stats for lap planning: each named zone is anchored to a
// real OSM run so it georeferences automatically, and stats are computed
// over the model field within the zone radius.

export type ZoneSummary = {
  name: string
  maxCm: number
  meanCm: number
  score: number
  reason: string
  anchorLon: number
  anchorLat: number
}

// [display name, anchor run (post-override names), radius in metres]
export const ZONE_CONFIG: ReadonlyArray<readonly [string, string, number]> = [
  ['South Face', 'Saddle Face', 600],
  ['Top Towers', "Jan's Face", 450],
  ['Mid Towers', 'Mid Towers 2', 450],
  ['Muesli Bowl', 'Muesli Bowl', 500],
  ['Summit / Fascination', 'Fascination', 450],
  ['Virgin Mile side', 'Virgin Mile', 500],
  ['Broadway / Exhibition', 'Broadway', 500],
  ['Lower Triple', 'Log Chute', 500],
]

function anchorFor(
  trails: TrailCollection,
  runName: string,
  referenceLat: number,
): [number, number] | null {
  const feature = trails.features.find(
    (candidate) => candidate.properties.name === runName && candidate.geometry.type === 'LineString',
  )
  if (!feature) return null
  const coords = feature.geometry.coordinates as number[][]
  return polylineMidpoint(coords, referenceLat)
}

function roundDepth(value: number) {
  return value > 0 && value < 1 ? Number(value.toFixed(1)) : Math.round(value)
}

export function buildZoneSummaries(
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  field: PowderField,
  weather: PowderWeather,
  trails: TrailCollection,
  mode: PowderMode,
): ZoneSummary[] {
  const cmGrid = mode === 'recent' ? field.recentCm : field.forecastCm
  const scoreGrid = mode === 'recent' ? field.recentScore : field.forecastScore
  const centerLat = (terrain.bounds.south + terrain.bounds.north) / 2
  const cellX = ((terrain.bounds.east - terrain.bounds.west) / (terrain.width - 1)) * metersPerDegreeLon(centerLat)
  const cellY = ((terrain.bounds.north - terrain.bounds.south) / (terrain.height - 1)) * METERS_PER_DEGREE_LAT

  const summaries: ZoneSummary[] = []

  for (const [name, runName, radiusM] of ZONE_CONFIG) {
    const anchor = anchorFor(trails, runName, centerLat)
    if (!anchor) continue
    const grid = lonLatToGrid(anchor[0], anchor[1], terrain)
    const spanCols = Math.ceil(radiusM / cellX)
    const spanRows = Math.ceil(radiusM / cellY)

    let maxCm = 0
    let maxIndex = -1
    let total = 0
    let count = 0

    for (let dr = -spanRows; dr <= spanRows; dr += 1) {
      const row = Math.round(grid.y) + dr
      if (row < 0 || row >= terrain.height) continue
      for (let dc = -spanCols; dc <= spanCols; dc += 1) {
        const col = Math.round(grid.x) + dc
        if (col < 0 || col >= terrain.width) continue
        const distanceM = Math.hypot(dc * cellX, dr * cellY)
        if (distanceM > radiusM) continue
        const index = row * terrain.width + col
        if (analysis.skiMask[index] < 0.4) continue
        const cm = cmGrid[index]
        total += cm
        count += 1
        if (cm > maxCm) {
          maxCm = cm
          maxIndex = index
        }
      }
    }

    if (count === 0) continue
    const { reason } = maxIndex >= 0
      ? describeCell(maxIndex, terrain, analysis, weather, mode)
      : { reason: 'Limited signal in this zone.' }

    summaries.push({
      name,
      maxCm: roundDepth(maxCm),
      meanCm: roundDepth(total / count),
      score: maxIndex >= 0 ? Number(scoreGrid[maxIndex].toFixed(2)) : 0,
      reason,
      anchorLon: anchor[0],
      anchorLat: anchor[1],
    })
  }

  return summaries.sort((a, b) => b.maxCm - a.maxCm)
}
