import { expect, test } from '@playwright/test'

const LINK_NAME = 'Check official live mountain, road & lift status'
const REPORT_URL = 'https://www.mthutt.co.nz/weather-report/'

test('places a clearly sourced official operations link before the primary snow read', async ({
  page,
}) => {
  await page.goto('/')
  const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
  await expect(brief).toBeVisible()

  const link = brief.getByRole('link', { name: LINK_NAME })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', REPORT_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noreferrer/)

  const precedesSnowRead = await link.evaluate((element) => {
    const hero = element.parentElement?.querySelector('.depth-hero')
    return Boolean(element.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(precedesSnowRead).toBe(true)
  await expect(brief.getByText('Experimental terrain model. Never a safety or access decision.')).toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps the official operations link a reachable 44px target without overflow', async ({
    page,
  }) => {
    await page.goto('/')
    const brief = page.getByRole('region', { name: 'Mt Hutt snow brief' })
    const link = brief.getByRole('link', { name: LINK_NAME })
    await expect(link).toBeVisible()

    const bounds = await link.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)

    const inspectorWidth = await page.locator('.inspector-scroll').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(inspectorWidth.scrollWidth).toBeLessThanOrEqual(inspectorWidth.clientWidth + 1)
  })
})
