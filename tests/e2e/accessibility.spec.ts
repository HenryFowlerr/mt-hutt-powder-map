import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LatestData } from '../../src/types'
import { loadPublicJson } from './public-fixtures'

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

async function expectMinimumInteractiveTargets(scope: Locator, minimum = 44) {
  const tooSmall = await scope.locator('button, a[href], summary').evaluateAll(
    (elements, min) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return []
        }
        if (rect.width >= min && rect.height >= min) return []
        return [{
          control:
            element.getAttribute('aria-label') ??
            element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ??
            element.tagName,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }]
      }),
    minimum,
  )

  expect(tooSmall).toEqual([])
}

async function expectNoHorizontalInspectorOverflow(page: Page) {
  const dimensions = await page.locator('.inspector-scroll').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
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

// The powder field derives per-elevation snow from the hourly series when it
// carries phase inputs, so zeroing the summary totals alone still leaves a
// trace signal and its three zone-marker buttons in the tab order. Zero the
// hourly snowfall and precipitation too, so the focus-order expectations below
// describe the page deterministically instead of racing the 3D scene.
function withoutSnowSignal<T extends { snowfallCm: number }>(hours: readonly T[]) {
  return hours.map((hour) => ({
    ...hour,
    snowfallCm: 0,
    precipitationMm: 0,
    rainMm: 0,
  }))
}

async function useMarkerFreeForecast(page: Page) {
  const latest = await loadPublicJson<LatestData>('latest.json')
  const markerFree = {
    ...latest,
    summary: {
      ...latest.summary,
      recentSnowCm: 0,
      forecastSnowCm: 0,
    },
    observations: withoutSnowSignal(latest.observations),
    forecast: withoutSnowSignal(latest.forecast),
  }
  await page.route('**/data/latest.json', async (route) => {
    await route.fulfill({ json: markerFree })
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
    controls.getByRole('button', { name: /Reset map orientation to north/ }),
    inspector.getByRole('button', { name: 'Brief' }),
    inspector.getByRole('button', { name: 'Outlook' }),
    inspector.getByRole('button', { name: 'Layers' }),
    page.getByRole('button', { name: 'Last 72 hours' }),
    page.getByRole('button', { name: 'Next 72 hours' }),
  ]

  await expect(page.locator('button[aria-label^="Focus "]')).toHaveCount(0)

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
    const compass = page.getByRole('button', { name: /Reset map orientation to north/ })
    await page.keyboard.press('Tab')
    await expectVisibleFocus(view)
    await page.keyboard.press('Tab')
    await expectVisibleFocus(reset)
    await page.keyboard.press('Tab')
    await expectVisibleFocus(compass)

    const inspector = page.getByRole('navigation', { name: 'Mountain information' })
    for (const name of ['Brief', 'Outlook', 'Layers']) {
      await page.keyboard.press('Tab')
      await expectVisibleFocus(inspector.getByRole('button', { name }))
    }

    await expectNoHighImpactViolations(page)
  })

  test('keeps structural controls at least 44px across every inspector view', async ({
    page,
  }) => {
    await page.goto('/')
    const workspace = page.locator('.workspace-header, .inspector-shell')
    const inspector = page.getByRole('navigation', { name: 'Mountain information' })

    await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
    await expectMinimumInteractiveTargets(workspace)

    await inspector.getByRole('button', { name: 'Outlook' }).click()
    await expect(page.getByRole('region', { name: '14 day forecast' })).toBeVisible()
    await expectMinimumInteractiveTargets(workspace)

    await inspector.getByRole('button', { name: 'Layers' }).click()
    await expect(page.getByRole('region', { name: 'Map layers' })).toBeVisible()
    await expectMinimumInteractiveTargets(workspace)
  })

  test('keeps recovery controls at least 44px', async ({ page }) => {
    await page.route('**/data/terrain.json', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary test failure' }),
      })
    })
    await page.goto('/')

    const loading = page.locator('.loading-state')
    await expect(loading.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expectMinimumInteractiveTargets(loading)
  })

  test('keeps essential forecast controls reachable at an effective 200% zoom', async ({
    page,
  }) => {
    // A 390px CSS viewport becomes roughly 195px wide at 200% browser zoom.
    await page.setViewportSize({ width: 195, height: 422 })
    await page.goto('/')

    const inspectorNav = page.getByRole('navigation', { name: 'Mountain information' })
    const recent = page.getByRole('button', { name: 'Last 72 hours' })
    const forecast = page.getByRole('button', { name: 'Next 72 hours' })
    await expect(recent).toBeVisible()
    await expect(forecast).toBeVisible()
    await forecast.click()
    await expect(page.locator('.forecast-confidence-read')).toBeVisible()
    await expectNoHorizontalInspectorOverflow(page)

    await inspectorNav.getByRole('button', { name: 'Outlook' }).click()
    const today = page.getByRole('button', { name: /^Today,/ })
    await today.scrollIntoViewIfNeeded()
    await expect(today).toBeVisible()
    await today.click()
    await expect(today).toHaveAttribute('aria-expanded', 'true')
    await expectNoHorizontalInspectorOverflow(page)

    await inspectorNav.getByRole('button', { name: 'Layers' }).click()
    const snowfall = page.getByRole('button', { name: /Snowfall/ })
    await snowfall.scrollIntoViewIfNeeded()
    await expect(snowfall).toBeVisible()
    await expectNoHorizontalInspectorOverflow(page)
    await expectMinimumInteractiveTargets(page.locator('.workspace-header, .inspector-shell'))
  })
})
