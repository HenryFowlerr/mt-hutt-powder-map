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
    currentWindDirectionDeg?: number
    currentWindKph?: number
    currentGustKph?: number
    currentTemperatureC?: number
    forecastWindDirectionDeg?: number
    forecastAvgWindKph?: number
    forecastMaxGustKph?: number
    forecastTemperatureMinC?: number
    forecastTemperatureMaxC?: number
    recentFreezingLevelM?: number
    forecastFreezingLevelM?: number
    forecastRainMm?: number
    forecastHoursAboveZero?: number
    stormStartAt?: string
    stormEndAt?: string
    stormPeakSnowCm?: number
    windDirectionSpreadDeg?: number
    cloudLowPct?: number
    cloudMidPct?: number
    cloudHighPct?: number
    cloudMeanPct?: number
    freezingLevelM?: number
    meltFreezeCycles?: number
    recentRainMm?: number
    hoursAboveZero?: number
    hoursSinceSnow?: number
    temperatureMinC: number
    temperatureMaxC: number
    confidence: 'low' | 'medium' | 'high'
    headline: string
    reasons: string[]
  }
  observations: WeatherHour[]
  forecast: WeatherHour[]
  daily?: DailyForecast[]
  powderPolygons?: PowderPolygon[]
}

export type DailyForecast = {
  date: string
  snowfallCm: number
  precipMm: number
  rainMm: number
  tempMinC: number
  tempMaxC: number
  windMeanKph: number
  gustMaxKph: number
  windDirectionDeg: number
  cloudPct: number
  freezingLevelM: number
  weatherCode: number
}

export type WeatherHour = {
  time: string
  temperatureC: number
  snowfallCm: number
  windKph: number
  windDirectionDeg: number
  freezingLevelM?: number
  gustKph?: number
  rainMm?: number
  precipitationMm?: number
  cloudPct?: number
}
