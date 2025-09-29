import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AudioFeatures } from '@/lib/emotion'
import { classifyEmotionCategory } from '@/lib/emotion_v3'
import { aiEnabled, classifyEmotionAI } from '@/lib/ai'

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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  const userId = (session.user as any).id as string
  const aiParam = (new URL(req.url)).searchParams.get('ai') as 'auto'|'only'|'off'|null
  const allowAI = aiParam !== 'off'
  const requireAI = aiParam === 'only'

    // Find plays without an emotion
    const plays = await prisma.play.findMany({
      where: { userId, emotion: { is: null } },
      include: { track: true },
      take: 2000,
    })

    let created = 0
    let errors = 0
    for (const p of plays) {
      try {
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
        let category = v3.category
        let moodScore = v3.mood
        if (allowAI && aiEnabled()) {
          try {
            const ai = await classifyEmotionAI({
              trackName: p.track?.name || 'track',
              artists: p.track?.artistIds?.length ? [p.track.artistIds[0]] : [],
              features: {
                valence: features.valence,
                energy: features.energy,
                danceability: features.danceability,
                speechiness: features.speechiness,
                acousticness: features.acousticness,
                tempo: features.tempo,
                mode: features.mode,
              },
            }, { timeoutMs: 5000 })
            if (ai?.category && ai.category !== 'Neutral') category = ai.category
            else if (requireAI && (!ai || !ai.category)) { continue }
            if (typeof ai?.moodScore === 'number') moodScore = Math.max(0, Math.min(1, ai.moodScore))
          } catch {}
        }
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
      } catch (e) {
        console.error('Backfill item error:', e)
        errors += 1
      }
    }

    return NextResponse.json({ message: `Generated emotions for ${created} plays`, count: created, errors })
  } catch (error) {
    console.error('Backfill emotions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
