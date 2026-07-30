import { expect, test, type Page } from '@playwright/test'
import type { DailyForecast, LatestData } from '../../src/types'
import { loadPublicJson } from './public-fixtures'

const MOUNTAIN_NOW = '2026-07-31T00:30:00+12:00'

async function useOutlookFixture(
  page: Page,
  options: {
    generatedAt: string
    dates: string[]
    snowfallCm?: number
  },
) {
  const latest = await loadPublicJson<LatestData>('latest.json')
  const sourceDay = latest.daily?.[0]
  if (!sourceDay) throw new Error('Expected a daily forecast fixture')

  const daily: DailyForecast[] = options.dates.map((date) => ({
    ...sourceDay,
    date,
    snowfallCm: options.snowfallCm ?? sourceDay.snowfallCm,
  }))

  await page.route('**/data/latest.json', async (route) => {
    await route.fulfill({
      json: {
        ...latest,
        generatedAt: options.generatedAt,
        daily,
      },
    })
  })
}

async function openOutlook(page: Page) {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Mountain information' })
    .getByRole('button', { name: 'Outlook' })
    .click()
  await expect(page.getByRole('region', { name: '14 day forecast' })).toBeVisible()
}

test('labels forecast dates from the Mt Hutt calendar instead of array position', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(MOUNTAIN_NOW))
  await useOutlookFixture(page, {
    generatedAt: '2026-07-30T12:30:00Z',
    dates: ['2026-08-01', '2026-08-02'],
  })

  await openOutlook(page)

  await expect(page.getByRole('button', { name: /^Tomorrow,/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Today,/ })).toHaveCount(0)
})

test('shows issue age and warns when the outlook is older than 24 hours', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-03T12:00:00+12:00'))
  await useOutlookFixture(page, {
    generatedAt: '2026-07-31T00:00:00+12:00',
    dates: ['2026-08-03'],
  })

  await openOutlook(page)

  const issue = page.locator('.outlook-issued')
  await expect(issue).toContainText(/Issued .* ago/)
  await expect(issue).toContainText('Outlook may be stale')
})

test('classifies lead day eight as a restrained low-confidence model trend', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(MOUNTAIN_NOW))
  await useOutlookFixture(page, {
    generatedAt: '2026-07-30T12:30:00Z',
    dates: ['2026-08-07'],
    snowfallCm: 3.7,
  })

  await openOutlook(page)

  const longRangeDay = page.getByRole('button', {
    name: /lead day 8, low-confidence model trend/,
  })
  await expect(longRangeDay).toBeVisible()
  await expect(longRangeDay).toContainText('low confidence')

  await longRangeDay.click()
  const row = page.getByRole('listitem').filter({ has: longRangeDay })
  await expect(row).toContainText(
    'Low-confidence model trend. Treat exact timing and totals as directional.',
  )
  await expect(row.getByText('~4 cm model estimate')).toBeVisible()
  await expect(row.getByText('3.7 cm')).toHaveCount(0)
})
