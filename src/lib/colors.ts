// Colour language matched to the official Mt Hutt trail map PDF.

export const RUN_COLORS: Record<string, string> = {
  beginner: '#3faa47', // green circle runs
  intermediate: '#2f9fe0', // light blue square runs
  advanced: '#e6402f', // red runs
  expert: '#15181a', // black diamond
  extreme: '#15181a', // double black
}

export const LIFT_COLOR = '#4a5257'
export const LIFT_CASING = '#ffffff'
export const BOUNDARY_COLOR = '#f47b20'
export const OFFPISTE_COLOR = '#15181a'

export function trailColor(difficulty?: string, fallback?: string) {
  if (difficulty && RUN_COLORS[difficulty]) return RUN_COLORS[difficulty]
  if (fallback) return fallback
  return '#7a848a' // unclassified
}
