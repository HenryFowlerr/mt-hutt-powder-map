import { expect, test, type Page } from '@playwright/test'
import { loadPublicJson } from './public-fixtures'

// The corrupt-cache case intentionally boots the deferred terrain renderer
// three times. Allow for cold software WebGL setup in CI without weakening any
// individual readiness assertion.
test.setTimeout(60_000)

type DataMode = 'network' | 'offline' | 'corrupt-latest'

async function installRequiredDataSwitch(page: Page) {
  let mode: DataMode = 'network'
  const latest = await loadPublicJson<Record<string, unknown>>('latest.json')

  await page.route(
    /\/data\/(terrain\.json|trails\.geojson|latest\.json)$/,
    async (route) => {
      if (mode === 'offline') {
        await route.abort('failed')
        return
      }

      if (mode === 'corrupt-latest' && route.request().url().endsWith('/data/latest.json')) {
        const corrupt = { ...latest }
        delete corrupt.summary
        await route.fulfill({ json: corrupt })
        return
      }

      await route.continue()
    },
  )

  return (nextMode: DataMode) => {
    mode = nextMode
  }
}

async function expectMountainLoaded(page: Page) {
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  // Creating the 240×280 terrain textures can take longer than the default
  // assertion window on a cold software WebGL renderer, especially directly
  // after a reload. Wait for the real canvas rather than treating the already
  // rendered brief as proof that the deferred map chunk has finished.
  await expect(page.locator('.map-stage canvas')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
}

test('warm reload uses verified cached brief and map when required data requests fail', async ({
  page,
}) => {
  const setDataMode = await installRequiredDataSwitch(page)
  await page.goto('/')
  await expectMountainLoaded(page)

  setDataMode('offline')
  await page.reload()

  await expectMountainLoaded(page)
  await expect(page.locator('.brand-freshness.cached')).toContainText('Cached data')
  await expect(page.getByRole('note')).toContainText('Showing the last verified mountain update')
})

test('cold data failure keeps the clear retry state instead of inventing cached data', async ({
  page,
}) => {
  const setDataMode = await installRequiredDataSwitch(page)
  setDataMode('offline')
  await page.goto('/')

  const failure = page.getByRole('status').filter({ hasText: 'Map data unavailable' })
  await expect(failure).toContainText('Mountain data is temporarily unavailable.')
  await expect(failure.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.locator('.brand-freshness.cached')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toHaveCount(0)
})

test('a corrupt network response cannot poison the last verified cache', async ({ page }) => {
  const setDataMode = await installRequiredDataSwitch(page)
  await page.goto('/')
  await expectMountainLoaded(page)

  setDataMode('corrupt-latest')
  await page.reload()
  await expectMountainLoaded(page)
  await expect(page.locator('.brand-freshness.cached')).toContainText('Cached data')

  setDataMode('offline')
  await page.reload()
  await expectMountainLoaded(page)
  await expect(page.getByRole('note')).toContainText('last verified mountain update')
})

test('cached data refreshes from the network when connectivity returns', async ({ page }) => {
  const setDataMode = await installRequiredDataSwitch(page)
  await page.goto('/')
  await expectMountainLoaded(page)

  setDataMode('offline')
  await page.reload()
  await expect(page.locator('.brand-freshness.cached')).toBeVisible()

  setDataMode('network')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(page.locator('.brand-freshness.cached')).toHaveCount(0)
  await expect(page.locator('.brand-freshness')).toContainText('Updated')
  await expect(page.getByRole('note')).toHaveCount(0)
  await expectMountainLoaded(page)
})
