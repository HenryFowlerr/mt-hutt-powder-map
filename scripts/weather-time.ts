const SECOND_MS = 1000

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>()

function dateKeyFormatter(timeZone: string) {
  let formatter = dateKeyFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dateKeyFormatters.set(timeZone, formatter)
  }
  return formatter
}

/**
 * Open-Meteo documents `timeformat=unixtime` values as GMT+0 epoch seconds.
 * Keeping this conversion explicit prevents the host machine's timezone from
 * shifting Mt Hutt's recent and forecast windows.
 */
export function openMeteoUnixMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Expected an Open-Meteo UNIX timestamp, received ${String(value)}`)
  }
  return value * SECOND_MS
}

export function openMeteoUnixIso(value: unknown) {
  return new Date(openMeteoUnixMs(value)).toISOString()
}

export function dateKeyAtZone(value: unknown, timeZone = 'Pacific/Auckland') {
  return dateKeyFormatter(timeZone).format(openMeteoUnixMs(value))
}

