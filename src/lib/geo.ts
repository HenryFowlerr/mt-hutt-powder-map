import type { TerrainData } from '../types'

// Equirectangular projection centred on the terrain bounds, preserving the
// true metre aspect ratio at Mt Hutt's latitude. World units are metres
// scaled by WORLD_UNITS_PER_METER so the ski area spans a comfortable
// camera range, and vertical scale matches horizontal scale exactly
// (before user exaggeration).

export const METERS_PER_DEGREE_LAT = 111_320
export const WORLD_UNITS_PER_METER = 0.0019

export function metersPerDegreeLon(lat: number) {
  return METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180)
}

/**
 * Return the point halfway along a polyline by cumulative ground distance.
 *
 * Segment lengths use the same local equirectangular metre approximation as
 * the terrain projection. Passing the terrain-centre latitude keeps map
 * anchors consistent across this small ski-area extent. Empty lines have no
 * midpoint; single-point and zero-length lines return a copied coordinate.
 */
export function polylineMidpoint(
  coordinates: readonly (readonly number[])[],
  referenceLat: number,
): [number, number] | null {
  if (coordinates.length === 0) return null
  const first: [number, number] = [coordinates[0][0], coordinates[0][1]]
  if (coordinates.length === 1) return first

  const lonScale = metersPerDegreeLon(referenceLat)
  const segmentLengths: number[] = []
  let totalLength = 0

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    const length = Math.hypot(
      (current[0] - previous[0]) * lonScale,
      (current[1] - previous[1]) * METERS_PER_DEGREE_LAT,
    )
    segmentLengths.push(length)
    totalLength += length
  }

  if (totalLength === 0) return first

  const halfway = totalLength / 2
  let travelled = 0
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]
    if (travelled + segmentLength >= halfway) {
      const start = coordinates[index]
      const end = coordinates[index + 1]
      const fraction = segmentLength === 0 ? 0 : (halfway - travelled) / segmentLength
      return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ]
    }
    travelled += segmentLength
  }

  const last = coordinates[coordinates.length - 1]
  return [last[0], last[1]]
}

export function terrainCenter(terrain: TerrainData) {
  return {
    lon: (terrain.bounds.west + terrain.bounds.east) / 2,
    lat: (terrain.bounds.south + terrain.bounds.north) / 2,
  }
}

export function terrainWorldSize(terrain: TerrainData) {
  const center = terrainCenter(terrain)
  const widthMeters = (terrain.bounds.east - terrain.bounds.west) * metersPerDegreeLon(center.lat)
  const heightMeters = (terrain.bounds.north - terrain.bounds.south) * METERS_PER_DEGREE_LAT
  return {
    x: widthMeters * WORLD_UNITS_PER_METER,
    z: heightMeters * WORLD_UNITS_PER_METER,
  }
}

// North is -Z, east is +X.
export function lonLatToXZ(lon: number, lat: number, terrain: TerrainData) {
  const center = terrainCenter(terrain)
  return {
    x: (lon - center.lon) * metersPerDegreeLon(center.lat) * WORLD_UNITS_PER_METER,
    z: (center.lat - lat) * METERS_PER_DEGREE_LAT * WORLD_UNITS_PER_METER,
  }
}

export function xzToLonLat(x: number, z: number, terrain: TerrainData) {
  const center = terrainCenter(terrain)
  return {
    lon: center.lon + x / (metersPerDegreeLon(center.lat) * WORLD_UNITS_PER_METER),
    lat: center.lat - z / (METERS_PER_DEGREE_LAT * WORLD_UNITS_PER_METER),
  }
}
