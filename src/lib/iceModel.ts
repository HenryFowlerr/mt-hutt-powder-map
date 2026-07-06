import { angularDifference, boxBlur, clamp01, smoothstep, type TerrainAnalysis } from './terrainAnalysis'
import type { TerrainData } from '../types'

// Terrain-aware ice / hardpack risk. Ice forms from a different set of
// processes than powder: melt-freeze on sun-exposed aspects, rain-on-snow
// that later refreezes, wind-scoured boilerplate on exposed ridges, and
// old un-refreshed surfaces where no snow has fallen recently. It is highest
// exactly where powder is lowest, so the two overlays complement each other.

export type IceWeather = {
  temperatureMaxC: number
  temperatureMinC: number
  meltFreezeCycles: number
  recentRainMm: number
  hoursAboveZero: number
  hoursSinceSnow: number
  freezingLevelM?: number
}

export type IceField = {
  width: number
  height: number
  risk: Float32Array // 0..1
}

// Southern hemisphere: the sun sits to the NORTH, so north-facing slopes get
// the most solar melt-freeze. Aspect 0 = N.
function solarExposure(aspectDeg: number, slopeDeg: number) {
  const facingNorth = 1 - smoothstep(20, 110, angularDifference(aspectDeg, 0))
  const tilt = smoothstep(6, 34, slopeDeg)
  return facingNorth * tilt
}

export function buildIceField(
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  weather: IceWeather,
): IceField {
  const size = terrain.width * terrain.height
  const risk = new Float32Array(size)

  // Storm-wide drivers (0..1).
  const meltFreeze = clamp01(weather.meltFreezeCycles / 3)
  const rainOnSnow = clamp01(weather.recentRainMm / 15)
  const staleness = smoothstep(18, 72, weather.hoursSinceSnow) // no fresh cover
  const warmSpell = clamp01(weather.hoursAboveZero / 24)

  for (let index = 0; index < size; index += 1) {
    const skiable = analysis.skiMask[index]
    if (skiable < 0.25) continue

    const elevation = terrain.heights[index]
    const slope = analysis.slopeDeg[index]
    const aspect = analysis.aspectDeg[index]

    // Lower/warmer terrain refreezes hardest after melt or rain.
    const lowWarm = 1 - smoothstep(1500, 2050, elevation)

    // Sun aspects that melt in the day then refreeze at night.
    const solar = solarExposure(aspect, slope) * (0.4 + 0.6 * warmSpell)

    // Rain-on-snow glazes everything, worst low down.
    const rainIce = rainOnSnow * (0.5 + 0.5 * lowWarm)

    // Wind-scoured convex ridges and steep faces go to boilerplate.
    const windScour = clamp01(analysis.ridgeExposure[index] * 0.7 + smoothstep(30, 50, slope) * 0.5)

    // Sheltered concave gullies hold soft snow longest — less ice there.
    const shelter = 1 - analysis.gullyFactor[index] * 0.6

    let value =
      0.34 * meltFreeze * (0.4 + 0.6 * solar) +
      0.3 * rainIce +
      0.22 * windScour * (0.5 + 0.5 * staleness) +
      0.14 * staleness * lowWarm
    value *= shelter

    // If it is genuinely cold and snowed very recently, suppress ice.
    const freshCold = smoothstep(0, 12, weather.hoursSinceSnow) // 0 right after snow
    value *= 0.25 + 0.75 * freshCold
    if (weather.temperatureMaxC < -4 && weather.recentRainMm < 1) value *= 0.5

    risk[index] = clamp01(value) * smoothstep(0.25, 0.6, skiable)
  }

  return { width: terrain.width, height: terrain.height, risk: boxBlur(risk, terrain.width, terrain.height, 1) }
}

export function iceColorForRisk(risk: number) {
  if (risk >= 0.75) return '#4aa3d9' // hard boilerplate
  if (risk >= 0.55) return '#7cc0e4'
  if (risk >= 0.38) return '#a9d6ef'
  if (risk >= 0.22) return '#cfe8f6'
  return '#e8f4fb'
}

export function iceRiskLabel(risk: number) {
  if (risk >= 0.75) return 'boilerplate / hard ice'
  if (risk >= 0.55) return 'firm, icy patches likely'
  if (risk >= 0.38) return 'variable, some ice'
  return 'mostly grippy'
}

export function fieldMaxRisk(field: IceField) {
  let max = 0
  for (let i = 0; i < field.risk.length; i += 1) if (field.risk[i] > max) max = field.risk[i]
  return max
}

export function describeIce(
  index: number,
  terrain: TerrainData,
  analysis: TerrainAnalysis,
  weather: IceWeather,
): string {
  const elevation = terrain.heights[index]
  const facingNorth = 1 - smoothstep(20, 110, angularDifference(analysis.aspectDeg[index], 0))
  if (weather.recentRainMm >= 5 && elevation < 1650) {
    return 'Rain-on-snow glaze that has refrozen — expect a hard, slick surface.'
  }
  if (facingNorth > 0.5 && weather.meltFreezeCycles >= 1) {
    return 'Sun-facing slope that melts by day and refreezes overnight into crust.'
  }
  if (analysis.ridgeExposure[index] > 0.5) {
    return 'Wind-scoured, exposed terrain — likely wind-buffed hardpack or boilerplate.'
  }
  return 'Older, un-refreshed surface that has firmed up between snowfalls.'
}
