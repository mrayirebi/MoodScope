import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    const group = searchParams.get('group') || 'day'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const emotion = searchParams.get('emotion')

    let dateTrunc: string
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

    const aggregates = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC(${dateTrunc}, p."playedAt") as period,
        e.category,
        COUNT(*) as count,
        AVG(e."moodScore") as avg_mood
      FROM plays p
      JOIN emotions e ON p.id = e."playId"
      WHERE p."userId" = ${userId}
        ${from ? prisma.$queryRaw`AND p."playedAt" >= ${new Date(from)}` : prisma.$queryRaw``}
        ${to ? prisma.$queryRaw`AND p."playedAt" <= ${new Date(to)}` : prisma.$queryRaw``}
        ${emotion ? prisma.$queryRaw`AND e.category = ${emotion}` : prisma.$queryRaw``}
      GROUP BY period, e.category
      ORDER BY period
    `

    return NextResponse.json(aggregates)
  } catch (error) {
    console.error('Aggregate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}