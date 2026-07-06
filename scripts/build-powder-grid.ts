import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = join(process.cwd(), 'public', 'data')
const latestPath = join(dataDir, 'latest.json')
const terrain = JSON.parse(readFileSync(join(dataDir, 'terrain.json'), 'utf8'))
const latest = JSON.parse(readFileSync(latestPath, 'utf8'))

function sampleElevation(lon: number, lat: number) {
  const xRatio = (lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)
  const yRatio = (terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)
  const x = Math.max(0, Math.min(terrain.width - 1, xRatio * (terrain.width - 1)))
  const y = Math.max(0, Math.min(terrain.height - 1, yRatio * (terrain.height - 1)))
  return terrain.heights[Math.round(y) * terrain.width + Math.round(x)]
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

const windDeg = latest.summary.mainWindDirectionDeg
const windRad = (windDeg * Math.PI) / 180
const recentSnow = latest.summary.recentSnowCm
const forecastSnow = latest.summary.forecastSnowCm
const coldFactor = latest.summary.temperatureMaxC <= 1 ? 1 : latest.summary.temperatureMaxC <= 3 ? 0.55 : 0.18

const powderGrid = []
for (let y = 0; y < 10; y += 1) {
  for (let x = 0; x < 10; x += 1) {
    const lon = terrain.bounds.west + (x + 0.5) * ((terrain.bounds.east - terrain.bounds.west) / 10)
    const lat = terrain.bounds.north - (y + 0.5) * ((terrain.bounds.north - terrain.bounds.south) / 10)
    const elevation = sampleElevation(lon, lat)
    const elevationFactor = clamp((elevation - terrain.minElevation) / (terrain.maxElevation - terrain.minElevation))
    const syntheticAspect = Math.atan2(y - 4.5, x - 4.5)
    const leeAlignment = (1 - Math.cos(syntheticAspect - windRad)) / 2
    const windLoading = clamp(leeAlignment * (latest.summary.avgWindKph / 55))
    const concavity = clamp(0.5 + Math.sin(x * 1.8) * Math.cos(y * 1.35) * 0.4)
    const recentSnowNormalized = clamp(recentSnow / 28)
    const forecastSnowNormalized = clamp(forecastSnow / 24)
    const recentScore = clamp(
      0.35 * recentSnowNormalized +
        0.25 * windLoading +
        0.15 * elevationFactor +
        0.1 * coldFactor +
        0.1 * concavity +
        0.05 * forecastSnowNormalized,
    )
    const forecastScore = clamp(
      0.25 * recentSnowNormalized +
        0.25 * windLoading +
        0.15 * elevationFactor +
        0.1 * coldFactor +
        0.1 * concavity +
        0.15 * forecastSnowNormalized,
    )

    powderGrid.push({
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      score: Number(recentScore.toFixed(2)),
      recentScore: Number(recentScore.toFixed(2)),
      forecastScore: Number(forecastScore.toFixed(2)),
      reason:
        recentScore > 0.65
          ? 'High score from upper elevation, cold snow, and lee loading.'
          : recentScore > 0.42
            ? 'Moderate score from elevation and sheltered terrain.'
            : 'Lower score from exposure, warmth, or limited recent snow.',
    })
  }
}

writeFileSync(latestPath, `${JSON.stringify({ ...latest, powderGrid }, null, 2)}\n`)
console.log(`Built ${powderGrid.length} powder grid points`)
