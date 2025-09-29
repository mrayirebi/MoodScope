import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RangeKey = '30d' | '90d' | '365d' | 'all'

function getFromDate(range: RangeKey): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const d = new Date(now)
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365
  d.setDate(now.getDate() - days)
  return d
}

function partsInTZ(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(date)
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Sun'
  const hourStr = parts.find(p => p.type === 'hour')?.value || '00'
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayStr)
  const hour = parseInt(hourStr, 10)
  return { weekday: Math.max(0, weekday), hour: isNaN(hour) ? 0 : hour }
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
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const source = url.searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
    const timeZone = user?.timezone || 'UTC'

    const from = fromParam ? new Date(fromParam) : getFromDate(range)
    const to = toParam ? new Date(toParam) : undefined
    const where: any = { userId }
    if (from || to) where.playedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
    if (source && source !== 'all') where.source = source

    const plays = await prisma.play.findMany({
      where,
      include: { emotion: true, track: { include: { audioFeature: true } } },
      orderBy: { playedAt: 'asc' },
      take: 50000,
    })

    type Cell = { count: number; ms: number; emotions: Record<string, number> }
    const grid = new Map<string, Cell>()
    for (const p of plays) {
      const ef = p.track.audioFeature
      if (!p.emotion || !ef) continue
      if (ef.speechiness >= 0.66) continue
      if ((p.track.durationMs || 0) < 30000) continue
      const { weekday, hour } = partsInTZ(p.playedAt, timeZone)
      const key = `${weekday}:${hour}`
      let cell = grid.get(key)
      if (!cell) { cell = { count: 0, ms: 0, emotions: {} }; grid.set(key, cell) }
      cell.count += 1
      cell.ms += p.msPlayed || 0
      const cat = p.emotion.category
      cell.emotions[cat] = (cell.emotions[cat] || 0) + 1
    }

    const items = Array.from(grid.entries()).map(([key, v]) => {
      const [w, h] = key.split(':').map(x => parseInt(x, 10))
      let dominantEmotion: string | null = null
      let max = -1
      for (const [k, c] of Object.entries(v.emotions)) { if (c > max) { max = c; dominantEmotion = k } }
      return { weekday: w, hour: h, count: v.count, msPlayed: v.ms, dominantEmotion }
    })

    return NextResponse.json({ range, timeZone, items })
  } catch (e) {
    console.error('weekday-hour error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
