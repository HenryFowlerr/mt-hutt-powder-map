import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('keeps the map first and the inspector directly below it on mobile', async ({ page }) => {
  await page.goto('/')

  const map = page.getByRole('region', { name: 'Interactive Mt Hutt terrain map' })
  const inspector = page.getByRole('complementary', { name: 'Mountain information' })
  const inspectorNav = page.getByRole('navigation', { name: 'Mountain information' })

  await expect(map).toBeVisible()
  await expect(inspector).toBeVisible()

  const mapBox = await map.boundingBox()
  const inspectorBox = await inspector.boundingBox()
  expect(mapBox).not.toBeNull()
  expect(inspectorBox).not.toBeNull()
  expect(inspectorBox!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height - 1)
  expect(inspectorBox!.width).toBeCloseTo(mapBox!.width, 0)

  await expect(inspectorNav.getByRole('button', { name: 'Brief' })).toBeVisible()
  await expect(inspectorNav.getByRole('button', { name: 'Outlook' })).toBeVisible()
  await expect(inspectorNav.getByRole('button', { name: 'Layers' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Map view controls' }).getByRole('button', {
      name: 'Reset map view',
    }),
  ).toBeVisible()
})
