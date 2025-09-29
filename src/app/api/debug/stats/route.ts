import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
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

    // Missing features among recent plays
    const missingRows = await prisma.$queryRaw<{ null_valence: number; null_energy: number }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE af.valence IS NULL) AS null_valence,
        COUNT(*) FILTER (WHERE af.energy  IS NULL) AS null_energy
      FROM plays p
      LEFT JOIN audio_features af ON af."trackId" = p."trackId"
      WHERE p."userId" = ${userId} AND p."playedAt" > ${cutoff}
    `)
    const missing = missingRows[0] ?? { null_valence: 0, null_energy: 0 }

    // Extremes for scale sanity (0..1 expected)
    const extremes = await prisma.$queryRaw<{ mi_v: number | null; mx_v: number | null; mi_e: number | null; mx_e: number | null }[]>(Prisma.sql`
      SELECT
        MIN(af.valence) AS mi_v, MAX(af.valence) AS mx_v,
        MIN(af.energy)  AS mi_e, MAX(af.energy)  AS mx_e
      FROM audio_features af
      JOIN plays p ON p."trackId" = af."trackId"
      WHERE p."userId" = ${userId} AND p."playedAt" > ${cutoff}
    `)
    const ext = extremes[0] ?? { mi_v: null, mx_v: null, mi_e: null, mx_e: null }

    // Weighting sanity
    const weightRows = await prisma.$queryRaw<{ zero_ms: number; avg_weight: number | null }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(p."msPlayed",0) = 0) AS zero_ms,
        AVG(CASE WHEN t."durationMs" > 0 THEN p."msPlayed"::float / t."durationMs" ELSE NULL END) AS avg_weight
      FROM plays p
      JOIN tracks t ON t.id = p."trackId"
      WHERE p."userId" = ${userId} AND p."playedAt" > ${cutoff}
    `)
    const weights = weightRows[0] ?? { zero_ms: 0, avg_weight: null }

    // User-specific cut points using percentiles over all their features
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
    const cuts = cutsRows[0] ?? { v_lo: null, v_hi: null, e_lo: null, e_hi: null }

    return NextResponse.json({ days, missing, extremes: ext, weights, cuts })
  } catch (e) {
    console.error('debug/stats error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
