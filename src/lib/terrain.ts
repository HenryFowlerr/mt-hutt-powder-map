import * as THREE from 'three'
import { lonLatToXZ, WORLD_UNITS_PER_METER } from './geo'
import { clamp01, sampleGrid, smoothstep, type TerrainAnalysis } from './terrainAnalysis'
import type { TerrainData } from '../types'

export const RENDER_GRID_WIDTH = 300
export const RENDER_GRID_HEIGHT = 340
export const TEXTURE_WIDTH = 1200
export const TEXTURE_HEIGHT = 1360

// Deterministic value-noise fbm for micro-relief and texture detail.
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const h = (ix: number, iy: number) => {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const sx = xf * xf * (3 - 2 * xf)
  const sy = yf * yf * (3 - 2 * yf)
  const top = h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx
  const bottom = h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx
  return top * (1 - sy) + bottom * sy
}

export function fbm(x: number, y: number, octaves = 4) {
  let total = 0
  let amplitude = 0.5
  let frequency = 1
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency) * amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return total // ~0..1
}

// Small deterministic relief (bumps, dips, wind features) layered on top of
// the DEM so close zooms read as real snow surface rather than a smooth
// interpolated sheet. Amplitude is a few metres — visual crunch, not fake
// terrain.
export function microRelief(lon: number, lat: number) {
  const nx = lon * 5200
  const ny = lat * 5200
  return (fbm(nx, ny, 4) - 0.5) * 7
}

