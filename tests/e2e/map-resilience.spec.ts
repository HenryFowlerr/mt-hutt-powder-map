import { expect, test } from '@playwright/test'

test('keeps the forecast workspace usable when the deferred map fails', async ({ page }) => {
  await page.route('**/assets/MountainScene-*.js', (route) => route.abort('failed'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Map unavailable' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload map' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mountain information' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
})

test('falls back without losing the brief when the WebGL context is lost', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.map-stage canvas[data-context-guard="ready"]')
  await expect(canvas).toBeVisible()
  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  })

  await expect(page.getByRole('heading', { name: 'Map unavailable' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
})
