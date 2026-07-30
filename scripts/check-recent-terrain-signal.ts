import assert from 'node:assert/strict'
import {
  assessRecentTerrainSignal,
  legacyConfidenceForRecentSignal,
} from '../src/lib/recentTerrainSignal'

const now = '2026-07-31T00:00:00.000Z'

function recentHours(count: number) {
  const nowMs = Date.parse(now)
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(nowMs - (count - index - 1) * 60 * 60 * 1000).toISOString(),
  }))
}

const base = {
  generatedAt: '2026-07-30T23:00:00.000Z',
  now,
  recentHours: recentHours(72),
}

const dryRecentSnowyFuture = assessRecentTerrainSignal({
  ...base,
  recentSnowCm: 0,
})
assert.equal(dryRecentSnowyFuture.strength, 'none')
assert.equal(dryRecentSnowyFuture.dataQuality, 'high')
assert.equal(
  legacyConfidenceForRecentSignal(dryRecentSnowyFuture),
  'low',
  'future snowfall must never elevate a dry recent signal',
)

const snowyRecentDryFuture = assessRecentTerrainSignal({
  ...base,
  recentSnowCm: 9,
})
assert.equal(snowyRecentDryFuture.strength, 'strong')
assert.equal(legacyConfidenceForRecentSignal(snowyRecentDryFuture), 'high')

const trace = assessRecentTerrainSignal({
  ...base,
  recentSnowCm: 0.4,
})
assert.equal(trace.strength, 'trace')
assert.equal(legacyConfidenceForRecentSignal(trace), 'low')

const stale = assessRecentTerrainSignal({
  ...base,
  recentSnowCm: 9,
  generatedAt: '2026-07-29T00:00:00.000Z',
})
assert.equal(stale.strength, 'unknown')
assert.equal(stale.dataQuality, 'low')
assert.equal(legacyConfidenceForRecentSignal(stale), 'low')

const sparse = assessRecentTerrainSignal({
  ...base,
  recentSnowCm: 9,
  recentHours: recentHours(8),
})
assert.equal(sparse.strength, 'unknown')
assert.equal(sparse.dataQuality, 'low')

console.log('Recent terrain signal regression checks passed.')
