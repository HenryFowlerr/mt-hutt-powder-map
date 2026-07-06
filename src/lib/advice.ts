// Plain-language conditions + clothing advice from the weather numbers.
// Used for the overall side-panel line and per-day in the 14-day forecast.

export type Conditions = {
  sky: string // e.g. "Snowing", "Overcast", "Clear"
  icon: string // emoji glyph
  feelsLike: string // e.g. "bitterly cold"
  layers: string[] // recommended clothing
  note: string // one-line summary
}

// WMO weather-code → short sky description + glyph.
function skyFromCode(code: number, cloudPct: number): { sky: string; icon: string } {
  if (code >= 71 && code <= 77) return { sky: 'Snowing', icon: '🌨️' }
  if (code >= 85 && code <= 86) return { sky: 'Snow showers', icon: '🌨️' }
  if (code >= 95) return { sky: 'Storm', icon: '⛈️' }
  if (code >= 61 && code <= 67) return { sky: 'Rain / sleet', icon: '🌧️' }
  if (code >= 51 && code <= 57) return { sky: 'Drizzle / flurries', icon: '🌦️' }
  if (code >= 45 && code <= 48) return { sky: 'Fog', icon: '🌫️' }
  if (cloudPct >= 80) return { sky: 'Overcast', icon: '☁️' }
  if (cloudPct >= 40) return { sky: 'Partly cloudy', icon: '⛅' }
  return { sky: 'Clear', icon: '☀️' }
}

// Wind-chill feel from temperature and wind (simple NZ MetService style).
function feelsLike(tempC: number, windKph: number): string {
  const chill =
    windKph > 5
      ? 13.12 + 0.6215 * tempC - 11.37 * Math.pow(windKph, 0.16) + 0.3965 * tempC * Math.pow(windKph, 0.16)
      : tempC
  if (chill <= -15) return 'bitterly cold'
  if (chill <= -8) return 'very cold'
  if (chill <= -2) return 'cold'
  if (chill <= 3) return 'chilly'
  return 'mild'
}

export function conditionsAdvice(input: {
  tempMinC: number
  tempMaxC: number
  windKph: number
  gustKph?: number
  cloudPct: number
  weatherCode?: number
  snowfallCm?: number
  rainMm?: number
}): Conditions {
  const { sky, icon } = skyFromCode(input.weatherCode ?? (input.snowfallCm && input.snowfallCm > 1 ? 73 : 3), input.cloudPct)
  const feel = feelsLike(input.tempMinC, input.gustKph ?? input.windKph)

  const layers: string[] = []
  if (input.tempMinC <= -8) layers.push('thermal base', 'mid fleece', 'insulated jacket')
  else if (input.tempMinC <= -2) layers.push('base layer', 'mid layer', 'shell')
  else layers.push('base layer', 'softshell')

  layers.push('goggles')
  if ((input.gustKph ?? input.windKph) >= 45) layers.push('neck gaiter / face cover')
  if (input.tempMinC <= -6) layers.push('warm gloves', 'beanie')
  if ((input.rainMm ?? 0) >= 2 && input.tempMinC > -1) layers.push('waterproof shell')

  const bits: string[] = [`${sky.toLowerCase()}`, `${feel}`]
  if ((input.snowfallCm ?? 0) >= 3) bits.push('fresh snow')
  if ((input.gustKph ?? input.windKph) >= 60) bits.push('strong wind — exposed lifts may hold')
  else if ((input.gustKph ?? input.windKph) >= 40) bits.push('breezy up high')
  const note = `${bits.join(', ')}.`

  return { sky, icon, feelsLike: feel, layers, note }
}
