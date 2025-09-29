import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotion as classifyV2, moodScore as moodScoreV2 } from '@/lib/emotion_v2'
import { aiEnabled, aiProvider, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'

function clamp01(x: number) { return Math.max(0, Math.min(1, x)) }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(session.user as any)?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20, 100)
  const source = req.nextUrl.searchParams.get('source') || undefined

  const plays = await prisma.play.findMany({
    where: { userId, ...(source ? { source } : {}) },
    orderBy: { playedAt: 'desc' },
    take: limit,
    include: { track: { include: { audioFeature: true } }, emotion: true },
  })

  const results: any[] = []
  for (const p of plays) {
    const af = p.track.audioFeature
    const features = {
      valence: af ? clamp01(af.valence) : undefined,
      energy: af ? clamp01(af.energy) : undefined,
      danceability: af ? clamp01(af.danceability) : undefined,
      speechiness: af ? clamp01(af.speechiness) : undefined,
      acousticness: af ? clamp01(af.acousticness) : undefined,
      tempo: af ? af.tempo : undefined,
      loudness: af ? af.loudness : undefined,
      mode: af ? af.mode : undefined,
    }
    const hasVE = features.valence != null && features.energy != null
    const v2 = hasVE ? classifyV2(features.valence!, features.energy!) : 'Neutral'
    const v2Score = (features.valence != null && features.energy != null && features.danceability != null && features.speechiness != null)
      ? moodScoreV2({ valence: features.valence!, energy: features.energy!, danceability: features.danceability!, speechiness: features.speechiness! })
      : undefined

    let aiRaw = null as any
    let ai = null as any
    if (aiEnabled()) {
      aiRaw = await classifyEmotionAI({ trackName: p.track.name, artists: (p.track as any).artistIds, features })
      ai = reconcileAIWithV2(aiRaw, { valence: features.valence, energy: features.energy } as any)
    }
    results.push({
      playId: p.id,
      playedAt: p.playedAt,
      track: { id: p.track.id, name: p.track.name, artists: (p.track as any).artistIds },
      source: p.source,
      features,
      v2: { category: v2, moodScore: v2Score },
      ai: { raw: aiRaw, reconciled: ai },
      saved: p.emotion ? {
        category: p.emotion.category,
        moodScore: p.emotion.moodScore,
        label: (p.emotion as any).label ?? null,
        valence: (p.emotion as any).valence ?? null,
        arousal: (p.emotion as any).arousal ?? null,
        confidence: (p.emotion as any).confidence ?? null,
      } : null,
    })
  }

  return NextResponse.json({ provider: aiProvider(), enabled: aiEnabled(), results })
}
