export type Emotion = 'Excited/Happy'|'Calm/Content'|'Sad/Melancholic'|'Tense/Angry'|'Neutral'

export function classifyEmotion(valence: number, energy: number): Emotion {
  const hi = 0.66, lo = 0.33
  if (valence >= hi && energy >= hi) return 'Excited/Happy'
  if (valence >= hi && energy <= lo) return 'Calm/Content'
  if (valence <= lo && energy <= lo) return 'Sad/Melancholic'
  if (valence <= lo && energy >= hi) return 'Tense/Angry'
  return 'Neutral'
}

export function moodScore(f: { valence: number, energy: number, danceability: number, speechiness: number }): number {
  return Math.min(1, Math.max(0, 0.5*f.valence + 0.3*f.energy + 0.15*f.danceability - 0.1*f.speechiness))
}
