import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LatestData } from '../../src/types'

test.describe.configure({ mode: 'serial' })
test.setTimeout(60_000)

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused()
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2)
}

async function expectNoHighImpactViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = results.violations.filter(
    ({ impact }) => impact === 'serious' || impact === 'critical',
  )
  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([])
}

async function useMarkerFreeForecast(page: Page) {
  await page.route('**/data/latest.json', async (route) => {
    const response = await route.fetch()
    const latest = (await response.json()) as LatestData
    latest.summary.recentSnowCm = 0
    latest.summary.forecastSnowCm = 0
    await route.fulfill({ response, json: latest })
  })
}

test('desktop navigation has a logical focus order and operable state controls', async ({
  page,
}) => {
  await useMarkerFreeForecast(page)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()

  const controls = page.getByRole('navigation', { name: 'Map view controls' })
  const inspector = page.getByRole('navigation', { name: 'Mountain information' })
  const expectedOrder = [
    controls.getByRole('button', { name: 'Switch to topographic view' }),
    controls.getByRole('button', { name: 'Reset map view' }),
    inspector.getByRole('button', { name: 'Brief' }),
    inspector.getByRole('button', { name: 'Outlook' }),
    inspector.getByRole('button', { name: 'Layers' }),
    page.getByRole('button', { name: 'Last 72 hours' }),
    page.getByRole('button', { name: 'Next 72 hours' }),
  ]

  for (const control of expectedOrder) {
    await page.keyboard.press('Tab')
    await expectVisibleFocus(control)
  }

  await page.keyboard.press('Shift+Tab')
  const recent = page.getByRole('button', { name: 'Last 72 hours' })
  await expectVisibleFocus(recent)
  await page.keyboard.press('Space')
  await expect(recent).toHaveAttribute('aria-pressed', 'true')

  const outlook = inspector.getByRole('button', { name: 'Outlook' })
  await outlook.focus()
  await page.keyboard.press('Enter')
  await expect(outlook).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: '14 day forecast' })).toBeVisible()

  const today = page.getByRole('button', { name: /^Today,/ })
  await today.focus()
  await page.keyboard.press('Enter')
  await expect(today).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Enter')
  await expect(today).toHaveAttribute('aria-expanded', 'false')
})

test('desktop views have no serious or critical WCAG violations', async ({ page }) => {
  await page.goto('/')
  const inspector = page.getByRole('navigation', { name: 'Mountain information' })
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
  await expectNoHighImpactViolations(page)

  await inspector.getByRole('button', { name: 'Outlook' }).click()
  await expect(page.getByRole('region', { name: '14 day forecast' })).toBeVisible()
  await expectNoHighImpactViolations(page)

  await inspector.getByRole('button', { name: 'Layers' }).click()
  await expect(page.getByRole('region', { name: 'Map layers' })).toBeVisible()
  await expectNoHighImpactViolations(page)
})

test('brief disclosure and external source links remain keyboard accessible', async ({ page }) => {
  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()

  const disclosure = brief.locator('summary').filter({ hasText: 'Inside the model' })
  await disclosure.focus()
  await expectVisibleFocus(disclosure)
  await page.keyboard.press('Enter')
  await expect(disclosure.locator('..')).toHaveAttribute('open', '')

  for (const name of ['Weather data by Open-Meteo', 'Official report', 'Avalanche advisory']) {
    const link = brief.getByRole('link', { name })
    await link.focus()
    await expectVisibleFocus(link)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noreferrer/)
  }
})

test.describe('390px mobile accessibility', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('icon controls keep accessible names, focus order, and clean WCAG results', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()

    const view = page.getByRole('button', { name: 'Switch to topographic view' })
    const reset = page.getByRole('button', { name: 'Reset map view' })
    await page.keyboard.press('Tab')
    await expectVisibleFocus(view)
    await page.keyboard.press('Tab')
    await expectVisibleFocus(reset)

    const inspector = page.getByRole('navigation', { name: 'Mountain information' })
    for (const name of ['Brief', 'Outlook', 'Layers']) {
      await page.keyboard.press('Tab')
      await expectVisibleFocus(inspector.getByRole('button', { name }))
    }

    await expectNoHighImpactViolations(page)
  })
})
