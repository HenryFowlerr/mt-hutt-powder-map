import { expect, test, type Page } from '@playwright/test'
import { loadPublicJson } from './public-fixtures'

test.describe.configure({ mode: 'serial' })

type JsonObject = Record<string, unknown>

async function corruptFirstResponse(
  page: Page,
  path: string,
  corrupt: (value: JsonObject) => JsonObject,
) {
  let requests = 0
  const fixture = await loadPublicJson<JsonObject>(path.replace('data/', ''))
  await page.route(`**/${path}`, async (route) => {
    requests += 1
    if (requests === 1) {
      await route.fulfill({ json: corrupt(fixture) })
      return
    }
    await route.continue()
  })
  return () => requests
}

async function expectRetryAndRecovery(page: Page, expectedError: RegExp) {
  await page.goto('/')
  const status = page.getByRole('status')
  await expect(status).toContainText(expectedError)
  const retry = status.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toHaveCount(0)

  await retry.click()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  await expect(retry).toHaveCount(0)
}

test('rejects a weather response with no summary and recovers on retry', async ({ page }) => {
  const requestCount = await corruptFirstResponse(page, 'data/latest.json', (value) => {
    const corrupt = { ...value }
    delete corrupt.summary
    return corrupt
  })

  await expectRetryAndRecovery(
    page,
    /Weather data \(data\/latest\.json\) is invalid at summary: expected an object/,
  )
  expect(requestCount()).toBe(2)
})

test('rejects a terrain grid whose dimensions do not match its heights', async ({ page }) => {
  const requestCount = await corruptFirstResponse(page, 'data/terrain.json', (value) => ({
    ...value,
    heights: Array.isArray(value.heights) ? value.heights.slice(1) : [],
  }))

  await expectRetryAndRecovery(
    page,
    /Terrain data \(data\/terrain\.json\) is invalid at heights: expected \d+ values, received \d+/,
  )
  expect(requestCount()).toBe(2)
})

test('rejects an invalid hourly value and recovers on retry', async ({ page }) => {
  const requestCount = await corruptFirstResponse(page, 'data/latest.json', (value) => {
    const forecast = Array.isArray(value.forecast)
      ? value.forecast.map((hour, index) =>
          index === 0 && typeof hour === 'object' && hour !== null
            ? { ...hour, snowfallCm: 'unknown' }
            : hour,
        )
      : []
    return { ...value, forecast }
  })

  await expectRetryAndRecovery(
    page,
    /Weather data \(data\/latest\.json\) is invalid at forecast\[0\]\.snowfallCm: expected a finite number/,
  )
  expect(requestCount()).toBe(2)
})

test('ignores structurally invalid optional map overrides', async ({ page }) => {
  await page.route('**/data/map-overrides.geojson', async (route) => {
    await route.fulfill({ json: { type: 'FeatureCollection', features: 'invalid' } })
  })

  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})
