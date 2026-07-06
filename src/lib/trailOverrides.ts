import type { TrailCollection, TrailFeature } from '../types'

// Corrections to raw OSM trail data, verified against the official
// Mt Hutt 2026 trail map PDF: proper apostrophes, official difficulty
// colours, and terrain-park flags. Keyed by the OSM name.

type Override = {
  displayName?: string
  difficulty?: TrailFeature['properties']['difficulty']
  park?: boolean
}

const OVERRIDES: Record<string, Override> = {
  // Names verified against the official map.
  'Hubers Run': { displayName: "Huber's Run", difficulty: 'advanced' },
  'Bobs Knob': { displayName: "Bob's Knob", difficulty: 'expert' },
  'Jans Face': { displayName: "Jan's Face", difficulty: 'expert' },
  // The official 2026 map has Free Dive (black) and No Dive (blue); this
  // OSM line runs from the summit ridge, matching Free Dive.
  'Low Dive': { displayName: 'Free Dive', difficulty: 'expert' },

  // Official difficulty colours where OSM disagrees with the PDF.
  Fascination: { difficulty: 'advanced' },
  International: { difficulty: 'advanced' },
  'Virgin Mile': { difficulty: 'intermediate' },
  'Platter Splatter': { difficulty: 'expert' },
  'Log Chute': { difficulty: 'expert' },
  "Lex's Way": { difficulty: 'beginner' },

  // Terrain park runs render orange like the official map.
  'Inside Leg': { park: true },
  'Jib Garden': { park: true },
}

export const TERRAIN_PARK_COLOR = '#f18a00'

export function applyTrailOverrides(trails: TrailCollection): TrailCollection {
  return {
    ...trails,
    features: trails.features.map((feature) => {
      const override = OVERRIDES[feature.properties.name]
      if (!override) return feature
      return {
        ...feature,
        properties: {
          ...feature.properties,
          name: override.displayName ?? feature.properties.name,
          difficulty: override.difficulty ?? feature.properties.difficulty,
          color: override.park ? TERRAIN_PARK_COLOR : feature.properties.color,
        },
      }
    }),
  }
}
