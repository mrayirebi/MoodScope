import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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

    // Aggregate by first artist identifier in Track.artistIds
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
          LIMIT 10
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
          LIMIT 10
        `)) as Array<{ artist: string; plays: bigint }>)

    // Try to enrich with Spotify names/images if artist looks like a Spotify ID
    const looksLikeSpotifyId = (s: string) => /^[0-9A-Za-z]{22}$/.test(s)
    const spotifyIds = rows.map(r => r.artist).filter(looksLikeSpotifyId)

  let images: Record<string, { name: string; imageUrl: string | null; genres: string[] }> = {}
    if (spotifyIds.length) {
      // Attempt to get user's Spotify access token (raw query to avoid type issues)
      const rowsTok = await prisma.$queryRaw(Prisma.sql`
        SELECT access_token FROM accounts
        WHERE "userId" = ${userId} AND provider = 'spotify'
        ORDER BY "expires_at" DESC NULLS LAST
        LIMIT 1
      `) as Array<{ access_token: string | null }>
      const token = rowsTok[0]?.access_token || null
      if (token) {
        try {
          const chunk = (arr: string[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
          const chunks = chunk(spotifyIds, 50)
          for (const ids of chunks) {
            const resp = await fetch(`https://api.spotify.com/v1/artists?ids=${ids.join(',')}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (resp.ok) {
              const json: any = await resp.json()
              for (const a of json.artists || []) {
                images[a.id] = { name: a.name, imageUrl: a.images?.[0]?.url || null, genres: Array.isArray(a.genres) ? a.genres : [] }
              }
            }
          }
        } catch {
          // ignore enrichment failures; fallback to plain names
        }
      }
    }

    const items = rows.map(r => {
      const idOrName = r.artist
      const isSpotify = looksLikeSpotifyId(idOrName)
      const enriched = isSpotify ? images[idOrName] : null
      return {
        id: idOrName,
        name: enriched?.name || idOrName,
        imageUrl: enriched?.imageUrl || null,
        genres: enriched?.genres || [],
        count: Number(r.plays),
      }
    })

    return NextResponse.json({ range, source: source || 'all', items })
  } catch (e) {
    console.error('top-artists error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
