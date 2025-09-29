import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const source = searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null

    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT e.category, SUM(p."msPlayed")::double precision as ms
      FROM plays p
      JOIN emotions e ON p.id = e."playId"
      WHERE p."userId" = ${userId}
        ${from ? Prisma.sql` AND p."playedAt" >= ${new Date(from)}` : Prisma.empty}
        ${to ? Prisma.sql` AND p."playedAt" <= ${new Date(to)}` : Prisma.empty}
        ${source && source !== 'all' ? Prisma.sql` AND p.source = ${source}` : Prisma.empty}
      GROUP BY e.category
      ORDER BY ms DESC
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Weighted aggregate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
