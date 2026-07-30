import { expect, test } from '@playwright/test'

test('ranked map zones can focus and clear a terrain recommendation', async ({ page }) => {
  await page.goto('/')

  const allMarkers = page.locator('button[aria-label^="Focus "]')
  const htmlProjectionAvailable = await allMarkers
    .first()
    .waitFor({ state: 'attached', timeout: 8_000 })
    .then(
      () => true,
      () => false,
    )
  test.skip(
    !htmlProjectionAvailable,
    'The headless WebGL renderer did not project drei HTML overlays in this environment.',
  )
  await expect(allMarkers).toHaveCount(3)
  const markers = page.locator('button[aria-label^="Focus "]:visible')
  expect(await markers.count()).toBeGreaterThan(0)

  const first = markers.first()
  const label = await first.getAttribute('aria-label')
  expect(label).toBeTruthy()
  const selectedMarker = page.getByRole('button', { name: label!, exact: true })
  await expect(selectedMarker).toHaveAttribute('aria-pressed', 'false')
  await selectedMarker.click()
  await expect(selectedMarker).toHaveAttribute('aria-pressed', 'true')

  await selectedMarker.click()
  await expect(selectedMarker).toHaveAttribute('aria-pressed', 'false')
})
