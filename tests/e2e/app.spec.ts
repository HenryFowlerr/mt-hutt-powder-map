import { expect, test, type Page } from '@playwright/test'

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

async function hasCameraRuntime(page: Page) {
  return page
    .locator('.map-stage canvas[data-context-guard="ready"]')
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(
      () => true,
      () => false,
    )
}

test('compass keeps a clear accessible 44px orientation target', async ({ page }) => {
  const compass = page
    .getByRole('navigation', { name: 'Map view controls' })
    .getByRole('button', { name: /Reset map orientation to north/ })

  await expect(compass).toBeVisible()
  await expect(compass).toHaveAttribute('aria-label', /Reset map orientation to north/)
  const target = await compass.boundingBox()
  expect(target).not.toBeNull()
  expect(target!.width).toBeGreaterThanOrEqual(44)
  expect(target!.height).toBeGreaterThanOrEqual(44)
})

test('reduces map workload only while an orbit gesture is active', async ({ page }) => {
  const cameraRuntimeReady = await hasCameraRuntime(page)
  test.skip(
    !cameraRuntimeReady,
    'The Linux headless renderer did not establish the camera runtime.',
  )

  const canvas = page.locator('.map-stage canvas[data-context-guard="ready"]')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()

  const startX = bounds!.x + bounds!.width * 0.48
  const startY = bounds!.y + bounds!.height * 0.5
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 120, startY + 35, { steps: 4 })

  await expect(canvas).toHaveAttribute('data-map-interacting', 'true')
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const mapCanvas = element as HTMLCanvasElement
        return Math.round((mapCanvas.width / mapCanvas.clientWidth) * 10) / 10
      }),
    )
    .toBeLessThanOrEqual(1)

  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-map-interacting', 'false')
})

test('compass reports the perspective camera bearing and resets north', async ({ page }) => {
  const cameraRuntimeReady = await hasCameraRuntime(page)
  test.skip(
    !cameraRuntimeReady,
    'The Linux headless renderer did not establish the camera runtime.',
  )

  const controls = page.getByRole('navigation', { name: 'Map view controls' })
  const compass = controls.getByRole('button', {
    name: /Reset map orientation to north/,
  })

  await expect(compass).toBeVisible()
  await expect
    .poll(async () => Number(await compass.getAttribute('data-bearing')))
    .toBeGreaterThan(1)
  await expect(compass).toHaveAttribute('data-orientation', 'rotated')
  await expect(compass).toHaveAttribute('aria-label', /Current bearing \d+ degrees/)

  await compass.click()
  await expect(compass).toHaveAttribute('data-bearing', '0')
  await expect(compass).toHaveAttribute('data-orientation', 'north-up')
  await expect(compass).toHaveAttribute('aria-label', /Currently north up/)
})

test('compass reports the topographic camera bearing and resets north', async ({ page }) => {
  const cameraRuntimeReady = await hasCameraRuntime(page)
  test.skip(
    !cameraRuntimeReady,
    'The Linux headless renderer did not establish the camera runtime.',
  )

  const controls = page.getByRole('navigation', { name: 'Map view controls' })
  const compass = controls.getByRole('button', {
    name: /Reset map orientation to north/,
  })
  const viewToggle = controls.getByRole('button', {
    name: 'Switch to topographic view',
  })
  await viewToggle.click()
  await expect(
    controls.getByRole('button', { name: 'Switch to perspective view' }),
  ).toBeVisible()
  await expect
    .poll(async () => Number(await compass.getAttribute('data-bearing')))
    .toBeGreaterThan(1)
  await expect(compass).toHaveAttribute('data-orientation', 'rotated')

  await compass.click()
  await expect(compass).toHaveAttribute('data-bearing', '0')
  await expect(compass).toHaveAttribute('data-orientation', 'north-up')
  await expect(compass).toHaveAttribute('aria-label', /Currently north up/)
})
