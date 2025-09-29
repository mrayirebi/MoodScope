export type EmotionCategory = 'Excited/Happy' | 'Calm/Content' | 'Sad/Melancholic' | 'Tense/Angry' | 'Neutral'

export interface AudioFeatures {
  valence: number
  energy: number
  tempo: number
  danceability: number
  acousticness: number
  speechiness: number
  mode: number
  loudness?: number
  duration_ms?: number
}

import { classifyTrack, mapV3ToAppCategory } from './emotion_v3'

export function classifyEmotion(features: AudioFeatures): EmotionCategory {
  const result = classifyTrack({
    valence: features.valence,
    energy: features.energy,
    danceability: features.danceability,
    acousticness: features.acousticness,
    speechiness: features.speechiness,
    tempo: features.tempo,
    loudness: features.loudness,
    mode: features.mode,
    duration_ms: features.duration_ms,
  })
  return mapV3ToAppCategory(result.label)
}

export function calculateMoodScore(features: AudioFeatures): number {
  // New mood uses valence-arousal composite via v3; keep 0..1 clamp
  const { mood } = classifyTrack({
    valence: features.valence,
    energy: features.energy,
    danceability: features.danceability,
    acousticness: features.acousticness,
    speechiness: features.speechiness,
    tempo: features.tempo,
    loudness: features.loudness,
    mode: features.mode,
    duration_ms: features.duration_ms,
  })
  return mood
}