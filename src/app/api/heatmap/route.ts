import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RangeKey = '7d' | '30d' | '90d' | '365d' | 'all'

function getFromDate(range: RangeKey): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const d = new Date(now)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365
  d.setDate(now.getDate() - days)
  return d
}

function dateKeyInTZ(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const url = new URL(req.url)
    const range = (url.searchParams.get('range') as RangeKey) || '30d'
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
      include: { emotion: true },
      orderBy: { playedAt: 'asc' },
      take: 20000, // cap to avoid huge payloads
    })

    type Bucket = {
      date: string
      count: number
      msPlayed: number
      moodSum: number
      moodCount: number
      emotionCounts: Record<string, number>
    }

    const map = new Map<string, Bucket>()
    for (const p of plays) {
      const key = dateKeyInTZ(p.playedAt, timeZone)
      let b = map.get(key)
      if (!b) {
        b = { date: key, count: 0, msPlayed: 0, moodSum: 0, moodCount: 0, emotionCounts: {} }
        map.set(key, b)
      }
      b.count += 1
      b.msPlayed += p.msPlayed || 0
      if (p.emotion) {
        b.moodSum += p.emotion.moodScore
        b.moodCount += 1
        b.emotionCounts[p.emotion.category] = (b.emotionCounts[p.emotion.category] || 0) + 1
      }
    }

    const daysRaw = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).map(b => {
      let dominantEmotion: string | null = null
      let max = -1
      for (const [k, v] of Object.entries(b.emotionCounts)) {
        if (v > max) { max = v; dominantEmotion = k }
      }
      return {
        date: b.date,
        count: b.count,
        msPlayed: b.msPlayed,
        moodAvg: b.moodCount ? b.moodSum / b.moodCount : null,
        dominantEmotion,
      }
    })

    // Compute z-scores on moodAvg across available days
    const moodValues = daysRaw.map(d => d.moodAvg).filter((v): v is number => typeof v === 'number')
    let mean = 0, std = 0
    if (moodValues.length > 0) {
      mean = moodValues.reduce((a, b) => a + b, 0) / moodValues.length
      const variance = moodValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / moodValues.length
      std = Math.sqrt(variance)
    }
    const days = daysRaw.map(d => {
      const z = (typeof d.moodAvg === 'number' && std > 0) ? (d.moodAvg - mean) / std : null
      const anomaly = typeof z === 'number' ? Math.abs(z) > 2 : false
      return { ...d, zscore: z, anomaly }
    })

  return NextResponse.json({ range, timeZone, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, source: source || 'all', days })
  } catch (e) {
    console.error('heatmap error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
