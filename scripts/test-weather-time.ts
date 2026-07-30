import assert from 'node:assert/strict'
import { dateKeyAtZone, openMeteoUnixIso, openMeteoUnixMs } from './weather-time'

// 2026-07-30 12:00 UTC is midnight on 31 July at Mt Hutt. The conversion
// must be identical on a UTC CI runner and a developer machine in New Zealand.
const mtHuttMidnight = 1785412800
assert.equal(openMeteoUnixMs(mtHuttMidnight), 1785412800000)
assert.equal(openMeteoUnixIso(mtHuttMidnight), '2026-07-30T12:00:00.000Z')
assert.equal(dateKeyAtZone(mtHuttMidnight), '2026-07-31')

const now = Date.parse('2026-07-30T12:03:00.000Z')
const hourly = Array.from(
  { length: 169 },
  (_, index) => mtHuttMidnight - 72 * 60 * 60 + index * 60 * 60,
)
const recent = hourly.filter((time) => {
  const milliseconds = openMeteoUnixMs(time)
  return milliseconds <= now && milliseconds >= now - 72 * 60 * 60 * 1000
})
const forecast = hourly.filter((time) => {
  const milliseconds = openMeteoUnixMs(time)
  return milliseconds > now && milliseconds <= now + 72 * 60 * 60 * 1000
})

assert.equal(recent.length, 72, 'recent window must contain the preceding 72 complete hourly values')
assert.equal(forecast.length, 72, 'forecast window must contain the next 72 hourly values')
assert.throws(() => openMeteoUnixMs('2026-07-31T00:00'), /UNIX timestamp/)
assert.throws(() => openMeteoUnixMs(Number.NaN), /UNIX timestamp/)

console.log('Weather timestamp regression checks passed.')
