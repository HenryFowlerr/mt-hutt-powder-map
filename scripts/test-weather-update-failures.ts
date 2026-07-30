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

runFailureScenario('timeout', /timed out|timeout|aborted/i)
runFailureScenario('http', /Open-Meteo 503/)
runFailureScenario('malformed', /hourly\.temperature_2m is missing or has the wrong length/)

console.log(
  'Weather update failure checks passed: timeout, HTTP, and malformed payloads preserve the last good file and exit non-zero',
)
