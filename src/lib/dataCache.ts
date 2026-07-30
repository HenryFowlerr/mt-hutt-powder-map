const VERIFIED_DATA_CACHE = 'hutt-powder-verified-data-v1'
const CACHED_AT_HEADER = 'x-hutt-powder-cached-at'

type Validator<T> = (value: unknown, path: string) => T

export type DataProvenance =
  | { source: 'network'; cachedAt: null }
  | { source: 'cache'; cachedAt: string }

export type VerifiedJsonResult<T> = {
  value: T
  provenance: DataProvenance
}

function canUseCacheStorage() {
  return typeof window !== 'undefined' && 'caches' in window
}

async function storeVerifiedPayload<T>(url: string, value: T) {
  if (!canUseCacheStorage()) return

  try {
    const cache = await caches.open(VERIFIED_DATA_CACHE)
    await cache.put(
      url,
      new Response(JSON.stringify(value), {
        headers: {
          'content-type': 'application/json',
          [CACHED_AT_HEADER]: new Date().toISOString(),
        },
      }),
    )
  } catch {
    // Storage can be unavailable in private or quota-constrained browser sessions.
    // A successful network response remains usable even when persistence is not.
  }
}

async function readVerifiedPayload<T>(
  url: string,
  path: string,
  validate: Validator<T>,
): Promise<VerifiedJsonResult<T> | null> {
  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(VERIFIED_DATA_CACHE)
    const response = await cache.match(url)
    if (!response) return null

    const cachedAt = response.headers.get(CACHED_AT_HEADER)
    if (!cachedAt || !Number.isFinite(Date.parse(cachedAt))) {
      await cache.delete(url)
      return null
    }

    const value = validate(await response.json(), path)
    return { value, provenance: { source: 'cache', cachedAt } }
  } catch {
    // Never trust an unreadable or no-longer-valid cache entry.
    try {
      const cache = await caches.open(VERIFIED_DATA_CACHE)
      await cache.delete(url)
    } catch {
      // Ignore cleanup failures and preserve the original network error.
    }
    return null
  }
}

/**
 * Loads fresh data first and falls back to the last schema-verified response.
 * The cache is deliberately scoped to data payloads; the app shell remains a
 * normal deploy rather than introducing a service-worker lifecycle.
 */
export async function loadVerifiedJson<T>(
  path: string,
  validate: Validator<T>,
): Promise<VerifiedJsonResult<T>> {
  const url = `${import.meta.env.BASE_URL}${path}`
  let networkError: unknown

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Could not load ${path}: ${response.status}`)
    }

    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new Error(`Data from ${path} is not valid JSON`)
    }

    const verified = validate(value, path)
    await storeVerifiedPayload(url, verified)
    return { value: verified, provenance: { source: 'network', cachedAt: null } }
  } catch (error) {
    networkError = error
  }

  const cached = await readVerifiedPayload(url, path, validate)
  if (cached) return cached
  throw networkError
}
