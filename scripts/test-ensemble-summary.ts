import assert from 'node:assert/strict'
import { summariseGfsEnsemble } from './ensemble-summary'

const time = ['2026-07-31T00:00', '2026-07-31T01:00']
const generatedAt = '2026-07-30T12:00:00.000Z'

const summary = summariseGfsEnsemble(
  {
    hourly: {
      time,
      snowfall: [0, 0],
      snowfall_member01: [0.5, 0.5],
      snowfall_member02: [2, 3],
      snowfall_member03: [5, 5],
    },
  },
  generatedAt,
)

assert(summary)
assert.equal(summary.memberCount, 4)
assert.deepEqual(summary.snowfallCm, { p10: 0.3, p50: 3, p90: 8.5, mean: 4 })
assert.deepEqual(summary.probabilityPct, {
  atLeast1Cm: 75,
  atLeast5Cm: 50,
  atLeast10Cm: 25,
})
assert.equal(summary.windowHours, 2)
assert.equal(summary.generatedAt, generatedAt)

const withMalformedMembers = summariseGfsEnsemble({
  hourly: {
    time,
    snowfall: [0, 0],
    snowfall_member01: [null, 4],
    snowfall_member02: [1],
    snowfall_member03: [Number.NaN, 2],
    snowfall_member04: [1, 2],
  },
})
assert(withMalformedMembers)
assert.equal(withMalformedMembers.memberCount, 2)
assert.equal(withMalformedMembers.snowfallCm.mean, 1.5)

assert.equal(
  summariseGfsEnsemble({
    hourly: {
      time,
      snowfall: [null, null],
      snowfall_member01: [-1, 0],
    },
  }),
  undefined,
)
assert.equal(summariseGfsEnsemble({ hourly: { time: ['invalid'], snowfall: [1] } }), undefined)

console.log('Ensemble summary regression checks passed.')
