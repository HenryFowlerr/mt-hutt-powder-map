import { expect, test, type Page } from '@playwright/test'
import { assessRecentTerrainSignal } from '../../src/lib/recentTerrainSignal'
import type { LatestData, WeatherHour } from '../../src/types'
import { loadPublicJson } from './public-fixtures'

function recentHours(endMs: number, count = 72): WeatherHour[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(endMs - (count - index - 1) * 60 * 60 * 1000).toISOString(),
    temperatureC: -2,
    snowfallCm: 0,
    windKph: 15,
    windDirectionDeg: 280,
  }))
}

async function useSignalFixture(
  page: Page,
  options: {
    recentSnowCm: number
    forecastSnowCm: number
    ageHours?: number
    omitExplicitSignal?: boolean
  },
) {
  const latest = await loadPublicJson<LatestData>('latest.json')
  const now = Date.now()
  const generatedAt = new Date(now - (options.ageHours ?? 0) * 60 * 60 * 1000).toISOString()
  const observations = recentHours(Date.parse(generatedAt))
  const recentTerrainSignal = assessRecentTerrainSignal({
    recentSnowCm: options.recentSnowCm,
    generatedAt,
    recentHours: observations,
  })
  const summary = {
    ...latest.summary,
    recentSnowCm: options.recentSnowCm,
    forecastSnowCm: options.forecastSnowCm,
    recentTerrainSignal,
  }
  if (options.omitExplicitSignal) delete summary.recentTerrainSignal
  const fixture = {
    ...latest,
    generatedAt,
    observations,
    summary,
  }

  await page.route('**/data/latest.json', async (route) => {
    await route.fulfill({ json: fixture })
  })
}

async function recentStatus(page: Page) {
  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()
  await brief.getByRole('button', { name: 'Last 72 hours' }).click()
  return brief.locator('.model-status')
}

test('dry recent window stays none when the future forecast is snowy', async ({ page }) => {
  await useSignalFixture(page, { recentSnowCm: 0, forecastSnowCm: 18 })
  const status = await recentStatus(page)

  await expect(status).toContainText('Terrain signal · none')
  await expect(status).toHaveAttribute(
    'aria-label',
    /Recent terrain signal none\. Data quality high; 72 of 72 recent model hours\./,
  )
  await expect(status).not.toContainText(/medium|high|forecast/i)
})

test('snowy recent window stays strong when the future forecast is dry', async ({ page }) => {
  await useSignalFixture(page, { recentSnowCm: 9, forecastSnowCm: 0 })
  const status = await recentStatus(page)

  await expect(status).toContainText('Terrain signal · strong')
  await expect(status).toHaveAttribute('aria-label', /Recent terrain signal strong/)
  await expect(status).not.toContainText(/forecast/i)
})

test('older latest files derive an explicit trace signal client-side', async ({ page }) => {
  await useSignalFixture(page, {
    recentSnowCm: 0.4,
    forecastSnowCm: 14,
    omitExplicitSignal: true,
  })
  const status = await recentStatus(page)

  await expect(status).toContainText('Terrain signal · trace')
  await expect(status).toHaveAttribute('aria-label', /Recent terrain signal trace/)
})

test('stale recent data is unknown instead of overstated', async ({ page }) => {
  await useSignalFixture(page, {
    recentSnowCm: 12,
    forecastSnowCm: 0,
    ageHours: 48,
  })
  const status = await recentStatus(page)

  await expect(status).toContainText('Terrain signal · unknown · stale or incomplete')
  await expect(status).toHaveAttribute(
    'aria-label',
    /Recent terrain signal unknown\. Data quality low;/,
  )
})
