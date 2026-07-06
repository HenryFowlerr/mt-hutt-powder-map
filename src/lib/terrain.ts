import * as THREE from 'three'
import { lonLatToXZ, TERRAIN_SIZE } from './geo'
import type { TerrainData } from '../types'

export function elevationToY(elevation: number, terrain: TerrainData, exaggeration: number) {
  const range = terrain.maxElevation - terrain.minElevation
  return ((elevation - terrain.minElevation) / range - 0.5) * 3.2 * exaggeration
}

export function sampleElevation(lon: number, lat: number, terrain: TerrainData) {
  const xRatio = (lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west)
  const yRatio = (terrain.bounds.north - lat) / (terrain.bounds.north - terrain.bounds.south)
  const x = Math.max(0, Math.min(terrain.width - 1, xRatio * (terrain.width - 1)))
  const y = Math.max(0, Math.min(terrain.height - 1, yRatio * (terrain.height - 1)))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(terrain.width - 1, x0 + 1)
  const y1 = Math.min(terrain.height - 1, y0 + 1)
  const sx = x - x0
  const sy = y - y0
  const h00 = terrain.heights[y0 * terrain.width + x0]
  const h10 = terrain.heights[y0 * terrain.width + x1]
  const h01 = terrain.heights[y1 * terrain.width + x0]
  const h11 = terrain.heights[y1 * terrain.width + x1]
  const top = h00 * (1 - sx) + h10 * sx
  const bottom = h01 * (1 - sx) + h11 * sx
  return top * (1 - sy) + bottom * sy
}

export function terrainPoint(lon: number, lat: number, terrain: TerrainData, exaggeration: number) {
  const { x, z } = lonLatToXZ(lon, lat, terrain)
  const y = elevationToY(sampleElevation(lon, lat, terrain), terrain, exaggeration)
  return new THREE.Vector3(x, y, z)
}

export function createTerrainGeometry(terrain: TerrainData, exaggeration: number) {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()

  for (let row = 0; row < terrain.height; row += 1) {
    for (let col = 0; col < terrain.width; col += 1) {
      const x = (col / (terrain.width - 1) - 0.5) * TERRAIN_SIZE
      const z = (row / (terrain.height - 1) - 0.5) * TERRAIN_SIZE
      const elevation = terrain.heights[row * terrain.width + col]
      const y = elevationToY(elevation, terrain, exaggeration)
      positions.push(x, y, z)

      const normalized = (elevation - terrain.minElevation) / (terrain.maxElevation - terrain.minElevation)
      color.setHSL(0.28 - normalized * 0.1, 0.24, 0.32 + normalized * 0.36)
      colors.push(color.r, color.g, color.b)
    }
  }

  for (let row = 0; row < terrain.height - 1; row += 1) {
    for (let col = 0; col < terrain.width - 1; col += 1) {
      const a = row * terrain.width + col
      const b = a + 1
      const c = a + terrain.width
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
