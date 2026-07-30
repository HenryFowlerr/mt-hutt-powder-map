import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Interactive Mt Hutt terrain map' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mountain information' })).toBeVisible()
})

test('switches among the three inspector views', async ({ page }) => {
  const inspector = page.getByRole('navigation', { name: 'Mountain information' })
  const brief = inspector.getByRole('button', { name: 'Brief' })
  const outlook = inspector.getByRole('button', { name: 'Outlook' })
  const layers = inspector.getByRole('button', { name: 'Layers' })

  await expect(brief).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Mt Hutt snow brief' })).toBeVisible()

  await outlook.click()
  await expect(outlook).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: '14 day forecast' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '14-day outlook' })).toBeVisible()

  await layers.click()
  await expect(layers).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Map layers' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What the map shows' })).toBeVisible()
})

test('layer switches expose and update their pressed state', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Mountain information' })
    .getByRole('button', { name: 'Layers' })
    .click()

  const trails = page.getByRole('button', { name: /Trails & lifts/ })
  const snowfall = page.getByRole('button', { name: /Snowfall/ })

  await expect(trails).toHaveAttribute('aria-pressed', 'true')
  await expect(snowfall).toHaveAttribute('aria-pressed', 'false')

  await trails.click()
  await snowfall.click()

  await expect(trails).toHaveAttribute('aria-pressed', 'false')
  await expect(snowfall).toHaveAttribute('aria-pressed', 'true')
})

test('forecast days expand and collapse with accessible state', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Mountain information' })
    .getByRole('button', { name: 'Outlook' })
    .click()

  const today = page.getByRole('button', { name: /^Today,/ })
  await expect(today).toHaveAttribute('aria-expanded', 'false')

  await today.click()
  await expect(today).toHaveAttribute('aria-expanded', 'true')

  const day = page.getByRole('listitem').filter({ has: today })
  await expect(day.getByText('Snow', { exact: true })).toBeVisible()
  await expect(day.getByText('Freezing lvl', { exact: true })).toBeVisible()

  await today.click()
  await expect(today).toHaveAttribute('aria-expanded', 'false')
  await expect(day.getByText('Freezing lvl', { exact: true })).toHaveCount(0)
})

test('map actions retain clear labels as view state changes', async ({ page }) => {
  const controls = page.getByRole('navigation', { name: 'Map view controls' })
  const viewToggle = controls.getByRole('button', { name: 'Switch to topographic view' })
  const reset = controls.getByRole('button', { name: 'Reset map view' })

  await expect(viewToggle).toBeVisible()
  await expect(reset).toBeVisible()

  await viewToggle.click()
  await expect(controls.getByRole('button', { name: 'Switch to perspective view' })).toBeVisible()
  await reset.click()
})
