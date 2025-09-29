export type Emotion = 'Happy'|'Calm'|'Sad'|'Tense'|'Neutral'|'Speech'

export type TrackFeatures = {
  valence: number
  energy: number
  danceability: number
  acousticness: number
  speechiness: number
  tempo: number
  loudness?: number // dB, typical -60 .. 0; if missing, assume -30
  mode?: number
  duration_ms?: number
}

const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x))

function normalizeTempo(bpm: number) {
  // 60–200 BPM mapped to 0–1
  return clamp((bpm - 60) / (200 - 60))
}

function normalizeLoudness(loudnessDb?: number) {
  // -60–0 dB mapped to 0–1; assume -30 dB (~0.5) if missing
  const db = typeof loudnessDb === 'number' ? loudnessDb : -30
  return clamp((db + 60) / 60)
}

// Exported for reuse in server-side debug and reclassification routines
export function computeArousal(features: Pick<TrackFeatures, 'energy' | 'tempo' | 'acousticness' | 'loudness'>) {
  const tempoNorm = normalizeTempo(features.tempo)
  const loudnessNorm = normalizeLoudness(features.loudness)
  return clamp(
    0.6 * features.energy +
    0.2 * tempoNorm +
    0.1 * (1 - features.acousticness) +
    0.1 * loudnessNorm
  )
}

export function classifyTrack(features: TrackFeatures) {
  // Arousal (aka activation)
  const arousal = computeArousal(features)

  // Speech/podcast guardrail
  if (features.speechiness >= 0.66) {
    return { label: 'Speech' as Emotion, mood: 0.0, valence: features.valence, arousal, confidence: 0.9 }
  }

  // Continuous mood score (for charts)
  const mood = clamp(
    0.5 * features.valence +
    0.3 * arousal +
    0.15 * features.danceability -
    0.1 * features.speechiness
  )

  // Buckets
  // Soften thresholds and add secondary rules to reduce Neutral leakage.
  const hi = 0.58, lo = 0.42
  let label: Emotion = 'Neutral'
  // Primary quadrant checks (strong signals in both dimensions)
  if (features.valence >= hi && arousal >= hi) label = 'Happy'
  else if (features.valence >= hi && arousal <= lo) label = 'Calm'
  else if (features.valence <= lo && arousal <= lo) label = 'Sad'
  else if (features.valence <= lo && arousal >= hi) label = 'Tense'
  // Secondary rules: when one axis is strong and the other is mid, bias by 0.5 split
  else if (features.valence >= hi) label = arousal >= 0.5 ? 'Happy' : 'Calm'
  else if (features.valence <= lo) label = arousal >= 0.5 ? 'Tense' : 'Sad'
  else if (arousal >= hi) label = features.valence >= 0.5 ? 'Happy' : 'Tense'
  else if (arousal <= lo) label = features.valence >= 0.5 ? 'Calm' : 'Sad'
  // Tertiary rule: outside a small neutral dead zone, pick quadrant by signs
  if (label === 'Neutral') {
    const dv = features.valence - 0.5
    const da = arousal - 0.5
    const dead = 0.08
    if (Math.abs(dv) > dead || Math.abs(da) > dead) {
      if (dv >= 0 && da >= 0) label = 'Happy'
      else if (dv >= 0 && da < 0) label = 'Calm'
      else if (dv < 0 && da < 0) label = 'Sad'
      else label = 'Tense'
    }
  }

  // Confidence: distance from nearest boundary
  const dv = Math.min(Math.abs(features.valence - hi), Math.abs(features.valence - lo))
  const da = Math.min(Math.abs(arousal - hi), Math.abs(arousal - lo))
  let confidence = clamp(0.55 + 0.45 * Math.min(dv, da) / 0.5) // 0.55–1.0 heuristic

  // Low confidence if very short or missing critical features
  if (features.duration_ms != null && features.duration_ms < 30_000) {
    confidence = Math.min(confidence, 0.7)
  }

  return { label, mood, valence: features.valence, arousal, confidence }
}

// Map v3 labels to existing app categories
export function mapV3ToAppCategory(label: Emotion): 'Excited/Happy'|'Calm/Content'|'Sad/Melancholic'|'Tense/Angry'|'Neutral' {
  switch (label) {
    case 'Happy': return 'Excited/Happy'
    case 'Calm': return 'Calm/Content'
    case 'Sad': return 'Sad/Melancholic'
    case 'Tense': return 'Tense/Angry'
    // 'Speech' and 'Neutral' both map to Neutral in current schema
    default: return 'Neutral'
  }
}

// App-level category type alias used across UI/API
export type AppEmotionCategory = 'Excited/Happy'|'Calm/Content'|'Sad/Melancholic'|'Tense/Angry'|'Neutral'

/**
 * classifyEmotionCategory
 * A convenience wrapper that:
 *  - accepts (partial) Spotify audio features
 *  - fills safe defaults for missing values
 *  - classifies using v3, and maps to app categories
 */
export function classifyEmotionCategory(features: Partial<TrackFeatures>): {
  label: Emotion
  category: AppEmotionCategory
  valence: number
  arousal: number
  mood: number
  confidence: number
} {
  const f: TrackFeatures = {
    valence: clamp(features.valence ?? 0.5),
    energy: clamp(features.energy ?? 0.5),
    danceability: clamp(features.danceability ?? 0.5),
    acousticness: clamp(features.acousticness ?? 0.5),
    speechiness: clamp(features.speechiness ?? 0.0),
    tempo: typeof features.tempo === 'number' ? features.tempo : 120,
    loudness: features.loudness,
    mode: features.mode,
    duration_ms: features.duration_ms,
  }
  const r = classifyTrack(f)
  return {
    label: r.label,
    category: mapV3ToAppCategory(r.label),
    valence: r.valence,
    arousal: r.arousal,
    mood: r.mood,
    confidence: r.confidence,
  }
}

// Classification variant that uses user-specific cut points for labeling
export type EmotionCuts = { v_lo: number; v_hi: number; e_lo: number; e_hi: number }

export function classifyWithCuts(features: TrackFeatures, cuts: EmotionCuts) {
  const arousal = computeArousal(features)

  // Speech/podcast guardrail
  if (features.speechiness >= 0.66) {
    return {
      label: 'Speech' as Emotion,
      category: mapV3ToAppCategory('Speech'),
      valence: features.valence,
      arousal,
      mood: 0.0,
      confidence: 0.9,
    }
  }

  // Continuous mood score
  const mood = clamp(
    0.5 * features.valence +
    0.3 * arousal +
    0.15 * features.danceability -
    0.1 * features.speechiness
  )

  let label: Emotion = 'Neutral'
  if (features.valence >= cuts.v_hi && arousal >= cuts.e_hi) label = 'Happy'
  else if (features.valence >= cuts.v_hi && arousal <= cuts.e_lo) label = 'Calm'
  else if (features.valence <= cuts.v_lo && arousal <= cuts.e_lo) label = 'Sad'
  else if (features.valence <= cuts.v_lo && arousal >= cuts.e_hi) label = 'Tense'

  // Confidence ~ distance from nearest cut
  const dv = Math.min(Math.abs(features.valence - cuts.v_hi), Math.abs(features.valence - cuts.v_lo))
  const da = Math.min(Math.abs(arousal - cuts.e_hi), Math.abs(arousal - cuts.e_lo))
  const confidence = clamp(0.55 + 0.45 * Math.min(dv, da) / 0.5)

  return {
    label,
    category: mapV3ToAppCategory(label),
    valence: features.valence,
    arousal,
    mood,
    confidence,
  }
}
