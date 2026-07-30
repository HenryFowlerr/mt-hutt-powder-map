/**
 * A deterministic assessment of the app's 72-hour snowfall confidence.
 *
 * When ensemble quantiles exist, their relative spread is anchored to the
 * terrain model's displayed peak. Without them, the range is a transparent
 * heuristic that widens for stale or incomplete data and for precipitation
 * type or wind-loading ambiguity. Neither path claims local calibration.
 */

export type ForecastConfidenceLevel = 'low' | 'medium' | 'high'

export type ForecastConfidenceHour = {
  time: string
  snowfallCm: number
}

export type ForecastConfidenceInput = {
  forecastSnowCm?: number | null
  ensembleSnowfallCm?: {
    p10?: number | null
    p50?: number | null
    p90?: number | null
    /** Use when only the p10-to-p90 spread has been retained upstream. */
    p10ToP90Spread?: number | null
    memberCount?: number | null
  }
  generatedAt?: string | number | Date | null
  now?: string | number | Date
  forecastHours?: readonly ForecastConfidenceHour[]
  expectedHorizonHours?: number
  forecastTemperatureMaxC?: number | null
  forecastFreezingLevelM?: number | null
  forecastRainMm?: number | null
  forecastHoursAboveZero?: number | null
  forecastAvgWindKph?: number | null
  forecastMaxGustKph?: number | null
  windDirectionSpreadDeg?: number | null
}

export type ForecastConfidenceDriver = {
  code:
    | 'fresh'
    | 'stale'
    | 'coverage'
    | 'missing'
    | 'trace'
    | 'phase'
    | 'wind'
    | 'wind-shift'
    | 'ensemble'
  effect: 'supports' | 'limits'
  message: string
}

export type ForecastConfidenceAssessment = {
  estimateCm: number | null
  rangeCm: {
    min: number
    max: number
  } | null
  score: number
  level: ForecastConfidenceLevel
  drivers: ForecastConfidenceDriver[]
  dataAgeHours: number | null
  hourlyCoverage: {
    available: number
    expected: number
    ratio: number | null
  }
  ensembleMembers: number | null
  method: 'single-model heuristic' | 'ensemble-relative range' | 'ensemble spread'
  rangeBasis:
    | 'Indicative range from feed quality and weather ambiguity; not an ensemble probability interval.'
    | 'Ensemble p10–p90 spread scaled so its median matches the deterministic terrain estimate.'
    | 'Approximate p10–p90 ensemble spread centred on the available snowfall estimate.'
}

