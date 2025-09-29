import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { classifyEmotionCategory } from '@/lib/emotion_v3'
import { aiEnabled, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'
import { getUserSpotifyAccessToken } from '@/lib/spotify'


type RecentlyPlayedItem = {
  played_at: string
  track: {
    id: string
    name: string
    duration_ms: number
    artists: { id: string; name: string }[]
  }
}

export async function POST(req: Request) {
  try {
  const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

  const url = new URL(req.url)
  const aiParam = (url.searchParams.get('ai') as 'auto'|'only'|'off'|null) || 'auto'
  const allowAI = aiParam !== 'off'
  const requireAI = aiParam === 'only'

  const token = await getUserSpotifyAccessToken(userId)
    if (!token) return NextResponse.json({ error: 'Missing Spotify token' }, { status: 401 })

    // Fetch recently played (last 50)
    const rpRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!rpRes.ok) {
      const txt = await rpRes.text()
      console.error('Spotify recently played error', rpRes.status, txt)
      return NextResponse.json({ error: 'Spotify API error' }, { status: 502 })
    }
    const rpJson = await rpRes.json()
    const items: RecentlyPlayedItem[] = rpJson.items || []

    if (items.length === 0) {
      return NextResponse.json({ message: 'No recent plays to import', imported: 0 })
    }

    // Upsert tracks
    const uniqueTracks = new Map<string, RecentlyPlayedItem['track']>()
    for (const it of items) uniqueTracks.set(it.track.id, it.track)

    const existingTracks = await prisma.track.findMany({
      where: { spotifyId: { in: Array.from(uniqueTracks.keys()) } },
      select: { id: true, spotifyId: true },
    })
    const existingMap = new Map(existingTracks.map(t => [t.spotifyId, t.id]))

    const toCreate = Array.from(uniqueTracks.values()).filter(t => !existingMap.has(t.id))
    if (toCreate.length > 0) {
      await prisma.track.createMany({
        data: toCreate.map(t => ({
          name: t.name,
          artistIds: t.artists.map(a => a.id),
          spotifyId: t.id,
          durationMs: t.duration_ms,
        })),
        skipDuplicates: true,
      })
    }

    // Reload ids for all involved tracks
    const allTracks = await prisma.track.findMany({
      where: { spotifyId: { in: Array.from(uniqueTracks.keys()) } },
      select: { id: true, spotifyId: true },
    })
    const trackIdBySpotify = new Map(allTracks.map(t => [t.spotifyId, t.id]))

    // Fetch and upsert audio features in batches of up to 100
    const spotifyIds = Array.from(uniqueTracks.keys())
    for (let i = 0; i < spotifyIds.length; i += 100) {
      const batch = spotifyIds.slice(i, i + 100)
      const afRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!afRes.ok) continue
      const afJson = await afRes.json()
      const features = (afJson.audio_features || []).filter((x: any) => !!x)
      for (const f of features) {
        const trackId = trackIdBySpotify.get(f.id)
        if (!trackId) continue
        try {
          await prisma.audioFeature.upsert({
            where: { trackId },
            create: {
              trackId,
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
        } catch (e) {
          console.warn('audio feature upsert failed', e)
        }
      }
    }

    // Enrich metadata from Spotify tracks and artists endpoints
    type EnrichedTrack = {
      spotifyId: string
      name: string
      duration_ms: number
      popularity?: number
      explicit?: boolean
      preview_url?: string | null
      album?: { id?: string; name?: string; release_date?: string; image?: string | null }
      artists?: Array<{ id: string; name: string; genres?: string[]; image?: string | null }>
    }
    const enrichedMap = new Map<string, EnrichedTrack>()
    // Batch fetch track details (max 50 per request)
    for (let i = 0; i < spotifyIds.length; i += 50) {
      const batch = spotifyIds.slice(i, i + 50)
      try {
        const r = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!r.ok) continue
        const j = await r.json()
        const arr = (j.tracks || []) as Array<any>
        for (const tr of arr) {
          if (!tr?.id) continue
          enrichedMap.set(tr.id, {
            spotifyId: tr.id,
            name: tr.name,
            duration_ms: tr.duration_ms,
            popularity: tr.popularity,
            explicit: tr.explicit,
            preview_url: tr.preview_url ?? null,
            album: {
              id: tr.album?.id,
              name: tr.album?.name,
              release_date: tr.album?.release_date,
              image: tr.album?.images?.[1]?.url || tr.album?.images?.[0]?.url || null,
            },
            artists: Array.isArray(tr.artists) ? tr.artists.map((a: any) => ({ id: a.id, name: a.name })) : [],
          })
        }
      } catch {}
    }
    // Collect artist IDs and enrich genres/images
    const artistIdSet = new Set<string>()
    Array.from(enrichedMap.values()).forEach((et) => {
      (et.artists || []).forEach((a) => { if (a?.id) artistIdSet.add(a.id) })
    })
    const artistIds = Array.from(artistIdSet)
    const artistInfo = new Map<string, { name?: string; genres?: string[]; image?: string | null }>()
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50)
      try {
        const r = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!r.ok) continue
        const j = await r.json()
        const arr = (j.artists || []) as Array<any>
        for (const a of arr) {
          artistInfo.set(a.id, {
            name: a.name,
            genres: Array.isArray(a.genres) ? a.genres : [],
            image: a.images?.[1]?.url || a.images?.[0]?.url || null,
          })
        }
      } catch {}
    }
    // Attach artist genres/images to enriched tracks
    Array.from(enrichedMap.values()).forEach((et) => {
      et.artists = (et.artists || []).map((a: { id: string; name: string }) => ({
        id: a.id,
        name: a.name,
        genres: artistInfo.get(a.id)?.genres || [],
        image: artistInfo.get(a.id)?.image || null,
      }))
    })

    // Best-effort: persist some commonly useful metadata if schema supports it
    Array.from(enrichedMap.entries()).forEach(async ([sid, et]) => {
      const id = trackIdBySpotify.get(sid)
      if (!id) return
      try {
        await prisma.track.update({
          where: { id },
          // These fields may not exist in schema; cast and ignore errors if not mapped
          data: {
            // Suggested future schema fields on Track:
            // albumId, albumName, albumImageUrl, releaseDate, popularity, explicit, previewUrl
            ...(et.album?.id ? { albumId: et.album.id } : {}),
            ...(et.album?.name ? { albumName: et.album.name } : {}),
            ...(et.album?.image ? { albumImageUrl: et.album.image } : {}),
            ...(et.album?.release_date ? { releaseDate: new Date(et.album.release_date) as any } : {}),
            ...(typeof et.popularity === 'number' ? { popularity: et.popularity } : {}),
            ...(typeof et.explicit === 'boolean' ? { explicit: et.explicit } : {}),
            ...(typeof et.preview_url === 'string' ? { previewUrl: et.preview_url } : {}),
          } as any,
        })
      } catch {
        // Swallow if columns are not present
      }
    })

    // Build play rows
    const playsData = items.map(it => ({
      userId,
      trackId: trackIdBySpotify.get(it.track.id)!,
      playedAt: new Date(it.played_at),
      msPlayed: it.track.duration_ms,
      source: 'oauth' as const,
    })).filter(p => !!p.trackId)

    if (playsData.length) {
      await prisma.play.createMany({ data: playsData as any, skipDuplicates: true })
    }

    // Generate emotions for any plays (recent or existing) missing them
    const missing = await prisma.play.findMany({
      where: { userId, emotion: { is: null } },
      include: { track: { include: { audioFeature: true } } },
      take: 1000,
      orderBy: { playedAt: 'desc' },
    })

    let createdEmotions = 0
    for (const p of missing) {
    const af = p.track.audioFeature
      const valence = af?.valence ?? 0.5
      const energy = af?.energy ?? 0.5
  const danceability = af?.danceability ?? 0.5
  const speechiness = af?.speechiness ?? 0.1
  const tempo = af?.tempo ?? 120
  const acousticness = af?.acousticness ?? 0.5
  const mode = typeof af?.mode === 'number' ? af!.mode : 1
  const v3 = classifyEmotionCategory({ valence, energy, danceability, acousticness, speechiness, tempo, loudness: af?.loudness, mode, duration_ms: p.track.durationMs as any })
  let category = v3.category
  let moodScore = v3.mood
      if (allowAI && aiEnabled()) {
        try {
          const aiRaw = await classifyEmotionAI({
            trackName: p.track.name,
            artists: (p.track as any).artistIds || [],
            features: { valence, energy, danceability, speechiness, tempo, acousticness, mode },
          }, { timeoutMs: 5000 })
          const ai = reconcileAIWithV2(aiRaw, { valence, energy })
          if (ai?.category && ai.category !== 'Neutral') category = ai.category
          else if (requireAI && (!ai || !ai.category)) continue // skip if AI required and no result
          if (typeof ai?.moodScore === 'number') moodScore = Math.max(0, Math.min(1, ai.moodScore))
        } catch {}
      }
      try {
        await prisma.emotion.create({
          data: {
            playId: p.id,
            category,
            moodScore,
            label: v3.label,
            valence: v3.valence,
            arousal: v3.arousal,
            confidence: v3.confidence,
          } as any,
        })
        createdEmotions += 1
      } catch (e) {
        // Fallback if migration not applied
        try {
          await prisma.emotion.create({ data: { playId: p.id, category, moodScore } })
          createdEmotions += 1
        } catch {}
      }
    }

    // Prepare response enrichment for immediate UI use
    const enriched = Array.from(enrichedMap.values()).map(et => ({
      spotifyId: et.spotifyId,
      name: et.name,
      duration_ms: et.duration_ms,
      popularity: et.popularity,
      explicit: et.explicit,
      preview_url: et.preview_url,
      album: et.album,
      artists: et.artists,
    }))

    return NextResponse.json({ message: 'Synced recently played', imported: playsData.length, createdEmotions, enrichedCount: enriched.length, enriched })
  } catch (e) {
    console.error('import/sync error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
