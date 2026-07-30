import { expect, test } from '@playwright/test'

test('keeps the forecast workspace usable when the deferred map fails', async ({ page }) => {
  await page.route('**/assets/MountainScene-*.js', (route) => route.abort('failed'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Map unavailable' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload map' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mountain information' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()
})
