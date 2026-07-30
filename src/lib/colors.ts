// Colour language matched to the official Mt Hutt trail map PDF.

export const RUN_COLORS: Record<string, string> = {
  beginner: '#2d9d5b',
  intermediate: '#1686c9',
  advanced: '#e04b3f',
  expert: '#17232a',
  extreme: '#17232a',
}

export const LIFT_COLOR = '#39464d'
export const LIFT_CASING = '#ffffff'
export const BOUNDARY_COLOR = '#f28f35'
export const OFFPISTE_COLOR = '#17232a'

export function trailColor(difficulty?: string, fallback?: string) {
  if (difficulty && RUN_COLORS[difficulty]) return RUN_COLORS[difficulty]
  if (fallback) return fallback
  return '#7a848a' // unclassified
}
