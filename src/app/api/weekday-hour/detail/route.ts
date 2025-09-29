import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string
    const url = new URL(req.url)
    const weekday = parseInt(url.searchParams.get('weekday') || '0', 10)
    const hour = parseInt(url.searchParams.get('hour') || '0', 10)
    const range = (url.searchParams.get('range') as '30d'|'90d'|'365d'|'all') || '90d'
    const source = url.searchParams.get('source') as 'oauth'|'upload'|'demo'|'demo-rich'|'all'|null

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
    const tz = user?.timezone || 'UTC'

    const inSlot = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(date)
      const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Sun'
      const hourStr = parts.find(p => p.type === 'hour')?.value || '00'
      const w = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayStr)
      const h = parseInt(hourStr, 10)
      return w === weekday && h === hour
    }

    const getFromDate = (r: '30d'|'90d'|'365d'|'all') => {
      if (r === 'all') return null
      const now = new Date()
      const days = r === '30d' ? 30 : r === '90d' ? 90 : 365
      const d = new Date(now)
      d.setDate(now.getDate() - days)
      return d
    }

    const from = getFromDate(range)
    const where: any = { userId, ...(from ? { playedAt: { gte: from } } : {}) }
    if (source && source !== 'all') where.source = source

    const plays = await prisma.play.findMany({
      where,
      include: { emotion: true, track: { include: { audioFeature: true } } },
      orderBy: { playedAt: 'desc' },
      take: 20000,
    })

    const looksLikeSpotifyId = (s: string) => /^[0-9A-Za-z]{22}$/.test(s)
    const map = new Map<string, { id: string; name: string; artistId: string | null; artist: string; count: number }>()
    for (const p of plays) {
      if (!p.emotion || !p.track.audioFeature) continue
      if (p.track.audioFeature.speechiness >= 0.66) continue
      if (p.track.durationMs < 30000) continue
      if (!inSlot(p.playedAt)) continue
      const artistRaw = p.track.artistIds?.[0] || 'Unknown'
      const artistId = looksLikeSpotifyId(artistRaw) ? artistRaw : null
      const key = p.track.id
      if (!map.has(key)) map.set(key, { id: p.track.id, name: p.track.name, artistId, artist: artistRaw, count: 0 })
      map.get(key)!.count += 1
    }
    const items = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5)

    // Enrich artist names/images via Spotify if possible
    let artistNameMap: Record<string, string> = {}
    let artistImageMap: Record<string, string | null> = {}
    const ids = Array.from(new Set(items.map(i => i.artistId).filter((x): x is string => !!x)))
    if (ids.length) {
      const accRows = await prisma.$queryRaw(Prisma.sql`
        SELECT access_token FROM accounts
        WHERE "userId" = ${userId} AND provider = 'spotify'
        ORDER BY "expires_at" DESC NULLS LAST
        LIMIT 1
      `) as Array<{ access_token: string | null }>
      const token: string | null = accRows?.[0]?.access_token || null
      if (token) {
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50)
          try {
            const resp = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (resp.ok) {
              const json: any = await resp.json()
              for (const a of json.artists || []) {
                artistNameMap[a.id] = a.name
                artistImageMap[a.id] = a.images?.[0]?.url || null
              }
            }
          } catch {}
        }
      }
    }

    const tracks = items.map(i => ({
      id: i.id,
      name: i.name,
      artist: i.artistId ? (artistNameMap[i.artistId] || i.artist) : i.artist,
      artistImage: i.artistId ? (artistImageMap[i.artistId] ?? null) : null,
      count: i.count,
    }))

    return NextResponse.json({ weekday, hour, tracks })
  } catch (e) {
    console.error('weekday-hour detail error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
