export type EmotionCategory = 'Excited/Happy' | 'Calm/Content' | 'Sad/Melancholic' | 'Tense/Angry' | 'Neutral'

export interface AudioFeatures {
  valence: number
  energy: number
  tempo: number
  danceability: number
  acousticness: number
  speechiness: number
  mode: number
}

export function classifyEmotion(features: AudioFeatures, thresholds: { high: number; low: number } = { high: 0.6, low: 0.4 }): EmotionCategory {
  const { valence, energy } = features

  const highValence = valence >= thresholds.high
  const lowValence = valence <= thresholds.low
  const highEnergy = energy >= thresholds.high
  const lowEnergy = energy <= thresholds.low

  if (highValence && highEnergy) return 'Excited/Happy'
  if (highValence && lowEnergy) return 'Calm/Content'
  if (lowValence && lowEnergy) return 'Sad/Melancholic'
  if (lowValence && highEnergy) return 'Tense/Angry'
  return 'Neutral'
}

export function calculateMoodScore(features: AudioFeatures): number {
  // Simple weighted score
  return Math.max(0, Math.min(1,
    0.6 * features.valence +
    0.3 * features.energy -
    0.1 * features.speechiness
  ))
}