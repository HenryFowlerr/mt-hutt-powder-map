import { METERS_PER_DEGREE_LAT, metersPerDegreeLon, terrainCenter } from './geo'
import type { TerrainData, TrailCollection } from '../types'

// Pure terrain analysis shared by the browser renderer and the data
// pipeline scripts. All grids are row-major, north row first, matching
// TerrainData.heights.

export type TerrainAnalysis = {
  width: number
  height: number
  cellSizeX: number // metres per DEM cell, east-west
  cellSizeY: number // metres per DEM cell, north-south
  slopeDeg: Float32Array
  aspectDeg: Float32Array // downslope direction, 0 = N, 90 = E
  curvature: Float32Array // positive = concave (gully/bowl), negative = convex (ridge)
  hillshade: Float32Array // 0..1
  ridgeExposure: Float32Array // 0..1 convex exposed terrain
  gullyFactor: Float32Array // 0..1 concave sheltered terrain
  skiMask: Float32Array // 0..1, 1 = core skiable area
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function angularDifference(a: number, b: number) {
  const diff = Math.abs(((a - b) % 360 + 360) % 360)
  return diff > 180 ? 360 - diff : diff
}

function heightAt(terrain: TerrainData, col: number, row: number) {
  const c = Math.max(0, Math.min(terrain.width - 1, col))
  const r = Math.max(0, Math.min(terrain.height - 1, row))
  return terrain.heights[r * terrain.width + c]
}

export function boxBlur(field: Float32Array, width: number, height: number, radius: number) {
  const out = new Float32Array(field.length)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let total = 0
      let count = 0
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          const r = row + dr
          const c = col + dc
          if (r < 0 || r >= height || c < 0 || c >= width) continue
          total += field[r * width + c]
          count += 1
        }
      }
      out[row * width + col] = total / count
    }
  }
  return out
}

// Distance in world cells from a point to a polyline segment list, used for
// the skiable mask. Coordinates in metres relative to terrain centre.
type Segment = [number, number, number, number]

function distanceToSegmentSq(px: number, py: number, [ax, ay, bx, by]: Segment) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  const ex = px - (ax + t * dx)
  const ey = py - (ay + t * dy)
  return ex * ex + ey * ey
}

