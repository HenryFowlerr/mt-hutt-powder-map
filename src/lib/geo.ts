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
