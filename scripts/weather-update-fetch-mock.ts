import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenario = process.env.WEATHER_FETCH_TEST_SCENARIO

const HOURLY_FIELD_DEFAULTS: Record<string, number> = {
  temperature_2m: -4,
  precipitation: 0.4,
  rain: 0,
  snowfall: 0.3,
  snow_depth: 0.8,
  wind_speed_10m: 32,
  wind_direction_10m: 360,
  wind_gusts_10m: 55,
  cloud_cover: 80,
  cloud_cover_low: 60,
  cloud_cover_mid: 40,
  cloud_cover_high: 20,
  freezing_level_height: 1200,
  weather_code: 71,
}

/**
 * A well-formed payload blowing straight out of the north. Open-Meteo reports
 * that bearing as 360, and alternating 359/360 also drives the snow-weighted
 * averages to round up to 360, so this exercises both ways a published
 * direction can escape the canonical [0, 360) range.
 */
function northWindPayload() {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const firstHour = (Math.floor(nowSeconds / 3600) - 72) * 3600
  const time = Array.from({ length: 145 }, (_, index) => firstHour + index * 3600)
  const hourly: Record<string, number[]> = { time }
  for (const [field, value] of Object.entries(HOURLY_FIELD_DEFAULTS)) {
    hourly[field] = time.map(() => value)
  }
  hourly.wind_direction_10m = time.map((_, index) => (index % 2 === 0 ? 360 : 359))
  return { hourly }
}

globalThis.fetch = (async (input, init) => {
  const requestUrl = String(input)
  if (requestUrl.includes('ensemble-api.open-meteo.com')) {
    return new Response(JSON.stringify({ error: 'optional ensemble unavailable in test' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (scenario === 'timeout') {
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) {
        reject(new Error('Test expected the deterministic weather request to have a timeout'))
        return
      }
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      // AbortSignal.timeout() uses an unref'ed timer in Node. Keep this mocked
      // request alive so the subprocess observes the abort instead of Node's
      // unsettled-top-level-await exit code.
      const keepAlive = setTimeout(
        () => reject(new Error('Timed out waiting for the updater abort signal')),
        1_000,
      )
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(keepAlive)
          reject(signal.reason)
        },
        { once: true },
      )
    })
  }

  if (scenario === 'http') {
    return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (scenario === 'north-wind') {
    return new Response(JSON.stringify(northWindPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (scenario === 'malformed') {
    const fixture = readFileSync(
      join(process.cwd(), 'scripts', 'fixtures', 'weather-malformed.json'),
      'utf8',
    )
    return new Response(fixture, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  throw new Error(`Unknown WEATHER_FETCH_TEST_SCENARIO: ${String(scenario)}`)
}) as typeof fetch
