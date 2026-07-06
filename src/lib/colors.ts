export function powderColor(score: number) {
  if (score >= 0.75) return '#1f8f52'
  if (score >= 0.5) return '#8fbd3a'
  if (score >= 0.25) return '#e1b72f'
  return '#be3c35'
}

export function trailColor(difficulty?: string, fallback?: string) {
  if (fallback) return fallback
  if (difficulty === 'beginner') return '#26a64b'
  if (difficulty === 'intermediate') return '#2563eb'
  if (difficulty === 'advanced' || difficulty === 'expert') return '#1f2937'
  if (difficulty === 'extreme') return '#111827'
  return '#f05a28'
}
