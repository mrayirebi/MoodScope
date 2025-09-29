import { classifyEmotion, moodScore } from '@/lib/emotion_v2'

describe('emotion_v2', () => {
  it('classifies based on valence and energy', () => {
    expect(classifyEmotion(0.9, 0.8)).toBe('Excited/Happy')
    expect(classifyEmotion(0.8, 0.2)).toBe('Calm/Content')
    expect(classifyEmotion(0.2, 0.8)).toBe('Tense/Angry')
  })
  it('moodScore stays within [0,1]', () => {
    const s = moodScore({ valence: 0.5, energy: 0.5, danceability: 0.5, speechiness: 0.1 })
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1)
  })
})
