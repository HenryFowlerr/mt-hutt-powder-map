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

export type PowderPoint = {
  lon: number
  lat: number
  score: number
  recentScore: number
  forecastScore: number
  reason: string
}

export type LatestData = {
  generatedAt: string
  location: string
  summary: {
    recentSnowCm: number
    forecastSnowCm: number
    mainWindDirectionDeg: number
    avgWindKph: number
    temperatureMinC: number
    temperatureMaxC: number
    confidence: 'low' | 'medium' | 'high'
    headline: string
    reasons: string[]
  }
  observations: unknown[]
  forecast: unknown[]
  powderGrid: PowderPoint[]
}
