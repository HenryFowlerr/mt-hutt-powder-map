import type { TerrainData } from '../types'

export const TERRAIN_SIZE = 16

export function lonLatToXZ(lon: number, lat: number, terrain: TerrainData) {
  const xRatio = (lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)
  const zRatio = (terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)
  return {
    x: (xRatio - 0.5) * TERRAIN_SIZE,
    z: (zRatio - 0.5) * TERRAIN_SIZE,
  }
}

export function xzToLonLat(x: number, z: number, terrain: TerrainData) {
  const xRatio = x / TERRAIN_SIZE + 0.5
  const zRatio = z / TERRAIN_SIZE + 0.5
  return {
    lon: terrain.bounds.west + xRatio * (terrain.bounds.east - terrain.bounds.west),
    lat: terrain.bounds.north - zRatio * (terrain.bounds.north - terrain.bounds.south),
  }
}
