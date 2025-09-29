import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { computeArousal, classifyEmotionCategory } from '@/lib/emotion_v3'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

export async function GET(
  req: Request,
  ctx: { params: { date: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

  const url = new URL(req.url)
  const source = url.searchParams.get('source') as 'oauth' | 'upload' | 'demo' | 'demo-rich' | 'all' | null

  const dateStr = ctx.params?.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const start = new Date(dateStr + 'T00:00:00.000Z')
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)

    const plays = await prisma.play.findMany({
      where: {
        userId,
        playedAt: { gte: start, lt: end },
        ...(source && source !== 'all' ? { source } : {}),
        emotion: { isNot: null }
      },
      include: {
        emotion: true,
        track: { include: { audioFeature: true } },
      },
      orderBy: { playedAt: 'asc' },
    })

  const byEmotion = new Map<string, { count: number; tracks: Array<{ id: string; name: string; artist: string; artistId?: string }> }>()
  const artistCounts = new Map<string, number>()
    const looksLikeSpotifyId = (s: string) => /^[0-9A-Za-z]{22}$/.test(s)
    const artistIdSet = new Set<string>()
    for (const p of plays) {
      const cat = p.emotion!.category
      if (!byEmotion.has(cat)) byEmotion.set(cat, { count: 0, tracks: [] })
      const rawArtist = p.track.artistIds?.[0] || 'Unknown'
      if (looksLikeSpotifyId(rawArtist)) artistIdSet.add(rawArtist)
      const bucket = byEmotion.get(cat)!
      bucket.count += 1
      bucket.tracks.push({ id: p.track.id, name: p.track.name, artist: rawArtist, artistId: looksLikeSpotifyId(rawArtist) ? rawArtist : undefined })
      artistCounts.set(rawArtist, (artistCounts.get(rawArtist) || 0) + 1)
    }

    // Try to enrich any Spotify artist IDs to names using user's access token
    let artistNameMap: Record<string, string> = {}
    let artistImageMap: Record<string, string | null> = {}
    // For explicit flags, collect Spotify track IDs for these plays
    const trackSpotifyIdByTrackId = new Map<string, string>()
    for (const p of plays) {
      const sid = (p.track as any)?.spotifyId
      if (sid && /^[0-9A-Za-z]{22}$/.test(sid)) trackSpotifyIdByTrackId.set(p.track.id, sid)
    }
    const explicitByTrackId: Record<string, boolean> = {}
    if (artistIdSet.size > 0 || trackSpotifyIdByTrackId.size > 0) {
      const token = await getUserSpotifyAccessToken(userId).catch(() => null)
      if (token) {
        if (artistIdSet.size > 0) {
          const ids = Array.from(artistIdSet)
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
        if (trackSpotifyIdByTrackId.size > 0) {
          const sids = Array.from(new Set(Array.from(trackSpotifyIdByTrackId.values())))
          for (let i = 0; i < sids.length; i += 50) {
            const batch = sids.slice(i, i + 50)
            try {
              const resp = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (resp.ok) {
                const json: any = await resp.json()
                for (const tr of json.tracks || []) {
                  if (!tr?.id) continue
                  const explicit = !!tr.explicit
                  for (const [tid, sid] of Array.from(trackSpotifyIdByTrackId.entries())) {
                    if (sid === tr.id) explicitByTrackId[tid] = explicit
                  }
                }
              }
            } catch {}
          }
        }
      }
    }

    const breakdown = Array.from(byEmotion.entries()).map(([category, v]) => ({ category, count: v.count }))
    const tracksByEmotion: Record<string, Array<{ id: string; name: string; artist: string; artistImage?: string | null; explicit?: boolean }>> = {}
    for (const [k, v] of Array.from(byEmotion.entries())) {
      tracksByEmotion[k] = v.tracks.map(t => ({
        id: t.id,
        name: t.name,
        artist: looksLikeSpotifyId(t.artist) ? (artistNameMap[t.artist] || t.artist) : t.artist,
        artistImage: t.artistId ? (artistImageMap[t.artistId] ?? null) : undefined,
        explicit: explicitByTrackId[t.id] ?? undefined,
      }))
    }
    const topArtists = Array.from(artistCounts.entries())
      .map(([artist, count]) => ({
        artist: looksLikeSpotifyId(artist) ? (artistNameMap[artist] || artist) : artist,
        imageUrl: looksLikeSpotifyId(artist) ? (artistImageMap[artist] ?? null) : null,
        count
      }))
      .sort((a, b) => b.count - a.count)

    const debugParam = url.searchParams.get('debug')
    const debug = debugParam === '1' || debugParam === 'true'

    const isValidLabel = (s: any): s is 'Happy' | 'Calm' | 'Sad' | 'Tense' | 'Neutral' | 'Speech' => (
      s === 'Happy' || s === 'Calm' || s === 'Sad' || s === 'Tense' || s === 'Neutral' || s === 'Speech'
    )

    return NextResponse.json({
      date: dateStr,
      total: plays.length,
      breakdown,
      tracksByEmotion,
      topArtists,
      ...(debug ? {
        debug: plays.map(p => {
          const af = p.track?.audioFeature
          const f = af ? {
            valence: af.valence,
            energy: af.energy,
            danceability: af.danceability,
            acousticness: af.acousticness,
            speechiness: af.speechiness,
            tempo: af.tempo,
            loudness: af.loudness,
            mode: af.mode,
            duration_ms: p.track?.durationMs,
          } : null
          const arousal = f ? computeArousal(f) : ((p.emotion ? (p.emotion as any).arousal : null) ?? null)
          let cls = f ? classifyEmotionCategory(f) : null
          if (!cls && p.emotion) {
            // Fallback to stored emotion values if available
            const storedLabel = ((p.emotion as any).label as string | undefined) || (
              p.emotion.category === 'Excited/Happy' ? 'Happy'
              : p.emotion.category === 'Calm/Content' ? 'Calm'
              : p.emotion.category === 'Sad/Melancholic' ? 'Sad'
              : p.emotion.category === 'Tense/Angry' ? 'Tense'
              : 'Neutral'
            )
            cls = {
              label: storedLabel as any,
              category: p.emotion.category as any,
              mood: p.emotion.moodScore,
              confidence: ((p.emotion as any).confidence as number | undefined) ?? 0.5,
            } as any
          }
          // Normalize label if it looks unexpected
          const normalizedLabel = cls?.label && isValidLabel(cls.label) ? cls.label : (
            p.emotion ? (
              p.emotion.category === 'Excited/Happy' ? 'Happy'
              : p.emotion.category === 'Calm/Content' ? 'Calm'
              : p.emotion.category === 'Sad/Melancholic' ? 'Sad'
              : p.emotion.category === 'Tense/Angry' ? 'Tense'
              : 'Neutral'
            ) : (cls?.category ? (
              cls.category === 'Excited/Happy' ? 'Happy'
              : cls.category === 'Calm/Content' ? 'Calm'
              : cls.category === 'Sad/Melancholic' ? 'Sad'
              : cls.category === 'Tense/Angry' ? 'Tense'
              : 'Neutral'
            ) : 'Neutral')
          )
          return {
            playId: p.id,
            track: { id: p.track.id, name: p.track.name },
            features: f,
            arousal,
            classified: cls ? { label: normalizedLabel, category: cls.category, mood: cls.mood, confidence: cls.confidence } : null,
            stored: p.emotion ? { category: p.emotion.category, moodScore: p.emotion.moodScore } : null,
          }
        })
      } : {}),
    })
  } catch (e) {
    console.error('day breakdown error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
