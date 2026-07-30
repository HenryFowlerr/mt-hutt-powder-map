import { expect, test } from '@playwright/test'

test('explains a required data failure and recovers when retried', async ({ page }) => {
  let terrainRequests = 0
  await page.route('**/data/terrain.json', async (route) => {
    terrainRequests += 1
    if (terrainRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary test failure' }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/')

  const status = page.getByRole('status')
  await expect(status).toContainText('Could not load data/terrain.json: 503')
  const retry = status.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible()

  await retry.click()

  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  await expect(retry).toHaveCount(0)
  expect(terrainRequests).toBe(2)
})

test('continues when the optional base-map detail request fails', async ({ page }) => {
  await page.route('**/data/map-overrides.geojson', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Optional test failure' }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('region', { name: 'Interactive Mt Hutt terrain map' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('keeps weather and safety sources as accessible external links', async ({ page }) => {
  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()

  const sources = [
    { name: 'Weather data by Open-Meteo', href: 'https://open-meteo.com/' },
    {
      name: 'Check official live mountain, road & lift status',
      href: 'https://www.mthutt.co.nz/weather-report/',
    },
    { name: 'Avalanche advisory', href: 'https://www.avalanche.net.nz/' },
  ]

  for (const source of sources) {
    const link = brief.getByRole('link', { name: source.name })
    await expect(link).toHaveAttribute('href', source.href)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noreferrer/)
  }

  await expect(brief.getByText('Experimental terrain model. Never a safety or access decision.')).toBeVisible()
})
