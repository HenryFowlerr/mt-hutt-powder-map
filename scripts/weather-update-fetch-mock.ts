import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scenario = process.env.WEATHER_FETCH_TEST_SCENARIO

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
