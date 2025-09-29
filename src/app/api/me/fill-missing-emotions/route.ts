import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotionCategory } from '@/lib/emotion_v3'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const url = new URL(req.url)
    const limitParam = parseInt(url.searchParams.get('limit') || '2000', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 2000

    const missing = await prisma.play.findMany({
      where: { userId, emotion: { is: null }, track: { audioFeature: { isNot: null } } },
      include: { track: { include: { audioFeature: true } } },
      orderBy: { playedAt: 'desc' },
      take: limit,
    })

    let created = 0
    for (const p of missing) {
      const af = p.track.audioFeature!
      const v3 = classifyEmotionCategory({
        valence: af.valence,
        energy: af.energy,
        danceability: af.danceability,
        acousticness: af.acousticness,
        speechiness: af.speechiness,
        tempo: af.tempo,
        loudness: af.loudness,
        mode: af.mode,
        duration_ms: p.track.durationMs as any,
      })
      try {
        await prisma.emotion.create({
          data: {
            playId: p.id,
            category: v3.category,
            moodScore: v3.mood,
            label: v3.label,
            valence: v3.valence,
            arousal: v3.arousal,
            confidence: v3.confidence,
          } as any,
        })
        created += 1
      } catch {
        try {
          await prisma.emotion.create({ data: { playId: p.id, category: v3.category, moodScore: v3.mood } })
          created += 1
        } catch {}
      }
    }

    return NextResponse.json({ message: 'Filled missing emotions', created, scanned: missing.length })
  } catch (e) {
    console.error('fill-missing-emotions error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
