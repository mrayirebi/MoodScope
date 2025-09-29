import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    // Aggregate plays + emotions per day (UTC) for this user
    const rows = (await prisma.$queryRaw(Prisma.sql`
      WITH per_day AS (
        SELECT
          DATE_TRUNC('day', p."playedAt") AS day,
          COUNT(*) AS count,
          SUM(p."msPlayed") AS ms,
          AVG(e."moodScore") AS mood
        FROM plays p
        LEFT JOIN emotions e ON e."playId" = p.id
        WHERE p."userId" = ${userId}
        GROUP BY 1
      ), per_day_emotion AS (
        SELECT
          DATE_TRUNC('day', p."playedAt") AS day,
          e.category,
          COUNT(*) AS cnt,
          ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC('day', p."playedAt") ORDER BY COUNT(*) DESC) AS rn
        FROM plays p
        JOIN emotions e ON e."playId" = p.id
        WHERE p."userId" = ${userId}
        GROUP BY 1, e.category
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             d.count::bigint AS count,
             d.ms::bigint AS ms,
             d.mood AS mood,
             max(CASE WHEN pe.rn = 1 THEN pe.category ELSE NULL END) AS dominant
      FROM per_day d
      LEFT JOIN per_day_emotion pe ON pe.day = d.day
      GROUP BY d.day, d.count, d.ms, d.mood
      ORDER BY d.day ASC
    `)) as Array<{
      day: string
      count: bigint
      ms: bigint
      mood: number | null
      dominant: string | null
    }>

    // Upsert rows
    let upserts = 0
    for (const r of rows) {
      const day = new Date(r.day + 'T00:00:00.000Z')
      await prisma.dailyAggregate.upsert({
        where: { userId_bucketDate: { userId, bucketDate: day } },
        create: {
          userId,
          bucketDate: day,
          count: Number(r.count),
          msPlayed: BigInt(r.ms),
          moodAvg: r.mood as number | null,
          dominantEmotion: r.dominant,
        },
        update: {
          count: Number(r.count),
          msPlayed: BigInt(r.ms),
          moodAvg: r.mood as number | null,
          dominantEmotion: r.dominant,
        },
      })
      upserts++
    }

    return NextResponse.json({ message: 'Rebuilt daily aggregates', upserts })
  } catch (e) {
    console.error('rebuild-aggregates error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
