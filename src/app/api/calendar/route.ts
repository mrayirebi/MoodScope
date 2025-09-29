import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

type RangeKey = '30d' | '90d' | '365d' | 'all'

function getFromDate(range: RangeKey): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const d = new Date(now)
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365
  d.setDate(now.getDate() - days)
  return d
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string
    const url = new URL(req.url)
  const range = (url.searchParams.get('range') as RangeKey) || '90d'
  const source = url.searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null
    const from = getFromDate(range)

    const where: any = { userId }
    if (from) where.playedAt = { gte: from }

    const byDay = from
      ? ((await prisma.$queryRaw(Prisma.sql`
          SELECT to_char(date_trunc('day', "playedAt"), 'YYYY-MM-DD') AS day,
                 COUNT(*)::bigint                                AS plays,
                 SUM("msPlayed")::bigint                        AS ms
          FROM plays
          WHERE "userId" = ${userId}
            ${source && source !== 'all' ? Prisma.sql`AND source = ${source}` : Prisma.empty}
            AND "playedAt" >= ${from}
          GROUP BY 1
          ORDER BY 1 ASC
        `)) as Array<{ day: string; plays: bigint; ms: bigint }>)
      : ((await prisma.$queryRaw(Prisma.sql`
          SELECT to_char(date_trunc('day', "playedAt"), 'YYYY-MM-DD') AS day,
                 COUNT(*)::bigint                                AS plays,
                 SUM("msPlayed")::bigint                        AS ms
          FROM plays
          WHERE "userId" = ${userId}
            ${source && source !== 'all' ? Prisma.sql`AND source = ${source}` : Prisma.empty}
          GROUP BY 1
          ORDER BY 1 ASC
        `)) as Array<{ day: string; plays: bigint; ms: bigint }>)

    const days = byDay.map(r => ({ date: r.day, plays: Number(r.plays), msPlayed: Number(r.ms) }))
    return NextResponse.json({ range, source: source || 'all', days })
  } catch (e) {
    console.error('calendar error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
