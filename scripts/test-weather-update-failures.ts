import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const updaterPath = join(projectRoot, 'scripts', 'fetch-weather.ts')
const mockUrl = pathToFileURL(join(projectRoot, 'scripts', 'weather-update-fetch-mock.ts')).href
const lastGood = `${JSON.stringify({
  generatedAt: '2026-01-01T00:00:00.000Z',
  sentinel: 'last-known-good',
})}\n`

function runFailureScenario(
  scenario: 'timeout' | 'http' | 'malformed',
  expectedError: RegExp,
) {
  const fixtureDir = mkdtempSync(join(tmpdir(), `mt-hutt-weather-${scenario}-`))
  const latestPath = join(fixtureDir, 'latest.json')
  writeFileSync(latestPath, lastGood)

  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--import', mockUrl, updaterPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          MT_HUTT_DATA_DIR: fixtureDir,
          WEATHER_FETCH_TEST_SCENARIO: scenario,
          WEATHER_FETCH_TIMEOUT_MS: '15',
        },
        timeout: 10_000,
      },
    )

    assert.equal(
      result.status,
      1,
      `${scenario} failure must exit 1\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
    assert.match(result.stderr, /Weather update failed, keeping previous data/)
    assert.match(result.stderr, expectedError)
    assert.equal(
      readFileSync(latestPath, 'utf8'),
      lastGood,
      `${scenario} failure must preserve latest.json byte-for-byte`,
    )
    assert.deepEqual(
      readdirSync(fixtureDir),
      ['latest.json'],
      `${scenario} failure must not leave a partial temporary publication`,
    )
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
}

/**
 * Due north is the one bearing Open-Meteo publishes as 360 rather than 0, and
 * rounding a snow-weighted mean of 359.5 or more lands there too. Both used to
 * be written straight through, which failed the data integrity check and stalled
 * the hourly update workflow until the wind swung off north.
 */
function runNorthWindScenario() {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'mt-hutt-weather-north-wind-'))
  const latestPath = join(fixtureDir, 'latest.json')
  writeFileSync(latestPath, readFileSync(join(projectRoot, 'public', 'data', 'latest.json'), 'utf8'))

  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--import', mockUrl, updaterPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          MT_HUTT_DATA_DIR: fixtureDir,
          WEATHER_FETCH_TEST_SCENARIO: 'north-wind',
        },
        timeout: 20_000,
      },
    )

    assert.equal(
      result.status,
      0,
      `a due-north payload must publish\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )

    const published = JSON.parse(readFileSync(latestPath, 'utf8'))
    const directions: Array<[string, unknown]> = [
      ['summary.mainWindDirectionDeg', published.summary.mainWindDirectionDeg],
      ['summary.currentWindDirectionDeg', published.summary.currentWindDirectionDeg],
      ['summary.forecastWindDirectionDeg', published.summary.forecastWindDirectionDeg],
      ...published.observations.map((hour: { windDirectionDeg: unknown }, index: number) => [
        `observations[${index}].windDirectionDeg`,
        hour.windDirectionDeg,
      ] as [string, unknown]),
      ...published.forecast.map((hour: { windDirectionDeg: unknown }, index: number) => [
        `forecast[${index}].windDirectionDeg`,
        hour.windDirectionDeg,
      ] as [string, unknown]),
      ...published.daily.map((day: { windDirectionDeg: unknown }, index: number) => [
        `daily[${index}].windDirectionDeg`,
        day.windDirectionDeg,
      ] as [string, unknown]),
    ]

    assert.ok(directions.length > 100, 'expected the due-north payload to publish a full series')
    for (const [path, value] of directions) {
      assert.ok(
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 360,
        `${path} must be folded into [0, 360), received ${String(value)}`,
      )
    }
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
}

runFailureScenario('timeout', /timed out|timeout|aborted/i)
runFailureScenario('http', /Open-Meteo 503/)
runFailureScenario('malformed', /hourly\.temperature_2m is missing or has the wrong length/)
runNorthWindScenario()

console.log(
  'Weather update failure checks passed: timeout, HTTP, and malformed payloads preserve the last good file and exit non-zero',
)
console.log('Weather update north-wind check passed: published bearings stay inside [0, 360)')
