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
    const window = parseInt(searchParams.get('window') || '90')

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - window)

    const current = await prisma.emotion.groupBy({
      by: ['category'],
      where: {
        play: {
          userId: userId,
          playedAt: { gte: cutoff },
        },
      },
      _count: true,
    })

    const previousCutoff = new Date(cutoff)
    previousCutoff.setDate(previousCutoff.getDate() - window)

    const previous = await prisma.emotion.groupBy({
      by: ['category'],
      where: {
        play: {
          userId: userId,
          playedAt: { gte: previousCutoff, lt: cutoff },
        },
      },
      _count: true,
    })

    const trends = current.map((curr: any) => {
      const prev = previous.find((p: any) => p.category === curr.category)
      const prevCount = prev?._count || 0
      const change = prevCount === 0 ? 0 : ((curr._count - prevCount) / prevCount) * 100
      return {
        category: curr.category,
        current: curr._count,
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