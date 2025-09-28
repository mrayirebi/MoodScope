import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { streamingHistorySchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const data = JSON.parse(text)

    const validatedData = streamingHistorySchema.parse(data)

    // Filter out non-track entries (episodes, etc.)
    const tracks = validatedData.filter(
      (entry) => entry.master_metadata_track_name && entry.spotify_track_uri
    )

    // Dedupe by ts and spotify_track_uri
    const uniquePlays = new Map<string, typeof tracks[0]>()
    for (const play of tracks) {
      const key = `${play.ts}-${play.spotify_track_uri}`
      if (!uniquePlays.has(key)) {
        uniquePlays.set(key, play)
      }
    }

    const plays = Array.from(uniquePlays.values())

    // Process in batches
    const batchSize = 100
    for (let i = 0; i < plays.length; i += batchSize) {
      const batch = plays.slice(i, i + batchSize)

      await prisma.$transaction(async (tx) => {
        for (const play of batch) {
          // Upsert track
          const track = await tx.track.upsert({
            where: { spotifyId: play.spotify_track_uri! },
            update: {},
            create: {
              name: play.master_metadata_track_name!,
              artistIds: [], // TODO: extract from URI or fetch
              spotifyId: play.spotify_track_uri!,
              durationMs: 0, // TODO: fetch from Spotify
            },
          })

          // Create play
          await tx.play.create({
            data: {
              userId: userId,
              trackId: track.id,
              playedAt: new Date(play.ts),
              msPlayed: play.ms_played,
              source: 'upload',
            },
          })
        }
      })
    }

    return NextResponse.json({ message: `Imported ${plays.length} plays` })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}