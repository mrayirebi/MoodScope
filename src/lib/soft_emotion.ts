export type Emo = 'Happy'|'Calm'|'Sad'|'Tense'|'Neutral'

export type SoftProbs = {
  Happy: number
  Calm: number
  Sad: number
  Tense: number
  Neutral: number
  confidence: number
  mood: number
}

export function softClassify(
  f: { valence: number; energy: number; danceability: number; acousticness: number; speechiness: number; tempo: number; loudness: number },
  cuts: { v_lo: number; v_hi: number; e_lo: number; e_hi: number }
): SoftProbs {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  const tempo = clamp((f.tempo - 60) / (200 - 60))
  const loud = clamp((f.loudness + 60) / 60)
  const arousal = clamp(0.6 * f.energy + 0.2 * tempo + 0.1 * (1 - f.acousticness) + 0.1 * loud)
  if (f.speechiness >= 0.66) return { Happy: 0, Calm: 0, Sad: 0, Tense: 0, Neutral: 1, confidence: 0.6, mood: 0.5 }

  const mood = clamp(0.5 * f.valence + 0.3 * arousal + 0.15 * f.danceability - 0.1 * f.speechiness)
  const centers = {
    Happy: { v: cuts.v_hi, e: cuts.e_hi },
    Calm: { v: cuts.v_hi, e: cuts.e_lo },
    Sad: { v: cuts.v_lo, e: cuts.e_lo },
    Tense: { v: cuts.v_lo, e: cuts.e_hi },
  } as const
  const d = Object.fromEntries(
    Object.entries(centers).map(([k, c]) => {
      const dist = Math.hypot(f.valence - c.v, arousal - c.e)
      return [k, Math.exp(-6 * dist)]
    })
  ) as Record<Exclude<Emo, 'Neutral'>, number>
  const neutralBase = Math.exp(-6 * Math.abs(f.valence - 0.5)) * Math.exp(-6 * Math.abs(arousal - 0.5))
  const sum = d.Happy + d.Calm + d.Sad + d.Tense + neutralBase
  const probs = {
    Happy: d.Happy / sum,
    Calm: d.Calm / sum,
    Sad: d.Sad / sum,
    Tense: d.Tense / sum,
    Neutral: neutralBase / sum,
  }
  const confidence = 1 - 5 * probs.Neutral
  return { ...probs, confidence, mood }
}
