// Clean single implementation kept below
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

type RangeKey = '90d' | '365d' | 'all'

function getFromDate(range: RangeKey): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const days = range === '90d' ? 90 : 365
  const d = new Date(now)
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

    // Aggregate plays by first artist identifier with counts
    const rows = from
      ? ((await prisma.$queryRaw(Prisma.sql`
          SELECT COALESCE(t."artistIds"[1], 'Unknown') AS artist,
                 COUNT(*)::bigint AS plays
          FROM plays p
          JOIN tracks t ON t.id = p."trackId"
          WHERE p."userId" = ${userId}
            ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
            AND p."playedAt" >= ${from}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 100
        `)) as Array<{ artist: string; plays: bigint }>)
      : ((await prisma.$queryRaw(Prisma.sql`
          SELECT COALESCE(t."artistIds"[1], 'Unknown') AS artist,
                 COUNT(*)::bigint AS plays
          FROM plays p
          JOIN tracks t ON t.id = p."trackId"
          WHERE p."userId" = ${userId}
            ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 100
        `)) as Array<{ artist: string; plays: bigint }>)

    const looksLikeSpotifyId = (s: string) => /^[0-9A-Za-z]{22}$/.test(s)
    const spotifyIds = rows.map(r => r.artist).filter(looksLikeSpotifyId)
    const weightByArtist: Record<string, number> = {}
    for (const r of rows) {
      if (looksLikeSpotifyId(r.artist)) {
        weightByArtist[r.artist] = (weightByArtist[r.artist] || 0) + Number(r.plays)
      }
    }

    let genresCount: Record<string, number> = {}
    if (spotifyIds.length) {
      const token = await getUserSpotifyAccessToken(userId).catch(() => null)
      if (token) {
        const chunk = (arr: string[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
        const chunks = chunk(Array.from(new Set(spotifyIds)), 50)
        for (const ids of chunks) {
          try {
            const resp = await fetch(`https://api.spotify.com/v1/artists?ids=${ids.join(',')}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!resp.ok) continue
            const json: any = await resp.json()
            for (const a of json.artists || []) {
              const weight = weightByArtist[a.id] || 1
              const g: string[] = (a.genres || []) as string[]
              for (const name of g) {
                const key = name.trim()
                if (!key) continue
                genresCount[key] = (genresCount[key] || 0) + weight
              }
            }
          } catch {}
        }
      }
    }

    // Build top 15 genres
    const items = Object.entries(genresCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    return NextResponse.json({ range, source: source || 'all', items })
  } catch (e) {
    console.error('top-genres error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
