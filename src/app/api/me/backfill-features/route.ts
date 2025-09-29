import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const url = new URL(req.url)
    const daysParam = parseInt(url.searchParams.get('days') || '180', 10)
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 180

    const token = await getUserSpotifyAccessToken(userId).catch(() => null)
    if (!token) return NextResponse.json({ error: 'Missing Spotify token' }, { status: 401 })

    // Collect distinct trackIds the user listened to in the window
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const plays = await prisma.play.findMany({
      where: { userId, playedAt: { gte: cutoff } },
      select: { trackId: true },
    })
    const trackIdSet = new Set(plays.map(p => p.trackId))
    if (trackIdSet.size === 0) return NextResponse.json({ message: 'No recent plays', updated: 0 })

    // Find tracks missing audio features
    const tracks = await prisma.track.findMany({
      where: { id: { in: Array.from(trackIdSet) }, audioFeature: { is: null } },
      select: { id: true, spotifyId: true },
    })
    const missing = tracks.filter(t => typeof t.spotifyId === 'string' && /^[0-9A-Za-z]{22}$/.test(t.spotifyId))
    if (missing.length === 0) return NextResponse.json({ message: 'No tracks missing features', updated: 0 })

    // Fetch audio features in batches of up to 100
    let updated = 0
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100)
      const ids = batch.map(t => t.spotifyId)
      try {
        const res = await fetch(`https://api.spotify.com/v1/audio-features?ids=${ids.join(',')}` , {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) continue
        const j = await res.json()
        const feats = (j.audio_features || []) as Array<any>
        for (const f of feats) {
          if (!f?.id) continue
          const t = batch.find(bt => bt.spotifyId === f.id)
          if (!t) continue
          try {
            await prisma.audioFeature.upsert({
              where: { trackId: t.id },
              create: {
                trackId: t.id,
                valence: f.valence ?? 0.5,
                energy: f.energy ?? 0.5,
                tempo: f.tempo ?? 120,
                danceability: f.danceability ?? 0.5,
                acousticness: f.acousticness ?? 0.5,
                speechiness: f.speechiness ?? 0.1,
                mode: typeof f.mode === 'number' ? f.mode : 1,
                loudness: typeof f.loudness === 'number' ? f.loudness : -10,
              },
              update: {
                valence: f.valence ?? 0.5,
                energy: f.energy ?? 0.5,
                tempo: f.tempo ?? 120,
                danceability: f.danceability ?? 0.5,
                acousticness: f.acousticness ?? 0.5,
                speechiness: f.speechiness ?? 0.1,
                mode: typeof f.mode === 'number' ? f.mode : 1,
                loudness: typeof f.loudness === 'number' ? f.loudness : -10,
              },
            })
            updated += 1
          } catch {}
        }
      } catch {}
    }

    return NextResponse.json({ message: 'Backfilled audio features', updated, windowDays: days })
  } catch (e) {
    console.error('backfill-features error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