type RankedDriver = ForecastConfidenceDriver & {
  priority: number
}

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_HORIZON_HOURS = 72

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function timeMs(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function roundedCentimetres(value: number) {
  const safe = Math.max(0, value)
  if (safe < 2) return Math.round(safe * 10) / 10
  return Math.round(safe)
}

function levelForScore(score: number): ForecastConfidenceLevel {
  if (score >= 74) return 'high'
  if (score >= 48) return 'medium'
  return 'low'
}

function validForecastHourCount(
  hours: readonly ForecastConfidenceHour[],
  nowMs: number,
  horizonHours: number,
) {
  const endMs = nowMs + horizonHours * HOUR_MS
  const uniqueHours = new Set<number>()

  for (const hour of hours) {
    const hourMs = timeMs(hour.time)
    if (
      hourMs === null ||
      hourMs < nowMs - HOUR_MS ||
      hourMs > endMs ||
      !finite(hour.snowfallCm)
    ) {
      continue
    }
    uniqueHours.add(Math.round(hourMs / HOUR_MS))
  }

  return uniqueHours.size
}

export function assessForecastConfidence(
  input: ForecastConfidenceInput,
): ForecastConfidenceAssessment {
  const nowMs = timeMs(input.now) ?? Date.now()
  const generatedMs = timeMs(input.generatedAt)
  const horizonHours = Math.round(
    clamp(input.expectedHorizonHours ?? DEFAULT_HORIZON_HOURS, 1, 240),
  )
  const drivers: RankedDriver[] = []
  const addDriver = (
    driver: ForecastConfidenceDriver,
    priority: number,
  ) => {
    if (!drivers.some((existing) => existing.code === driver.code)) {
      drivers.push({ ...driver, priority })
    }
  }

  let score = 86
  let relativeWidth = 0.2

  const dataAgeHours =
    generatedMs === null ? null : Math.max(0, (nowMs - generatedMs) / HOUR_MS)

  if (dataAgeHours === null) {
    score -= 16
    relativeWidth += 0.14
    addDriver(
      {
        code: 'stale',
        effect: 'limits',
        message: 'Update time is missing, so forecast freshness cannot be verified.',
      },
      82,
    )
  } else if (dataAgeHours <= 4) {
    addDriver(
      {
        code: 'fresh',
        effect: 'supports',
        message: 'Forecast source updated within the last 4 hours.',
      },
      28,
    )
  } else if (dataAgeHours <= 8) {
    score -= 5
    relativeWidth += 0.05
    addDriver(
      {
        code: 'stale',
        effect: 'limits',
        message: `Forecast is ${Math.round(dataAgeHours)} hours old.`,
      },
      54,
    )
  } else if (dataAgeHours <= 16) {
    score -= 12
    relativeWidth += 0.12
    addDriver(
      {
        code: 'stale',
        effect: 'limits',
        message: `Forecast is ${Math.round(dataAgeHours)} hours old and should be refreshed.`,
      },
      72,
    )
  } else if (dataAgeHours <= 24) {
    score -= 22
    relativeWidth += 0.22
    addDriver(
      {
        code: 'stale',
        effect: 'limits',
        message: `Forecast is ${Math.round(dataAgeHours)} hours old; conditions may have shifted.`,
      },
      88,
    )
  } else {
    score -= 42
    relativeWidth += 0.42
    addDriver(
      {
        code: 'stale',
        effect: 'limits',
        message: `Forecast is ${Math.round(dataAgeHours)} hours old and is considered stale.`,
      },
      100,
    )
  }

  let availableHours = 0
  let coverageRatio: number | null = null
  if (input.forecastHours) {
    availableHours = validForecastHourCount(input.forecastHours, nowMs, horizonHours)
    coverageRatio = clamp(availableHours / horizonHours, 0, 1)

    if (coverageRatio >= 0.8) {
      addDriver(
        {
          code: 'coverage',
          effect: 'supports',
          message: `${availableHours} of ${horizonHours} forecast hours are populated.`,
        },
        26,
      )
    } else if (coverageRatio >= 0.5) {
      score -= 8
      relativeWidth += 0.1
      addDriver(
        {
          code: 'coverage',
          effect: 'limits',
          message: `Only ${availableHours} of ${horizonHours} forecast hours are populated.`,
        },
        62,
      )
    } else if (coverageRatio >= 0.25) {
      score -= 18
      relativeWidth += 0.2
      addDriver(
        {
          code: 'coverage',
          effect: 'limits',
          message: `Hourly coverage is sparse (${availableHours} of ${horizonHours} hours).`,
        },
        84,
      )
    } else {
      score -= 30
      relativeWidth += 0.35
      addDriver(
        {
          code: 'coverage',
          effect: 'limits',
          message: `Hourly coverage is insufficient (${availableHours} of ${horizonHours} hours).`,
        },
        98,
      )
    }
  } else {
    score -= 8
    relativeWidth += 0.08
    addDriver(
      {
        code: 'coverage',
        effect: 'limits',
        message: 'Hourly coverage was not supplied; assessment uses summary values only.',
      },
      58,
    )
  }

  const supportingInputs = [
    input.forecastTemperatureMaxC,
    input.forecastFreezingLevelM,
    input.forecastRainMm,
    input.forecastHoursAboveZero,
    input.forecastAvgWindKph,
    input.forecastMaxGustKph,
    input.windDirectionSpreadDeg,
  ]
  const missingInputs = supportingInputs.filter((value) => !finite(value)).length
  if (missingInputs > 0) {
    score -= Math.min(18, missingInputs * 3)
    relativeWidth += Math.min(0.18, missingInputs * 0.025)
    addDriver(
      {
        code: 'missing',
        effect: 'limits',
        message: `${missingInputs} supporting weather ${missingInputs === 1 ? 'input is' : 'inputs are'} missing.`,
      },
      52 + missingInputs * 4,
    )
  }

  const ensemble = input.ensembleSnowfallCm
  const hasValidEnsembleQuantiles =
    finite(ensemble?.p10) &&
    finite(ensemble?.p50) &&
    finite(ensemble?.p90) &&
    ensemble.p10 >= 0 &&
    ensemble.p10 <= ensemble.p50 &&
    ensemble.p50 <= ensemble.p90
  const hasEnsembleSpread =
    !hasValidEnsembleQuantiles &&
    finite(ensemble?.p10ToP90Spread) &&
    ensemble.p10ToP90Spread >= 0 &&
    finite(input.forecastSnowCm)
  const ensembleMembers =
    finite(ensemble?.memberCount) && ensemble.memberCount > 0
      ? Math.round(ensemble.memberCount)
      : null
  const deterministicEstimateCm = finite(input.forecastSnowCm)
    ? Math.max(0, input.forecastSnowCm)
    : null
  const canAnchorEnsemble =
    hasValidEnsembleQuantiles &&
    deterministicEstimateCm !== null &&
    deterministicEstimateCm > 0.1 &&
    (ensemble?.p50 ?? 0) >= 0.2
  const useRawEnsemble =
    hasValidEnsembleQuantiles && deterministicEstimateCm === null
  const hasEnsembleQuantiles = canAnchorEnsemble || useRawEnsemble
  const ensembleScale = canAnchorEnsemble
    ? deterministicEstimateCm / (ensemble?.p50 ?? 1)
    : 1
  const estimateCm =
    deterministicEstimateCm ??
    (useRawEnsemble ? Math.max(0, ensemble?.p50 ?? 0) : null)
  if (estimateCm === null) {
    score = 0
    addDriver(
      {
        code: 'missing',
        effect: 'limits',
        message: 'No valid snowfall estimate is available.',
      },
      110,
    )
  } else if (estimateCm > 0 && estimateCm < 1) {
    score -= 14
    relativeWidth += 0.28
    addDriver(
      {
        code: 'trace',
        effect: 'limits',
        message: 'Trace snowfall is close to the feed’s practical resolution.',
      },
      78,
    )
  } else if (estimateCm < 3) {
    score -= 5
    relativeWidth += 0.12
    addDriver(
      {
        code: 'trace',
        effect: 'limits',
        message: 'A small snowfall signal has high relative uncertainty.',
      },
      52,
    )
  }

  if (hasValidEnsembleQuantiles && !hasEnsembleQuantiles) {
    score -= 12
    addDriver(
      {
        code: 'ensemble',
        effect: 'limits',
        message: 'Ensemble and deterministic snowfall signals are too far apart to combine reliably.',
      },
      84,
    )
  } else if (hasEnsembleQuantiles || hasEnsembleSpread) {
    const low = hasEnsembleQuantiles
      ? (ensemble?.p10 ?? 0) * ensembleScale
      : Math.max(0, (estimateCm ?? 0) - (ensemble?.p10ToP90Spread ?? 0) / 2)
    const high = hasEnsembleQuantiles
      ? (ensemble?.p90 ?? 0) * ensembleScale
      : (estimateCm ?? 0) + (ensemble?.p10ToP90Spread ?? 0) / 2
    const spreadRatio = (high - low) / Math.max(1, estimateCm ?? 0)

    if (ensembleMembers !== null && ensembleMembers < 10) {
      score -= 8
      addDriver(
        {
          code: 'ensemble',
          effect: 'limits',
          message: `Ensemble range uses only ${ensembleMembers} members.`,
        },
        64,
      )
    } else if (spreadRatio <= 0.5) {
      score += 4
      addDriver(
        {
          code: 'ensemble',
          effect: 'supports',
          message: `Ensemble members cluster within ${roundedCentimetres(high - low)} cm.`,
        },
        44,
      )
    } else {
      const spreadPenalty = Math.round(clamp((spreadRatio - 0.5) * 14, 4, 24))
      score -= spreadPenalty
      addDriver(
        {
          code: 'ensemble',
          effect: 'limits',
          message: `Ensemble members span ${roundedCentimetres(high - low)} cm, indicating meaningful model spread.`,
        },
        70 + spreadPenalty,
      )
    }
  }

  const temperatureAmbiguity = finite(input.forecastTemperatureMaxC)
    ? clamp((input.forecastTemperatureMaxC + 0.5) / 4, 0, 1)
    : 0
  const freezingLevelAmbiguity = finite(input.forecastFreezingLevelM)
    ? clamp((input.forecastFreezingLevelM - 1500) / 550, 0, 1)
    : 0
  const rainAmbiguity = finite(input.forecastRainMm)
    ? clamp(input.forecastRainMm / 8, 0, 1)
    : 0
  const thawAmbiguity = finite(input.forecastHoursAboveZero)
    ? clamp(input.forecastHoursAboveZero / 24, 0, 1)
    : 0
  const phaseAmbiguity = clamp(
    Math.max(temperatureAmbiguity, freezingLevelAmbiguity, rainAmbiguity) * 0.75 +
      thawAmbiguity * 0.25,
    0,
    1,
  )

  if (phaseAmbiguity >= 0.2) {
    score -= Math.round(20 * phaseAmbiguity)
    relativeWidth += 0.25 * phaseAmbiguity
    const phaseDetails: string[] = []
    if (finite(input.forecastTemperatureMaxC) && input.forecastTemperatureMaxC > 0) {
      phaseDetails.push(`${input.forecastTemperatureMaxC.toFixed(1)}°C maximum`)
    }
    if (finite(input.forecastFreezingLevelM) && input.forecastFreezingLevelM > 1600) {
      phaseDetails.push(`${Math.round(input.forecastFreezingLevelM)} m freezing level`)
    }
    if (finite(input.forecastRainMm) && input.forecastRainMm >= 1) {
      phaseDetails.push(`${input.forecastRainMm.toFixed(1)} mm rain`)
    }
    addDriver(
      {
        code: 'phase',
        effect: 'limits',
        message: `Mixed snow/rain risk increases uncertainty${phaseDetails.length ? ` (${phaseDetails.slice(0, 2).join(', ')})` : ''}.`,
      },
      60 + Math.round(phaseAmbiguity * 36),
    )
  }

  const gustRisk = finite(input.forecastMaxGustKph)
    ? clamp((input.forecastMaxGustKph - 35) / 55, 0, 1)
    : 0
  const meanWindRisk = finite(input.forecastAvgWindKph)
    ? clamp((input.forecastAvgWindKph - 25) / 35, 0, 1)
    : 0
  const windRisk = Math.max(gustRisk, meanWindRisk)
  if (windRisk >= 0.15) {
    score -= Math.round(14 * windRisk)
    relativeWidth += 0.18 * windRisk
    const windDescription = finite(input.forecastMaxGustKph)
      ? `gusts near ${Math.round(input.forecastMaxGustKph)} km/h`
      : `mean wind near ${Math.round(input.forecastAvgWindKph ?? 0)} km/h`
    addDriver(
      {
        code: 'wind',
        effect: 'limits',
        message: `Strong wind redistribution (${windDescription}) reduces local-depth certainty.`,
      },
      54 + Math.round(windRisk * 38),
    )
  }

  const directionRisk = finite(input.windDirectionSpreadDeg)
    ? clamp((input.windDirectionSpreadDeg - 25) / 80, 0, 1)
    : 0
  if (directionRisk >= 0.15) {
    score -= Math.round(12 * directionRisk)
    relativeWidth += 0.14 * directionRisk
    addDriver(
      {
        code: 'wind-shift',
        effect: 'limits',
        message: `Wind direction varies by about ${Math.round(input.windDirectionSpreadDeg ?? 0)}°, weakening terrain-loading certainty.`,
      },
      52 + Math.round(directionRisk * 36),
    )
  }

  const finalScore = Math.round(clamp(score, 0, 92))
  const baseResolutionCm =
    estimateCm === null ? 0 : estimateCm < 2 ? 0.35 : estimateCm < 10 ? 0.5 : 0.7
  const widthCm =
    estimateCm === null ? null : baseResolutionCm + estimateCm * relativeWidth
  const heuristicRangeCm =
    estimateCm === null || widthCm === null
      ? null
      : {
          min: roundedCentimetres(
            estimateCm - widthCm * (1 + phaseAmbiguity * 0.35),
          ),
          max: roundedCentimetres(
            estimateCm + widthCm * (1 - phaseAmbiguity * 0.08),
          ),
        }
  const rangeCm = hasEnsembleQuantiles
    ? {
        min: roundedCentimetres((ensemble?.p10 ?? 0) * ensembleScale),
        max: roundedCentimetres((ensemble?.p90 ?? 0) * ensembleScale),
      }
    : hasEnsembleSpread && estimateCm !== null
      ? {
          min: roundedCentimetres(
            estimateCm - (ensemble?.p10ToP90Spread ?? 0) / 2,
          ),
          max: roundedCentimetres(
            estimateCm + (ensemble?.p10ToP90Spread ?? 0) / 2,
          ),
        }
      : heuristicRangeCm

  return {
    estimateCm: estimateCm === null ? null : roundedCentimetres(estimateCm),
    rangeCm,
    score: finalScore,
    level: levelForScore(finalScore),
    drivers: drivers
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4)
      .map(({ priority: _priority, ...driver }) => driver),
    dataAgeHours:
      dataAgeHours === null ? null : Math.round(dataAgeHours * 10) / 10,
    hourlyCoverage: {
      available: availableHours,
      expected: horizonHours,
      ratio: coverageRatio === null ? null : Math.round(coverageRatio * 100) / 100,
    },
    ensembleMembers,
    method: hasEnsembleQuantiles
      ? 'ensemble-relative range'
      : hasEnsembleSpread
        ? 'ensemble spread'
        : 'single-model heuristic',
    rangeBasis: hasEnsembleQuantiles
      ? 'Ensemble p10–p90 spread scaled so its median matches the deterministic terrain estimate.'
      : hasEnsembleSpread
        ? 'Approximate p10–p90 ensemble spread centred on the available snowfall estimate.'
        : 'Indicative range from feed quality and weather ambiguity; not an ensemble probability interval.',
  }
}