export function elevationToY(elevation: number, terrain: TerrainData, exaggeration: number) {
  return (elevation - terrain.minElevation) * WORLD_UNITS_PER_METER * exaggeration
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

function heightAt(terrain: TerrainData, col: number, row: number) {
  const c = Math.max(0, Math.min(terrain.width - 1, col))
  const r = Math.max(0, Math.min(terrain.height - 1, row))
  return terrain.heights[r * terrain.width + c]
}

// Bicubic (Catmull-Rom) elevation sampling so the render mesh is smooth
// even where it is denser than the source DEM.
export function sampleElevation(lon: number, lat: number, terrain: TerrainData) {
  const x = ((lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)) * (terrain.width - 1)
  const y = ((terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)) * (terrain.height - 1)
  const cx = Math.max(0, Math.min(terrain.width - 1, x))
  const cy = Math.max(0, Math.min(terrain.height - 1, y))
  const x1 = Math.floor(cx)
  const y1 = Math.floor(cy)
  const sx = cx - x1
  const sy = cy - y1

  const rows: number[] = []
  for (let dr = -1; dr <= 2; dr += 1) {
    rows.push(
      catmullRom(
        heightAt(terrain, x1 - 1, y1 + dr),
        heightAt(terrain, x1, y1 + dr),
        heightAt(terrain, x1 + 1, y1 + dr),
        heightAt(terrain, x1 + 2, y1 + dr),
        sx,
      ),
    )
  }
  return catmullRom(rows[0], rows[1], rows[2], rows[3], sy)
}

// Elevation of the *rendered* surface: piecewise-linear interpolation over
// the render grid using the same triangulation as createTerrainGeometry.
// Overlay lines sampled with this hug the visible mesh exactly, so they
// never chord underneath it on steep or convex terrain.
export function renderSurfaceElevation(lon: number, lat: number, terrain: TerrainData) {
  const gx =
    ((lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)) * (RENDER_GRID_WIDTH - 1)
  const gy =
    ((terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)) * (RENDER_GRID_HEIGHT - 1)
  const cx = Math.max(0, Math.min(RENDER_GRID_WIDTH - 1.001, gx))
  const cy = Math.max(0, Math.min(RENDER_GRID_HEIGHT - 1.001, gy))
  const col = Math.floor(cx)
  const row = Math.floor(cy)
  const u = cx - col
  const v = cy - row

  const vertexElevation = (c: number, r: number) => {
    const vertexLon = terrain.bounds.west + (c / (RENDER_GRID_WIDTH - 1)) * (terrain.bounds.east - terrain.bounds.west)
    const vertexLat = terrain.bounds.north - (r / (RENDER_GRID_HEIGHT - 1)) * (terrain.bounds.north - terrain.bounds.south)
    return sampleElevation(vertexLon, vertexLat, terrain) + microRelief(vertexLon, vertexLat)
  }

  const a = vertexElevation(col, row)
  const b = vertexElevation(col + 1, row)
  const c = vertexElevation(col, row + 1)
  const d = vertexElevation(col + 1, row + 1)

  // Cells split along the b-c diagonal (triangles a,c,b and b,c,d).
  if (u + v <= 1) return a + u * (b - a) + v * (c - a)
  return d + (1 - u) * (c - d) + (1 - v) * (b - d)
}

export function terrainPoint(lon: number, lat: number, terrain: TerrainData, exaggeration: number) {
  const { x, z } = lonLatToXZ(lon, lat, terrain)
  const y = elevationToY(renderSurfaceElevation(lon, lat, terrain), terrain, exaggeration)
  return new THREE.Vector3(x, y, z)
}

// Centre of the ski area proper (mean of lift midpoints) — used as the
// camera target and the zoom reference for label visibility.
export function skiAreaCenter(
  terrain: TerrainData,
  trails: { features: Array<{ properties: { kind: string }; geometry: { type: string; coordinates: unknown } }> },
  exaggeration: number,
) {
  const midpoints: Array<[number, number]> = []
  for (const feature of trails.features) {
    if (feature.properties.kind !== 'lift' || feature.geometry.type !== 'LineString') continue
    const coords = feature.geometry.coordinates as number[][]
    const [lon, lat] = coords[Math.floor(coords.length / 2)]
    midpoints.push([lon, lat])
  }
  if (midpoints.length === 0) return new THREE.Vector3(0, 1.5, 0)
  const lon = midpoints.reduce((total, point) => total + point[0], 0) / midpoints.length
  const lat = midpoints.reduce((total, point) => total + point[1], 0) / midpoints.length
  return terrainPoint(lon, lat, terrain, exaggeration)
}

export function createTerrainGeometry(terrain: TerrainData, exaggeration: number) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(RENDER_GRID_WIDTH * RENDER_GRID_HEIGHT * 3)
  const uvs = new Float32Array(RENDER_GRID_WIDTH * RENDER_GRID_HEIGHT * 2)
  const indices: number[] = []

  let vertex = 0
  for (let row = 0; row < RENDER_GRID_HEIGHT; row += 1) {
    const zRatio = row / (RENDER_GRID_HEIGHT - 1)
    const lat = terrain.bounds.north - zRatio * (terrain.bounds.north - terrain.bounds.south)
    for (let col = 0; col < RENDER_GRID_WIDTH; col += 1) {
      const xRatio = col / (RENDER_GRID_WIDTH - 1)
      const lon = terrain.bounds.west + xRatio * (terrain.bounds.east - terrain.bounds.west)
      const { x, z } = lonLatToXZ(lon, lat, terrain)
      const y = elevationToY(sampleElevation(lon, lat, terrain) + microRelief(lon, lat), terrain, exaggeration)
      positions[vertex * 3] = x
      positions[vertex * 3 + 1] = y
      positions[vertex * 3 + 2] = z
      uvs[vertex * 2] = xRatio
      uvs[vertex * 2 + 1] = 1 - zRatio
      vertex += 1
    }
  }

  for (let row = 0; row < RENDER_GRID_HEIGHT - 1; row += 1) {
    for (let col = 0; col < RENDER_GRID_WIDTH - 1; col += 1) {
      const a = row * RENDER_GRID_WIDTH + col
      const b = a + 1
      const c = a + RENDER_GRID_WIDTH
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const SNOW_LIT: [number, number, number] = [248, 251, 255] // #f8fbff
const SNOW_SHADED: [number, number, number] = [207, 232, 245] // #cfe8f5
const DEEP_SHADOW: [number, number, number] = [143, 184, 206] // #8fb8ce
const ROCK_LIGHT: [number, number, number] = [111, 122, 128] // #6f7a80
const ROCK_DARK: [number, number, number] = [32, 36, 40] // #202428
const BACKSIDE_HAZE: [number, number, number] = [188, 205, 220] // muted far terrain
const VALLEY_TINT: [number, number, number] = [210, 212, 205] // low valley floor, kept grey so powder green stands out

// Bakes the whole map look — hillshade, snow palette, rock bands, ski-area
// emphasis — into one texture draped over the terrain mesh. Lighting is
// baked so the material can be unlit and read like a printed trail map.
export function createTerrainTexture(terrain: TerrainData, analysis: TerrainAnalysis) {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create terrain texture context')
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT)

  const { width, height } = analysis

  for (let py = 0; py < TEXTURE_HEIGHT; py += 1) {
    const gy = (py / (TEXTURE_HEIGHT - 1)) * (height - 1)
    for (let px = 0; px < TEXTURE_WIDTH; px += 1) {
      const gx = (px / (TEXTURE_WIDTH - 1)) * (width - 1)

      const shade = sampleGrid(analysis.hillshade, width, height, gx, gy)
      const slope = sampleGrid(analysis.slopeDeg, width, height, gx, gy)
      const gully = sampleGrid(analysis.gullyFactor, width, height, gx, gy)
      const skiable = sampleGrid(analysis.skiMask, width, height, gx, gy)
      const lon = terrain.bounds.west + (px / (TEXTURE_WIDTH - 1)) * (terrain.bounds.east - terrain.bounds.west)
      const lat = terrain.bounds.north - (py / (TEXTURE_HEIGHT - 1)) * (terrain.bounds.north - terrain.bounds.south)
      const elevation = sampleElevation(lon, lat, terrain)

      // Micro-relief shading: fbm noise (matched to the mesh displacement
      // scale) bumps the hillshade so zoomed-in snow reads as wind-worked
      // surface with dips, humps and drift texture instead of flat white.
      const microNoise = fbm(lon * 5200, lat * 5200, 4) - 0.5
      const fineNoise = fbm(lon * 16000 + 7.3, lat * 16000 + 3.1, 3) - 0.5
      const slopeBoost = 0.35 + smoothstep(8, 30, slope) * 0.65
      const shadeDetailed = clamp01(shade + microNoise * 0.26 * slopeBoost + fineNoise * 0.1)

      // Snow palette from hillshade: lit snow -> shaded snow -> deep gully shadow.
      const shadow = 1 - smoothstep(0.35, 0.95, shadeDetailed)
      let color = mixColor(SNOW_LIT, SNOW_SHADED, clamp01(shadow * 1.35))
      const deepShadow = clamp01((1 - smoothstep(0.1, 0.48, shadeDetailed)) * 0.95 + gully * 0.3 * shadow)
      color = mixColor(color, DEEP_SHADOW, deepShadow)

      // Broken rock bands on steep terrain: directional strokes (stretched
      // noise down the fall line) plus speckle, and scattered outcrops on
      // moderately steep rolls so ribs and bluffs show at zoom.
      const rockAmount = smoothstep(34, 47, slope)
      const outcrop = smoothstep(0.8, 0.97, fbm(lon * 9000 + 41.7, lat * 9000 + 13.9, 3)) * smoothstep(30, 40, slope)
      const rockMask = clamp01(rockAmount + outcrop * 0.7)
      if (rockMask > 0.02) {
        const stroke = fbm(lon * 26000, lat * 9500, 3) // elongated across the slope
        const speckle = hash2(px * 0.9, py * 0.9)
        if (speckle < rockMask * 0.5 || stroke > 0.7 - rockMask * 0.15) {
          const rockNoise = hash2(px * 0.23 + 31.7, py * 0.23 + 17.3)
          const rock = mixColor(ROCK_LIGHT, ROCK_DARK, clamp01(rockNoise * 0.9 + rockMask * 0.35))
          color = mixColor(color, rock, clamp01(rockMask * 1.2))
        }
      }

      // Subtle 50 m contour lines inside the ski area for a map feel.
      const contourPhase = Math.abs(((elevation % 50) + 50) % 50)
      const contourStrength = (1 - smoothstep(0.6, 1.6, Math.min(contourPhase, 50 - contourPhase))) * 0.07 * skiable
      color = mixColor(color, DEEP_SHADOW, contourStrength)

      // Valley floor below the snowline gets a faint tussock tint.
      const valley = 1 - smoothstep(950, 1250, elevation)
      color = mixColor(color, VALLEY_TINT, valley * 0.55)

      // Mute everything outside the skiable area toward pale haze so the
      // ski area is visually emphasised like the official map.
      const emphasis = clamp01(0.3 + skiable * 0.7)
      color = mixColor(BACKSIDE_HAZE, color, 0.45 + emphasis * 0.55)

      const offset = (py * TEXTURE_WIDTH + px) * 4
      image.data[offset] = color[0]
      image.data[offset + 1] = color[1]
      image.data[offset + 2] = color[2]
      image.data[offset + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
