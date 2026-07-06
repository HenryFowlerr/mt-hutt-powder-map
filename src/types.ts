export type TerrainData = {
  bounds: {
    west: number
    south: number
    east: number
    north: number
  }
  width: number
  height: number
  minElevation: number
  maxElevation: number
  heights: number[]
  source?: string
  generatedAt?: string
}

export type TrailFeature = {
  type: 'Feature'
  properties: {
    name: string
    kind: 'run' | 'lift' | 'boundary' | 'base' | 'summit'
    difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'extreme'
    color?: string
    label?: boolean
  }
  geometry: {
    type: 'LineString' | 'Point' | 'Polygon'
    coordinates: number[] | number[][] | number[][][]
  }
}

export type TrailCollection = {
  type: 'FeatureCollection'
  features: TrailFeature[]
}

export type PowderPolygon = {
  id: string
  mode: 'recent' | 'forecast'
  thresholdCm: number
  expectedSnowCm: number
  score: number
  reason: string
  dominantFactor: string
  coordinates: number[][][] // [ring][vertex][lon, lat]
}

export type LatestData = {
  generatedAt: string
  location: string
  summary: {
    recentSnowCm: number
    forecastSnowCm: number
    mainWindDirectionDeg: number
    avgWindKph: number
    maxGustKph?: number
    forecastWindDirectionDeg?: number
    forecastAvgWindKph?: number
    forecastMaxGustKph?: number
    forecastTemperatureMinC?: number
    forecastTemperatureMaxC?: number
    cloudLowPct?: number
    cloudMidPct?: number
    cloudHighPct?: number
    freezingLevelM?: number
    temperatureMinC: number
    temperatureMaxC: number
    confidence: 'low' | 'medium' | 'high'
    headline: string
    reasons: string[]
  }
  observations: unknown[]
  forecast: unknown[]
  powderPolygons?: PowderPolygon[]
}
