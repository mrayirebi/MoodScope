import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as
      | 'Excited/Happy'
      | 'Calm/Content'
      | 'Sad/Melancholic'
      | 'Tense/Angry'
      | 'Neutral'
      | null
    if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })

    const windowParam = searchParams.get('window') || '60'
    const windowDays = parseInt(windowParam)
    const source = searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null

    const cutoff = new Date()
    if (!Number.isNaN(windowDays) && windowDays > 0) {
      cutoff.setDate(cutoff.getDate() - windowDays)
    } else {
      cutoff.setDate(cutoff.getDate() - 60)
    }

    // Aggregate top tracks in this category (recent window), ordered by msPlayed then count
  const rows: Array<{ trackId: string; count: number; msPlayed: number }> = await prisma.$queryRaw(Prisma.sql`
      SELECT p."trackId" as "trackId",
             COUNT(*)::int as count,
             COALESCE(SUM(p."msPlayed"), 0)::bigint as "msPlayed"
      FROM plays p
      JOIN emotions e ON e."playId" = p.id
      WHERE p."userId" = ${userId}
        AND e.category = ${category}
        AND p."playedAt" >= ${cutoff}
        ${source && source !== 'all' ? Prisma.sql`AND p.source = ${source}` : Prisma.empty}
      GROUP BY p."trackId"
      ORDER BY "msPlayed" DESC, count DESC
      LIMIT 20
    `)

    if (rows.length === 0) return NextResponse.json({ category, window: windowDays, tracks: [] })

  const trackIds = rows.map(r => r.trackId)
    const tracks = await prisma.track.findMany({
      where: { id: { in: trackIds } },
      select: { id: true, name: true, artistIds: true, spotifyId: true },
    })
    const trackById = new Map(tracks.map(t => [t.id, t]))

    // Best-effort enrich artist names via Spotify if we have valid Spotify IDs and a token
    const token = await getUserSpotifyAccessToken(userId).catch(() => null)
  let enriched: Record<string, { artists: string[]; image?: string | null; explicit?: boolean }> = {}
    if (token) {
      const spotifyTrackIds = tracks
        .map(t => t.spotifyId)
        .filter((sid): sid is string => typeof sid === 'string' && /^[0-9A-Za-z]{22}$/.test(sid))
      for (let i = 0; i < spotifyTrackIds.length; i += 50) {
        const batch = spotifyTrackIds.slice(i, i + 50)
        try {
          const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) continue
          const j = await res.json()
          const arr = (j.tracks || []) as Array<any>
          for (const tr of arr) {
            const t = tracks.find(tt => tt.spotifyId === tr.id)
            if (!t) continue
            enriched[t.id] = {
              artists: Array.isArray(tr.artists) ? tr.artists.map((a: any) => a.name) : [],
              image: tr.album?.images?.[1]?.url || tr.album?.images?.[0]?.url || null,
              explicit: typeof tr.explicit === 'boolean' ? tr.explicit : undefined,
            }
          }
        } catch {}
      }
    }

    const out = rows.map(r => {
      const t = trackById.get(r.trackId)!
      const fallbackArtists = Array.isArray(t.artistIds) && t.artistIds.length ? t.artistIds.slice(0, 2) : []
      const artists = enriched[r.trackId]?.artists || fallbackArtists
      return {
        id: t.id,
        name: t.name,
        spotifyId: t.spotifyId,
        artists,
        imageUrl: enriched[r.trackId]?.image || null,
        explicit: enriched[r.trackId]?.explicit ?? undefined,
        playCount: r.count,
        msPlayed: Number(r.msPlayed ?? 0),
      }
    })

    return NextResponse.json({ category, window: windowDays, tracks: out })
  } catch (e) {
    console.error('recommendations error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