function pointInPolygon(px: number, py: number, polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function lonLatToMeters(lon: number, lat: number, centerLon: number, centerLat: number) {
  return {
    x: (lon - centerLon) * metersPerDegreeLon(centerLat),
    y: (lat - centerLat) * METERS_PER_DEGREE_LAT,
  }
}

export function buildSkiMask(terrain: TerrainData, trails: TrailCollection): Float32Array {
  // Distance-to-segment over every cell is O(cells * segments); on high-res
  // DEMs compute the mask on a coarse grid and bilinearly upsample — the
  // mask is smooth by construction so nothing visible is lost.
  const maxDimension = Math.max(terrain.width, terrain.height)
  if (maxDimension > 160) {
    const scale = Math.ceil(maxDimension / 140)
    const coarseWidth = Math.ceil(terrain.width / scale)
    const coarseHeight = Math.ceil(terrain.height / scale)
    const coarseTerrain: TerrainData = {
      ...terrain,
      width: coarseWidth,
      height: coarseHeight,
      heights: new Array(coarseWidth * coarseHeight).fill(0),
    }
    const coarse = buildSkiMaskFull(coarseTerrain, trails)
    const mask = new Float32Array(terrain.width * terrain.height)
    for (let row = 0; row < terrain.height; row += 1) {
      const cy = (row / (terrain.height - 1)) * (coarseHeight - 1)
      for (let col = 0; col < terrain.width; col += 1) {
        const cx = (col / (terrain.width - 1)) * (coarseWidth - 1)
        mask[row * terrain.width + col] = sampleGrid(coarse, coarseWidth, coarseHeight, cx, cy)
      }
    }
    return mask
  }
  return buildSkiMaskFull(terrain, trails)
}

function buildSkiMaskFull(terrain: TerrainData, trails: TrailCollection): Float32Array {
  const center = terrainCenter(terrain)
  const segments: Segment[] = []
  let boundaryPolygon: Array<[number, number]> | null = null

  for (const feature of trails.features) {
    if (feature.geometry.type !== 'LineString') continue
    const coords = feature.geometry.coordinates as number[][]
    if (feature.properties.kind === 'boundary') {
      boundaryPolygon = coords.map(([lon, lat]) => {
        const m = lonLatToMeters(lon, lat, center.lon, center.lat)
        return [m.x, m.y] as [number, number]
      })
      continue
    }
    if (feature.properties.kind !== 'run' && feature.properties.kind !== 'lift') continue
    for (let i = 1; i < coords.length; i += 1) {
      const a = lonLatToMeters(coords[i - 1][0], coords[i - 1][1], center.lon, center.lat)
      const b = lonLatToMeters(coords[i][0], coords[i][1], center.lon, center.lat)
      segments.push([a.x, a.y, b.x, b.y])
    }
  }

  const mask = new Float32Array(terrain.width * terrain.height)
  const falloffMeters = 450 // full score within this distance of a run/lift
  const fadeMeters = 500 // fade to zero over this additional distance

  for (let row = 0; row < terrain.height; row += 1) {
    const lat = terrain.bounds.north - (row / (terrain.height - 1)) * (terrain.bounds.north - terrain.bounds.south)
    for (let col = 0; col < terrain.width; col += 1) {
      const lon = terrain.bounds.west + (col / (terrain.width - 1)) * (terrain.bounds.east - terrain.bounds.west)
      const m = lonLatToMeters(lon, lat, center.lon, center.lat)

      let nearestSq = Number.POSITIVE_INFINITY
      for (const segment of segments) {
        const d = distanceToSegmentSq(m.x, m.y, segment)
        if (d < nearestSq) nearestSq = d
      }
      const nearest = Math.sqrt(nearestSq)
      let value = 1 - smoothstep(falloffMeters, falloffMeters + fadeMeters, nearest)

      if (boundaryPolygon) {
        const inBoundary = pointInPolygon(m.x, m.y, boundaryPolygon)
        // Terrain inside the ski area boundary keeps most of its score even
        // away from runs; outside the boundary it decays fast.
        value = inBoundary ? Math.max(value, 0.75) : value * 0.35
      }
      mask[row * terrain.width + col] = value
    }
  }

  return boxBlur(mask, terrain.width, terrain.height, 1)
}

export function analyzeTerrain(terrain: TerrainData, trails?: TrailCollection): TerrainAnalysis {
  const { width, height } = terrain
  const center = terrainCenter(terrain)
  const cellSizeX = ((terrain.bounds.east - terrain.bounds.west) / (width - 1)) * metersPerDegreeLon(center.lat)
  const cellSizeY = ((terrain.bounds.north - terrain.bounds.south) / (height - 1)) * METERS_PER_DEGREE_LAT

  const slopeDeg = new Float32Array(width * height)
  const aspectDeg = new Float32Array(width * height)
  const curvature = new Float32Array(width * height)
  const hillshade = new Float32Array(width * height)

  // Synthetic sun from the north-west, matching the official map's shading.
  const sunAzimuthRad = (315 * Math.PI) / 180
  const sunAltitudeRad = (42 * Math.PI) / 180

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col

      // Horn's method gradients. dzdx east+, dzdy north+.
      const zNW = heightAt(terrain, col - 1, row - 1)
      const zN = heightAt(terrain, col, row - 1)
      const zNE = heightAt(terrain, col + 1, row - 1)
      const zW = heightAt(terrain, col - 1, row)
      const z = heightAt(terrain, col, row)
      const zE = heightAt(terrain, col + 1, row)
      const zSW = heightAt(terrain, col - 1, row + 1)
      const zS = heightAt(terrain, col, row + 1)
      const zSE = heightAt(terrain, col + 1, row + 1)

      const dzdx = (zNE + 2 * zE + zSE - (zNW + 2 * zW + zSW)) / (8 * cellSizeX)
      const dzdy = (zNW + 2 * zN + zNE - (zSW + 2 * zS + zSE)) / (8 * cellSizeY)

      const slopeRad = Math.atan(Math.hypot(dzdx, dzdy))
      slopeDeg[index] = (slopeRad * 180) / Math.PI

      // Downslope direction: 0 = north, 90 = east.
      const aspect = (Math.atan2(-dzdx, dzdy) * 180) / Math.PI
      aspectDeg[index] = ((180 - aspect) % 360 + 360) % 360

      // Laplacian curvature in metres of height per metre^2, scaled.
      const lap = (zE + zW - 2 * z) / (cellSizeX * cellSizeX) + (zN + zS - 2 * z) / (cellSizeY * cellSizeY)
      curvature[index] = lap * 1000 // positive = concave up (gully), negative = convex (ridge)

      // Hillshade (Lambertian).
      const nx = -dzdx
      const ny = -dzdy
      const nz = 1
      const nLength = Math.hypot(nx, ny, nz)
      const sunX = Math.sin(sunAzimuthRad) * Math.cos(sunAltitudeRad)
      const sunY = Math.cos(sunAzimuthRad) * Math.cos(sunAltitudeRad)
      const sunZ = Math.sin(sunAltitudeRad)
      hillshade[index] = Math.max(0, (nx * sunX + ny * sunY + nz * sunZ) / nLength)
    }
  }

  const smoothedCurvature = boxBlur(curvature, width, height, 1)
  const ridgeExposure = new Float32Array(width * height)
  const gullyFactor = new Float32Array(width * height)
  for (let index = 0; index < smoothedCurvature.length; index += 1) {
    // smoothedCurvature: positive = concave, negative = convex.
    ridgeExposure[index] = smoothstep(0.4, 3.2, -smoothedCurvature[index])
    gullyFactor[index] = smoothstep(0.4, 3.2, smoothedCurvature[index])
  }

  const skiMask = trails ? buildSkiMask(terrain, trails) : new Float32Array(width * height).fill(1)

  return {
    width,
    height,
    cellSizeX,
    cellSizeY,
    slopeDeg,
    aspectDeg,
    curvature: smoothedCurvature,
    hillshade,
    ridgeExposure,
    gullyFactor,
    skiMask,
  }
}

