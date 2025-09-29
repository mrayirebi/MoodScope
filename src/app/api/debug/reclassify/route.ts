import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { classifyWithCuts, type EmotionCuts } from '@/lib/emotion_v3'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const url = new URL(req.url)
    const daysParam = parseInt(url.searchParams.get('days') || '30', 10)
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    // Compute user-specific cuts
    const cutsRows = await prisma.$queryRaw<{ v_lo: number | null; v_hi: number | null; e_lo: number | null; e_hi: number | null }[]>(Prisma.sql`
      WITH base AS (
        SELECT af.valence, af.energy
        FROM audio_features af
        JOIN plays p ON p."trackId" = af."trackId"
        WHERE p."userId" = ${userId}
      )
      SELECT
        PERCENTILE_CONT(0.33) WITHIN GROUP (ORDER BY valence) AS v_lo,
        PERCENTILE_CONT(0.66) WITHIN GROUP (ORDER BY valence) AS v_hi,
        PERCENTILE_CONT(0.33) WITHIN GROUP (ORDER BY energy)  AS e_lo,
        PERCENTILE_CONT(0.66) WITHIN GROUP (ORDER BY energy)  AS e_hi
      FROM base
    `)
    const cuts = cutsRows[0]
    if (!cuts || cuts.v_lo == null || cuts.v_hi == null || cuts.e_lo == null || cuts.e_hi == null) {
      return NextResponse.json({ error: 'Insufficient data to compute cuts' }, { status: 400 })
    }
    const C: EmotionCuts = { v_lo: cuts.v_lo, v_hi: cuts.v_hi, e_lo: cuts.e_lo, e_hi: cuts.e_hi }

    // Find recent plays with features
    const plays = await prisma.play.findMany({
      where: { userId, playedAt: { gte: cutoff } },
      include: { track: { include: { audioFeature: true } } },
      orderBy: { playedAt: 'asc' },
      take: 5000,
    })

    let updated = 0
    for (const p of plays) {
      const f = p.track?.audioFeature
      if (!f) continue
      const r = classifyWithCuts({
        valence: f.valence,
        energy: f.energy,
        danceability: f.danceability,
        acousticness: f.acousticness,
        speechiness: f.speechiness,
        tempo: f.tempo,
        loudness: f.loudness,
        duration_ms: p.track.durationMs,
        mode: f.mode,
      }, C)

      await prisma.emotion.upsert({
        where: { playId: p.id },
        update: {
          category: r.category,
          moodScore: r.mood,
          label: r.label,
          valence: r.valence,
          arousal: r.arousal,
          confidence: r.confidence,
        },
        create: {
          playId: p.id,
          category: r.category,
          moodScore: r.mood,
          label: r.label,
          valence: r.valence,
          arousal: r.arousal,
          confidence: r.confidence,
        },
      })
      updated += 1
    }

    return NextResponse.json({ days, updated })
  } catch (e) {
    console.error('debug/reclassify error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
