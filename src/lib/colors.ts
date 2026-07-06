export function powderColor(score: number) {
  if (score >= 0.82) return '#008f45'
  if (score >= 0.66) return '#19b75a'
  if (score >= 0.48) return '#73d37a'
  if (score >= 0.3) return '#c5e879'
  return '#f0d86b'
}

export function trailColor(difficulty?: string, fallback?: string) {
  if (fallback) return fallback
  if (difficulty === 'beginner') return '#35b64a'
  if (difficulty === 'intermediate') return '#1c9fda'
  if (difficulty === 'advanced') return '#ed1c24'
  if (difficulty === 'expert' || difficulty === 'extreme') return '#111111'
  return '#5f686d'
}
