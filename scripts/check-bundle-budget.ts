import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_DIR = resolve('dist')
const HTML_PATH = join(DIST_DIR, 'index.html')

const budgets = {
  initialJsGzip: 120 * 1024,
  mapChunkGzip: 300 * 1024,
  totalCssRaw: 75 * 1024,
}

function formatKiB(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function resolveBuildAsset(reference: string, relativeTo: string) {
  const assetPath = resolve(relativeTo, reference)
  if (assetPath !== DIST_DIR && !assetPath.startsWith(`${DIST_DIR}/`)) {
    throw new Error(`Asset reference escapes dist/: ${reference}`)
  }
  return assetPath
}

function findInitialEntry(html: string) {
  const moduleScript = (html.match(/<script\b[^>]*>/gi) ?? []).find((tag) =>
    /\btype=["']module["']/i.test(tag),
  )
  const source = moduleScript?.match(/\bsrc=["']([^"']+)["']/i)?.[1]
  if (!source) {
    throw new Error('Could not find the initial module script in dist/index.html.')
  }
  return source
}

function findMountainSceneChunk(initialSource: string) {
  const reference = initialSource.match(
    /import\(\s*["'`]([^"'`]*MountainScene-[^"'`]+\.js)["'`]\s*\)/,
  )?.[1]
  if (!reference) {
    throw new Error('Could not find the deferred MountainScene import in the initial JavaScript entry.')
  }
  return reference
}

async function collectCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return collectCssFiles(path)
      return entry.isFile() && entry.name.endsWith('.css') ? [path] : []
    }),
  )
  return files.flat()
}

async function gzipSize(path: string) {
  return gzipSync(await readFile(path), { level: 9 }).byteLength
}

async function main() {
  let html: string
  try {
    html = await readFile(HTML_PATH, 'utf8')
  } catch {
    throw new Error('dist/index.html is missing. Run `npm run build` before `npm run test:bundle`.')
  }

  const initialPath = resolveBuildAsset(findInitialEntry(html), DIST_DIR)
  const initialSource = await readFile(initialPath, 'utf8')
  const mapChunkPath = resolveBuildAsset(findMountainSceneChunk(initialSource), dirname(initialPath))
  const cssFiles = await collectCssFiles(DIST_DIR)

  const [initialJsGzip, mapChunkGzip, cssStats] = await Promise.all([
    gzipSize(initialPath),
    gzipSize(mapChunkPath),
    Promise.all(cssFiles.map((path) => stat(path))),
  ])
  const totalCssRaw = cssStats.reduce((total, css) => total + css.size, 0)

  const measurements = [
    {
      label: 'Initial JavaScript',
      value: initialJsGzip,
      limit: budgets.initialJsGzip,
      unit: 'gzip',
    },
    {
      label: 'Deferred MountainScene',
      value: mapChunkGzip,
      limit: budgets.mapChunkGzip,
      unit: 'gzip',
    },
    {
      label: 'Total CSS',
      value: totalCssRaw,
      limit: budgets.totalCssRaw,
      unit: 'raw',
    },
  ]

  console.log('Production bundle budget')
  for (const measurement of measurements) {
    console.log(
      `  ${measurement.label}: ${formatKiB(measurement.value)} ${measurement.unit} / ${formatKiB(measurement.limit)} limit`,
    )
  }

  const failures = measurements.filter(({ value, limit }) => value > limit)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `Bundle budget exceeded: ${failure.label} is ${formatKiB(failure.value)} ${failure.unit}, ` +
          `${formatKiB(failure.value - failure.limit)} over the ${formatKiB(failure.limit)} limit.`,
      )
    }
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