// Winstral-style wind shelter parameter (Sx): for each cell, the maximum
// upwind horizon angle to terrain within `distanceM`. Positive = the cell
// sits behind higher upwind terrain (sheltered lee — snow deposits there),
// negative = the cell overlooks open upwind ground (exposed — snow strips).
// This puts deposition *behind ridge crests* where it belongs, which pure
// aspect matching cannot do.
export function computeWindShelter(
  terrain: TerrainData,
  windFromDeg: number,
  distanceM = 300,
): Float32Array {
  const { width, height } = terrain
  const center = terrainCenter(terrain)
  const cellX = ((terrain.bounds.east - terrain.bounds.west) / (width - 1)) * metersPerDegreeLon(center.lat)
  const cellY = ((terrain.bounds.north - terrain.bounds.south) / (height - 1)) * METERS_PER_DEGREE_LAT

  // Unit step (in grid cells) pointing INTO the wind. Bearing 0 = north =
  // -row; east = +col.
  const bearing = (windFromDeg * Math.PI) / 180
  const stepMeters = Math.min(cellX, cellY)
  const stepCol = (Math.sin(bearing) * stepMeters) / cellX
  const stepRow = (-Math.cos(bearing) * stepMeters) / cellY
  const steps = Math.max(4, Math.round(distanceM / stepMeters))

  const shelter = new Float32Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const base = terrain.heights[row * width + col]
      let maxAngle = -Infinity
      for (let step = 1; step <= steps; step += 1) {
        const sampleCol = Math.round(col + stepCol * step)
        const sampleRow = Math.round(row + stepRow * step)
        if (sampleCol < 0 || sampleCol >= width || sampleRow < 0 || sampleRow >= height) break
        const rise = terrain.heights[sampleRow * width + sampleCol] - base
        const run = stepMeters * step
        const angle = Math.atan2(rise, run)
        if (angle > maxAngle) maxAngle = angle
      }
      shelter[row * width + col] = maxAngle === -Infinity ? 0 : (maxAngle * 180) / Math.PI
    }
  }
  return boxBlur(shelter, width, height, 1)
}

// Bilinear sample of any analysis grid at fractional grid coordinates.
export function sampleGrid(grid: Float32Array, width: number, height: number, x: number, y: number) {
  const cx = Math.max(0, Math.min(width - 1, x))
  const cy = Math.max(0, Math.min(height - 1, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const sx = cx - x0
  const sy = cy - y0
  const top = grid[y0 * width + x0] * (1 - sx) + grid[y0 * width + x1] * sx
  const bottom = grid[y1 * width + x0] * (1 - sx) + grid[y1 * width + x1] * sx
  return top * (1 - sy) + bottom * sy
}

export function lonLatToGrid(lon: number, lat: number, terrain: TerrainData) {
  return {
    x: ((lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)) * (terrain.width - 1),
    y: ((terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)) * (terrain.height - 1),
  }
}
