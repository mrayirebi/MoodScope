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
    const windowParam = searchParams.get('window') || '90'
    const windowDays = parseInt(windowParam)
  const source = searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null

  let current: any[] = []
  let previous: any[] = []

    if (windowParam === 'all' || Number.isNaN(windowDays) || windowDays <= 0) {
      // All-time counts
      // Use raw SQL to get all-time counts by category
      current = await prisma.$queryRaw(Prisma.sql`
        SELECT e.category, COUNT(*)::int as _count
        FROM emotions e
        JOIN plays p ON p.id = e."playId"
        WHERE p."userId" = ${userId}
          ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
        GROUP BY e.category
      `)
      previous = [] as any[]
    } else {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - windowDays)

      current = await prisma.$queryRaw(Prisma.sql`
        SELECT e.category, COUNT(*)::int as _count
        FROM emotions e
        JOIN plays p ON p.id = e."playId"
        WHERE p."userId" = ${userId} AND p."playedAt" >= ${cutoff}
          ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
        GROUP BY e.category
      `)

      const previousCutoff = new Date(cutoff)
      previousCutoff.setDate(previousCutoff.getDate() - windowDays)

      previous = await prisma.$queryRaw(Prisma.sql`
        SELECT e.category, COUNT(*)::int as _count
        FROM emotions e
        JOIN plays p ON p.id = e."playId"
        WHERE p."userId" = ${userId} AND p."playedAt" >= ${previousCutoff} AND p."playedAt" < ${cutoff}
          ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
        GROUP BY e.category
      `)
    }

    const trends = current.map((curr: any) => {
      const prev = previous.find((p: any) => p.category === curr.category)
      const currCount = typeof curr._count === 'number' ? curr._count : (curr._count?._all ?? 0)
      const prevCount = prev ? (typeof prev._count === 'number' ? prev._count : (prev._count?._all ?? 0)) : 0
      const change = prevCount === 0 ? 0 : ((currCount - prevCount) / prevCount) * 100
      return {
        category: curr.category,
        current: currCount,
        previous: prevCount,
        change: Math.round(change * 100) / 100,
      }
    })

    return NextResponse.json(trends)
  } catch (error) {
    console.error('Trends error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}