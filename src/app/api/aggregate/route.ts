import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id

    const { searchParams } = new URL(request.url)
    const group = (searchParams.get('group') || 'day') as 'day'|'week'|'month'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const emotion = searchParams.get('emotion') as string | null
    const source = searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null
    const tz = searchParams.get('tz') || undefined

    let dateTrunc: 'day' | 'week' | 'month'
    switch (group) {
      case 'week':
        dateTrunc = 'week'
        break
      case 'month':
        dateTrunc = 'month'
        break
      default:
        dateTrunc = 'day'
    }

    const dateTruncLiteral = Prisma.raw(`'${dateTrunc}'`)

    // Low-confidence filter + weight and personalized thresholds, all in SQL.
    // Compute normalized arousal from audio features when emotions.arousal is missing.
    const tzSql = tz ? Prisma.sql`${Prisma.raw(`'${tz.replace(/'/g, "''")}'`)}` : Prisma.sql`'UTC'`

    const sql = Prisma.sql`
      WITH base AS (
        SELECT
          p."playedAt",
          (p."playedAt" AT TIME ZONE ${tzSql}) AS played_local,
          e."moodScore" AS mood,
          COALESCE(e.valence, af.valence) AS valence,
          COALESCE(
            e.arousal,
            LEAST(GREATEST(0.6*af.energy + 0.2*LEAST(GREATEST((af.tempo - 60) / 140.0, 0), 1) + 0.1*(1 - af.acousticness) + 0.1*LEAST(GREATEST((af.loudness + 60) / 60.0, 0), 1), 0), 1)
          ) AS arousal,
          LEAST(GREATEST((p."msPlayed"::double precision) / NULLIF(t."durationMs", 0), 0), 1) AS weight
        FROM plays p
        JOIN emotions e ON e."playId" = p.id
        JOIN tracks t ON t.id = p."trackId"
        JOIN audio_features af ON af."trackId" = t.id
        WHERE p."userId" = ${userId}
          ${from ? Prisma.sql` AND p."playedAt" >= ${new Date(from)}` : Prisma.empty}
          ${to ? Prisma.sql` AND p."playedAt" <= ${new Date(to)}` : Prisma.empty}
          ${source && source !== 'all' ? Prisma.sql` AND p.source = ${source}` : Prisma.empty}
          AND t."durationMs" >= 30000
          AND af.speechiness < 0.66
          ${emotion ? Prisma.sql` AND e.category = ${emotion}` : Prisma.empty}
      ), pct AS (
        SELECT
          PERCENTILE_CONT(0.33) WITHIN GROUP (ORDER BY valence) AS v33,
          PERCENTILE_CONT(0.66) WITHIN GROUP (ORDER BY valence) AS v66,
          PERCENTILE_CONT(0.33) WITHIN GROUP (ORDER BY arousal) AS a33,
          PERCENTILE_CONT(0.66) WITHIN GROUP (ORDER BY arousal) AS a66
        FROM base
      )
      SELECT
        DATE_TRUNC(${dateTruncLiteral}, played_local) AS period,
        CASE
          WHEN valence >= (SELECT v66 FROM pct) AND arousal >= (SELECT a66 FROM pct) THEN 'Excited/Happy'
          WHEN valence >= (SELECT v66 FROM pct) AND arousal <= (SELECT a33 FROM pct) THEN 'Calm/Content'
          WHEN valence <= (SELECT v33 FROM pct) AND arousal <= (SELECT a33 FROM pct) THEN 'Sad/Melancholic'
          WHEN valence <= (SELECT v33 FROM pct) AND arousal >= (SELECT a66 FROM pct) THEN 'Tense/Angry'
          ELSE 'Neutral'
        END AS category,
        SUM(weight) AS value,
        SUM(weight * mood) / NULLIF(SUM(weight), 0) AS avg_mood
      FROM base
      GROUP BY period, category
      ORDER BY period
    `

    const aggregates = await prisma.$queryRaw(sql)

    return NextResponse.json({
      group,
      tz: tz || 'UTC',
      from: from || null,
      to: to || null,
      source: source || 'all',
      rows: aggregates,
    })
  } catch (error) {
    console.error('Aggregate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}