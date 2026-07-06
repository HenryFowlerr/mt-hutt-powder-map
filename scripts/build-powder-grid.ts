import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = join(process.cwd(), 'public', 'data')
const latestPath = join(dataDir, 'latest.json')
const terrain = JSON.parse(readFileSync(join(dataDir, 'terrain.json'), 'utf8'))
const latest = JSON.parse(readFileSync(latestPath, 'utf8'))
const trails = JSON.parse(readFileSync(join(dataDir, 'trails.geojson'), 'utf8'))

const terrainSize = 16

function lonLatToXZ(lon: number, lat: number) {
  return {
    x: ((lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west) - 0.5) * terrainSize,
    z: ((terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south) - 0.5) * terrainSize,
  }
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  if (lengthSq === 0) return Math.hypot(px - ax, pz - az)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

const skiSegments: Array<[number, number, number, number]> = []
for (const feature of trails.features) {
  if (feature.properties?.kind !== 'run' || feature.geometry?.type !== 'LineString') continue
  const coords = feature.geometry.coordinates
  for (let i = 1; i < coords.length; i += 1) {
    const a = lonLatToXZ(coords[i - 1][0], coords[i - 1][1])
    const b = lonLatToXZ(coords[i][0], coords[i][1])
    skiSegments.push([a.x, a.z, b.x, b.z])
  }
}

function skiableProximity(lon: number, lat: number) {
  const point = lonLatToXZ(lon, lat)
  const nearest = skiSegments.reduce(
    (min, [ax, az, bx, bz]) => Math.min(min, distanceToSegment(point.x, point.z, ax, az, bx, bz)),
    Number.POSITIVE_INFINITY,
  )
  return { nearest, factor: clamp(1 - nearest / 1.25) }
}

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
for (let y = 0; y < 22; y += 1) {
  for (let x = 0; x < 22; x += 1) {
    const lon = terrain.bounds.west + (x + 0.5) * ((terrain.bounds.east - terrain.bounds.west) / 22)
    const lat = terrain.bounds.north - (y + 0.5) * ((terrain.bounds.north - terrain.bounds.south) / 22)
    const proximity = skiableProximity(lon, lat)
    if (proximity.factor <= 0.08) continue

    const elevation = sampleElevation(lon, lat)
    const elevationFactor = clamp((elevation - terrain.minElevation) / (terrain.maxElevation - terrain.minElevation))
    const syntheticAspect = Math.atan2(y - 4.5, x - 4.5)
    const leeAlignment = (1 - Math.cos(syntheticAspect - windRad)) / 2
    const windLoading = clamp(leeAlignment * (latest.summary.avgWindKph / 55))
    const concavity = clamp(0.5 + Math.sin(x * 1.8) * Math.cos(y * 1.35) * 0.4)
    const recentSnowNormalized = clamp(recentSnow / 28)
    const forecastSnowNormalized = clamp(forecastSnow / 24)
    const rawRecentScore = clamp(
      0.35 * recentSnowNormalized +
        0.25 * windLoading +
        0.15 * elevationFactor +
        0.1 * coldFactor +
        0.1 * concavity +
        0.05 * forecastSnowNormalized,
    )
    const rawForecastScore = clamp(
      0.25 * recentSnowNormalized +
        0.25 * windLoading +
        0.15 * elevationFactor +
        0.1 * coldFactor +
        0.1 * concavity +
        0.15 * forecastSnowNormalized,
    )

    const recentScore = clamp(rawRecentScore * (0.48 + proximity.factor * 0.58))
    const forecastScore = clamp(rawForecastScore * (0.48 + proximity.factor * 0.58))
    const expectedSnowCm = Math.round((recentSnow * 0.55 + forecastSnow * 0.45) * recentScore)

    if (expectedSnowCm < 2) continue

    powderGrid.push({
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      score: Number(recentScore.toFixed(2)),
      recentScore: Number(recentScore.toFixed(2)),
      forecastScore: Number(forecastScore.toFixed(2)),
      expectedSnowCm,
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
