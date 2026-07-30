import assert from 'node:assert/strict'
import {
  assessForecastConfidence,
  type ForecastConfidenceHour,
  type ForecastConfidenceInput,
} from '../src/lib/forecastConfidence'

const now = '2026-07-31T12:00:00+12:00'
const hourMs = 60 * 60 * 1000
const nowMs = new Date(now).getTime()

function forecastHours(count: number): ForecastConfidenceHour[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(nowMs + (index + 1) * hourMs).toISOString(),
    snowfallCm: index % 9 === 0 ? 0.4 : 0,
  }))
}

const stableInput: ForecastConfidenceInput = {
  forecastSnowCm: 10,
  generatedAt: '2026-07-31T10:00:00+12:00',
  now,
  forecastHours: forecastHours(72),
  forecastTemperatureMaxC: -2,
  forecastFreezingLevelM: 1250,
  forecastRainMm: 0,
  forecastHoursAboveZero: 0,
  forecastAvgWindKph: 18,
  forecastMaxGustKph: 32,
  windDirectionSpreadDeg: 18,
}

const stable = assessForecastConfidence(stableInput)
assert.equal(stable.level, 'high', 'fresh, complete, cold input should be high confidence')
assert(stable.rangeCm, 'valid snowfall must produce a range')
assert(stable.rangeCm.min < 10 && stable.rangeCm.max > 10, 'range must contain the estimate')
assert.equal(stable.hourlyCoverage.ratio, 1, 'complete 72-hour input should report full coverage')

const trace = assessForecastConfidence({
  ...stableInput,
  forecastSnowCm: 0.2,
})
assert.equal(trace.rangeCm?.min, 0, 'trace range should acknowledge that no snow may settle')
assert((trace.rangeCm?.max ?? 0) >= 0.5, 'trace range should preserve a visible upper bound')
assert(trace.score < stable.score, 'trace amounts should carry more relative uncertainty')
assert(trace.drivers.some((driver) => driver.code === 'trace'), 'trace limitation must be explained')

const warmWet = assessForecastConfidence({
  ...stableInput,
  forecastTemperatureMaxC: 3.2,
  forecastFreezingLevelM: 2050,
  forecastRainMm: 10,
  forecastHoursAboveZero: 22,
})
assert(warmWet.score < stable.score, 'warm/wet conditions must reduce confidence')
assert(
  (warmWet.rangeCm?.min ?? 10) < (stable.rangeCm?.min ?? 0),
  'warm/wet conditions should widen the lower side of the range',
)
assert(warmWet.drivers.some((driver) => driver.code === 'phase'), 'phase ambiguity must be explained')

const highWind = assessForecastConfidence({
  ...stableInput,
  forecastAvgWindKph: 52,
  forecastMaxGustKph: 94,
  windDirectionSpreadDeg: 112,
})
assert(highWind.score < stable.score, 'high, shifting wind must reduce confidence')
assert(
  (highWind.rangeCm?.max ?? 0) > (stable.rangeCm?.max ?? Infinity),
  'high wind should widen the accumulation range',
)
assert(highWind.drivers.some((driver) => driver.code === 'wind'), 'wind limitation must be explained')

const stale = assessForecastConfidence({
  ...stableInput,
  generatedAt: '2026-07-29T08:00:00+12:00',
})
assert.equal(stale.level, 'low', 'a forecast more than a day old must be low confidence')
assert(stale.drivers[0]?.code === 'stale', 'staleness should be the leading driver')

const sparse = assessForecastConfidence({
  ...stableInput,
  forecastHours: forecastHours(8),
  forecastTemperatureMaxC: undefined,
  forecastFreezingLevelM: undefined,
  forecastRainMm: undefined,
  forecastHoursAboveZero: undefined,
  forecastAvgWindKph: undefined,
  forecastMaxGustKph: undefined,
  windDirectionSpreadDeg: undefined,
})
assert.equal(sparse.level, 'low', 'sparse input must be low confidence')
assert(sparse.drivers.some((driver) => driver.code === 'coverage'), 'sparse coverage must be explained')
assert(sparse.drivers.some((driver) => driver.code === 'missing'), 'missing inputs must be explained')

const missingSnow = assessForecastConfidence({
  ...stableInput,
  forecastSnowCm: undefined,
})
assert.equal(missingSnow.score, 0, 'missing snowfall estimate cannot carry confidence')
assert.equal(missingSnow.rangeCm, null, 'missing snowfall estimate cannot produce a range')

const ensemble = assessForecastConfidence({
  ...stableInput,
  ensembleSnowfallCm: {
    p10: 6.4,
    p50: 9.1,
    p90: 14.8,
    memberCount: 31,
  },
})
assert.equal(ensemble.method, 'ensemble-relative range', 'ensemble quantiles must override heuristic range')
assert.equal(ensemble.estimateCm, 10, 'the deterministic terrain estimate must remain the centre')
assert.deepEqual(ensemble.rangeCm, { min: 7, max: 16 }, 'ensemble spread must scale around the terrain estimate')
assert.equal(ensemble.ensembleMembers, 31, 'ensemble member count must be retained')

const liveLikeDisagreement = assessForecastConfidence({
  ...stableInput,
  forecastSnowCm: 7,
  ensembleSnowfallCm: {
    p10: 0.4,
    p50: 1.1,
    p90: 2.1,
    memberCount: 31,
  },
})
assert.equal(liveLikeDisagreement.estimateCm, 7, 'ensemble data must not replace the map estimate')
assert.deepEqual(
  liveLikeDisagreement.rangeCm,
  { min: 3, max: 13 },
  'ensemble relative spread must remain anchored to the map estimate',
)

const ensembleSpread = assessForecastConfidence({
  ...stableInput,
  ensembleSnowfallCm: {
    p10ToP90Spread: 8,
    memberCount: 31,
  },
})
assert.equal(ensembleSpread.method, 'ensemble spread', 'retained ensemble spread must override heuristic range')
assert.deepEqual(ensembleSpread.rangeCm, { min: 6, max: 14 }, 'ensemble spread must centre on the estimate')

const invalidEnsemble = assessForecastConfidence({
  ...stableInput,
  ensembleSnowfallCm: {
    p10: 15,
    p50: 9,
    p90: 6,
    memberCount: 31,
  },
})
assert.equal(invalidEnsemble.method, 'single-model heuristic', 'invalid quantiles must fail safely')

assert.deepEqual(
  assessForecastConfidence(stableInput),
  stable,
  'identical inputs and an explicit current time must be deterministic',
)

console.log(
  [
    'Forecast confidence checks passed',
    `stable: ${stable.rangeCm?.min}–${stable.rangeCm?.max} cm · ${stable.score}/100 ${stable.level}`,
    `trace: ${trace.rangeCm?.min}–${trace.rangeCm?.max} cm · ${trace.score}/100 ${trace.level}`,
    `warm/wet: ${warmWet.rangeCm?.min}–${warmWet.rangeCm?.max} cm · ${warmWet.score}/100 ${warmWet.level}`,
    `high wind: ${highWind.rangeCm?.min}–${highWind.rangeCm?.max} cm · ${highWind.score}/100 ${highWind.level}`,
    `stale: ${stale.score}/100 ${stale.level}`,
    `sparse: ${sparse.score}/100 ${sparse.level}`,
    `ensemble: ${ensemble.rangeCm?.min}–${ensemble.rangeCm?.max} cm · ${ensemble.score}/100 ${ensemble.level}`,
  ].join('\n'),
)
