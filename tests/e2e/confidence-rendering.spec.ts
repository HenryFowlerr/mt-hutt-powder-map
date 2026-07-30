import { expect, test, type Page, type Route } from '@playwright/test'

type LatestFixture = {
  generatedAt: string
  summary: Record<string, unknown>
  forecast: Array<Record<string, unknown>>
  [key: string]: unknown
}

function freshForecast(fixture: LatestFixture) {
  const now = Date.now()
  return fixture.forecast.map((hour, index) => ({
    ...hour,
    time: new Date(now + (index + 1) * 60 * 60 * 1000).toISOString(),
  }))
}

async function interceptLatest(
  page: Page,
  transform: (fixture: LatestFixture) => LatestFixture,
) {
  await page.route('**/data/latest.json', async (route: Route) => {
    const response = await route.fetch()
    const fixture = (await response.json()) as LatestFixture
    await route.fulfill({ response, json: transform(fixture) })
  })
}

function parseHeroLabel(label: string | null) {
  const values = label?.match(
    /Likely deepest modelled pocket ([\d.]+)–([\d.]+) centimetres, centred on ([\d.]+) centimetres/,
  )
  expect(values, `unexpected hero accessibility label: ${label}`).not.toBeNull()
  return {
    minimum: Number(values![1]),
    maximum: Number(values![2]),
    centre: Number(values![3]),
  }
}

test('loads the deferred 3D scene into a visible, sized canvas', async ({ page }) => {
  const chunkLoaded = page.waitForResponse(
    (response) =>
      /\/assets\/MountainScene-[^/]+\.js$/.test(new URL(response.url()).pathname) &&
      response.ok(),
  )

  await page.goto('/')
  await chunkLoaded

  const canvas = page
    .getByRole('region', { name: 'Interactive Mt Hutt terrain map' })
    .locator('canvas')
  await expect(canvas).toBeVisible()

  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThan(100)
  expect(bounds!.height).toBeGreaterThan(100)
})

test('presents a coherent range and confidence when ensemble data is unavailable', async ({
  page,
}) => {
  await interceptLatest(page, (fixture) => {
    const withoutEnsemble = {
      ...fixture,
      generatedAt: new Date().toISOString(),
      forecast: freshForecast(fixture),
    }
    delete withoutEnsemble.ensemble
    return withoutEnsemble
  })

  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()

  const hero = brief.locator('[aria-label^="Likely deepest modelled pocket"]')
  const range = parseHeroLabel(await hero.getAttribute('aria-label'))
  expect(range.minimum).toBeLessThanOrEqual(range.centre)
  expect(range.maximum).toBeGreaterThanOrEqual(range.centre)

  const confidence = brief.locator('.forecast-confidence-read')
  const confidenceLabel = (await confidence.getAttribute('aria-label')) ?? ''
  const confidenceText = await confidence.innerText()
  const level = confidenceText.match(/\b(low|medium|high) confidence\b/i)?.[1].toLowerCase()
  expect(level).toBeTruthy()
  expect(confidenceLabel.toLowerCase()).toContain(`${level} forecast confidence`)
  expect(`${confidenceLabel} ${confidenceText}`).not.toMatch(/ensemble|forecast runs|probability/i)

  const status = brief.locator('.model-status')
  await expect(status).toHaveAttribute('aria-label', `Forecast confidence ${level}`)
  await expect(status).toContainText(`Forecast · ${level} confidence`, { ignoreCase: true })
  await expect(brief.getByText(/Terrain signal ·/)).toHaveCount(0)
})

test('scales ensemble spread around the terrain peak and exposes model agreement', async ({
  page,
}) => {
  const rawEnsemble = { p10: 1, p50: 2, p90: 4, mean: 2.2 }

  await interceptLatest(page, (fixture) => {
    const forecast = freshForecast(fixture)
    return {
      ...fixture,
      generatedAt: new Date().toISOString(),
      summary: {
        ...fixture.summary,
        forecastSnowCm: 7,
      },
      forecast,
      ensemble: {
        source: 'Open-Meteo Ensemble API',
        model: 'gfs_seamless',
        generatedAt: new Date().toISOString(),
        windowStartAt: String(forecast[0]?.time),
        windowEndAt: String(forecast[71]?.time),
        windowHours: 72,
        memberCount: 31,
        snowfallCm: rawEnsemble,
        probabilityPct: {
          atLeast1Cm: 88,
          atLeast5Cm: 42,
          atLeast10Cm: 17,
        },
      },
    }
  })

  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()

  const confidence = brief.locator('.forecast-confidence-read')
  await expect(confidence).toContainText('31 forecast runs')
  await expect(confidence).toContainText(/model agreement/i)
  await expect(confidence).toContainText('ensemble median 2 cm')
  await expect(confidence).toContainText('88% chance of at least 1 cm mountain-wide')

  const hero = brief.locator('[aria-label^="Likely deepest modelled pocket"]')
  const range = parseHeroLabel(await hero.getAttribute('aria-label'))
  expect(range.centre).toBeGreaterThan(rawEnsemble.p90)
  expect(
    Math.abs(range.minimum - range.centre * (rawEnsemble.p10 / rawEnsemble.p50)),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(range.maximum - range.centre * (rawEnsemble.p90 / rawEnsemble.p50)),
  ).toBeLessThanOrEqual(1)
  expect([range.minimum, range.maximum]).not.toEqual([rawEnsemble.p10, rawEnsemble.p90])
})
