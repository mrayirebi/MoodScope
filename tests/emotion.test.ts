import { classifyEmotion, calculateMoodScore } from '@/lib/emotion'

describe('emotion classifier', () => {
  it('happy when high valence and energy', () => {
    const cat = classifyEmotion({ valence: 0.9, energy: 0.8, tempo: 120, danceability: 0.5, acousticness: 0.2, speechiness: 0.1, mode: 1 })
    expect(cat).toBe('Excited/Happy')
  })
  it('calm when high valence, low energy', () => {
    const cat = classifyEmotion({ valence: 0.8, energy: 0.2, tempo: 90, danceability: 0.4, acousticness: 0.6, speechiness: 0.1, mode: 1 })
    expect(cat).toBe('Calm/Content')
  })
  it('tense when low valence, high energy', () => {
    const cat = classifyEmotion({ valence: 0.2, energy: 0.8, tempo: 140, danceability: 0.6, acousticness: 0.1, speechiness: 0.1, mode: 1 })
    expect(cat).toBe('Tense/Angry')
  })
  it('mood score in bounds', () => {
    const score = calculateMoodScore({ valence: 0.5, energy: 0.5, tempo: 120, danceability: 0.5, acousticness: 0.5, speechiness: 0.1, mode: 1 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
