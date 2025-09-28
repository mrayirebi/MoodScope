import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSpotifyAccessToken, spotifyApi } from '@/lib/spotify'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id

    const accessToken = await getSpotifyAccessToken()

    // Get recent plays
    const recentPlays = await spotifyApi('/me/player/recently-played?limit=50', accessToken)

    const trackIds = new Set<string>()
    for (const item of recentPlays.items) {
      trackIds.add(item.track.id)
    }

    // Fetch audio features in batches
    const features: any[] = []
    const ids = Array.from(trackIds)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const batchFeatures = await spotifyApi(`/audio-features?ids=${batch.join(',')}`, accessToken)
      features.push(...batchFeatures.audio_features)
    }

    // Process tracks and features
    await prisma.$transaction(async (tx) => {
      for (const item of recentPlays.items) {
        const track = item.track

        // Upsert track
        const dbTrack = await tx.track.upsert({
          where: { spotifyId: track.id },
          update: {},
          create: {
            name: track.name,
            artistIds: track.artists.map((a: any) => a.id),
            spotifyId: track.id,
            durationMs: track.duration_ms,
          },
        })

        // Upsert audio features
        const feature = features.find((f: any) => f.id === track.id)
        if (feature) {
          await tx.audioFeature.upsert({
            where: { trackId: dbTrack.id },
            update: {},
            create: {
              trackId: dbTrack.id,
              valence: feature.valence,
              energy: feature.energy,
              tempo: feature.tempo,
              danceability: feature.danceability,
              acousticness: feature.acousticness,
              speechiness: feature.speechiness,
              mode: feature.mode,
              loudness: feature.loudness,
            },
          })
        }

        // Create play
        await tx.play.upsert({
          where: {
            userId_trackId_playedAt: {
              userId: userId,
              trackId: dbTrack.id,
              playedAt: new Date(item.played_at),
            },
          },
          update: {},
          create: {
            userId: userId,
            trackId: dbTrack.id,
            playedAt: new Date(item.played_at),
            msPlayed: track.duration_ms, // Assume full play
            source: 'oauth',
          },
        })
      }
    })

    return NextResponse.json({ message: 'Synced recent plays' })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}