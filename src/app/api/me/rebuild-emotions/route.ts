import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotionCategory } from '@/lib/emotion_v3'
import type { AudioFeatures } from '@/lib/emotion'

function generateMockFeatures(trackName: string, artistName: string): AudioFeatures {
  const text = `${trackName} ${artistName}`.toLowerCase()
  let valence = 0.5
  let energy = 0.5
  let tempo = 120
  let danceability = 0.5
  let acousticness = 0.5
  let speechiness = 0.1
  if (text.includes('happy') || text.includes('joy') || text.includes('excited')) { valence = 0.8; energy = 0.7 }
  else if (text.includes('calm') || text.includes('peace') || text.includes('tranquil')) { valence = 0.7; energy = 0.3 }
  else if (text.includes('sad') || text.includes('melancholy') || text.includes('heartbreak')) { valence = 0.2; energy = 0.3 }
  else if (text.includes('angry') || text.includes('intense') || text.includes('rebellious')) { valence = 0.3; energy = 0.8 }
  return {
    valence: Math.max(0, Math.min(1, valence + (Math.random() - 0.5) * 0.2)),
    energy: Math.max(0, Math.min(1, energy + (Math.random() - 0.5) * 0.2)),
    tempo: tempo + (Math.random() - 0.5) * 40,
    danceability: Math.max(0, Math.min(1, danceability + (Math.random() - 0.5) * 0.2)),
    acousticness: Math.max(0, Math.min(1, acousticness + (Math.random() - 0.5) * 0.2)),
    speechiness: Math.max(0, Math.min(1, speechiness + (Math.random() - 0.5) * 0.2)),
    mode: Math.random() > 0.5 ? 1 : 0,
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const plays = await prisma.play.findMany({ where: { userId }, include: { track: true } })
    await prisma.emotion.deleteMany({ where: { play: { userId } } })

    let created = 0
    for (const p of plays) {
      const features = generateMockFeatures(p.track?.name || 'track', p.track?.artistIds?.[0] || '')
      const v3 = classifyEmotionCategory({
        valence: features.valence,
        energy: features.energy,
        danceability: features.danceability,
        acousticness: features.acousticness,
        speechiness: features.speechiness,
        tempo: features.tempo,
        mode: features.mode,
      })
      const category = v3.category
      const moodScore = v3.mood
      try {
        await prisma.emotion.create({
          data: {
            playId: p.id,
            category,
            moodScore,
            label: v3.label,
            valence: v3.valence,
            arousal: v3.arousal,
            confidence: v3.confidence,
          } as any,
        })
      } catch {
        await prisma.emotion.create({ data: { playId: p.id, category, moodScore } })
      }
      created += 1
    }

    return NextResponse.json({ message: `Rebuilt emotions for ${created} plays`, count: created })
  } catch (error) {
    console.error('Rebuild emotions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
