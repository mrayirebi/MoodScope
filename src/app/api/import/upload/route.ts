import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { streamingHistorySchema } from '@/lib/schemas'
import { ZodError } from 'zod'
import { classifyEmotion, calculateMoodScore, type AudioFeatures } from '@/lib/emotion'
import { classifyEmotionCategory } from '@/lib/emotion_v3'
import { aiEnabled, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

// Mock audio features generator based on track/artist names
function generateMockFeatures(trackName: string, artistName: string): AudioFeatures {
  const text = `${trackName} ${artistName}`.toLowerCase()
  
  // Base features
  let valence = 0.5
  let energy = 0.5
  let tempo = 120
  let danceability = 0.5
  let acousticness = 0.5
  let speechiness = 0.1
  let mode = 1

  // Adjust based on keywords
  if (text.includes('happy') || text.includes('joy') || text.includes('excited')) {
    valence = 0.8
    energy = 0.7
  } else if (text.includes('calm') || text.includes('peace') || text.includes('tranquil')) {
    valence = 0.7
    energy = 0.3
  } else if (text.includes('sad') || text.includes('melancholy') || text.includes('heartbreak')) {
    valence = 0.2
    energy = 0.3
  } else if (text.includes('angry') || text.includes('intense') || text.includes('rebellious')) {
    valence = 0.3
    energy = 0.8
  }

  return {
    valence: Math.max(0, Math.min(1, valence + (Math.random() - 0.5) * 0.2)),
    energy: Math.max(0, Math.min(1, energy + (Math.random() - 0.5) * 0.2)),
    tempo: tempo + (Math.random() - 0.5) * 40,
    danceability: Math.max(0, Math.min(1, danceability + (Math.random() - 0.5) * 0.2)),
    acousticness: Math.max(0, Math.min(1, acousticness + (Math.random() - 0.5) * 0.2)),
    speechiness: Math.max(0, Math.min(1, speechiness + (Math.random() - 0.5) * 0.2)),
    mode: Math.random() > 0.5 ? 1 : 0
  }
}

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

  const aiParam = (request.nextUrl.searchParams.get('ai') as 'auto'|'only'|'off'|null) || 'auto'
  const allowAI = aiParam !== 'off'
  const requireAI = aiParam === 'only'

  const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const data = JSON.parse(text)

    const validatedData = streamingHistorySchema.parse(data)

    // Filter out entries without track info
    const tracks = validatedData.filter(
      (entry) => {
        // Basic format
        if (entry.endTime && entry.artistName && entry.trackName && entry.msPlayed) {
          return true
        }
        // Extended format
        if (entry.ts && entry.master_metadata_track_name && entry.ms_played) {
          return true
        }
        return false
      }
    )

    // Dedupe and normalize
    const uniquePlays = new Map<string, any>()
    for (const play of tracks) {
      let key: string
      let normalizedPlay: any

      if (play.endTime) {
        // Basic format
        key = `${play.endTime}-${play.spotifyTrackUri || play.trackName}`
        normalizedPlay = {
          playedAt: new Date(play.endTime),
          trackName: play.trackName,
          artistName: play.artistName,
          msPlayed: play.msPlayed,
          spotifyTrackUri: play.spotifyTrackUri,
        }
      } else {
        // Extended format
        key = `${play.ts}-${play.spotify_track_uri || play.master_metadata_track_name}`
        normalizedPlay = {
          playedAt: new Date(play.ts!),
          trackName: play.master_metadata_track_name!,
          artistName: play.master_metadata_album_artist_name,
          msPlayed: play.ms_played!,
          spotifyTrackUri: play.spotify_track_uri,
        }
      }

      if (!uniquePlays.has(key)) {
        uniquePlays.set(key, normalizedPlay)
      }
    }

    const plays = Array.from(uniquePlays.values())

    let createdPlays = 0
    let createdEmotions = 0
    let skippedPlays = 0

    // Process plays idempotently and continue on per-item errors
    const accessToken = await getUserSpotifyAccessToken(userId).catch(() => null)
    for (const play of plays) {
      try {
        // Upsert track
        const spotifyId = play.spotifyTrackUri || `local:${play.artistName}:${play.trackName}`
        const track = await prisma.track.upsert({
          where: { spotifyId: spotifyId },
          update: {},
          create: {
            name: play.trackName,
            artistIds: play.artistName ? [play.artistName] : [],
            spotifyId: spotifyId,
            durationMs: 0,
          },
        })

        // Find or create play using compound unique key
        const existingPlay = await prisma.play.findUnique({
          where: {
            userId_trackId_playedAt: {
              userId: userId,
              trackId: track.id,
              playedAt: play.playedAt,
            },
          },
        })

        const playRecord = existingPlay
          ? existingPlay
          : await prisma.play.create({
              data: {
                userId: userId,
                trackId: track.id,
                playedAt: play.playedAt,
                msPlayed: play.msPlayed,
                source: 'upload',
              },
            })

        if (!existingPlay) createdPlays += 1

        // Ensure there is an emotion for this play
        const existingEmotion = await prisma.emotion.findUnique({ where: { playId: playRecord.id } })
        if (!existingEmotion) {
          let features = generateMockFeatures(play.trackName, play.artistName || '')
          // If we have a Spotify ID and token, try to fetch real audio features to improve accuracy
          if (accessToken && play.spotifyTrackUri && play.spotifyTrackUri.startsWith('spotify:track:')) {
            try {
              const id = play.spotifyTrackUri.split(':').pop()!
              const afRes = await fetch(`https://api.spotify.com/v1/audio-features/${id}` , {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (afRes.ok) {
                const f = await afRes.json()
                features = {
                  valence: typeof f.valence === 'number' ? f.valence : features.valence,
                  energy: typeof f.energy === 'number' ? f.energy : features.energy,
                  tempo: typeof f.tempo === 'number' ? f.tempo : features.tempo,
                  danceability: typeof f.danceability === 'number' ? f.danceability : features.danceability,
                  acousticness: typeof f.acousticness === 'number' ? f.acousticness : features.acousticness,
                  speechiness: typeof f.speechiness === 'number' ? f.speechiness : features.speechiness,
                  mode: typeof f.mode === 'number' ? f.mode : features.mode,
                }
                // Persist for future runs
                try {
                  await prisma.audioFeature.upsert({
                    where: { trackId: track.id },
                    create: {
                      trackId: track.id,
                      valence: features.valence,
                      energy: features.energy,
                      tempo: features.tempo,
                      danceability: features.danceability,
                      acousticness: features.acousticness,
                      speechiness: features.speechiness,
                      mode: features.mode,
                      loudness: typeof f.loudness === 'number' ? f.loudness : -10,
                    },
                    update: {
                      valence: features.valence,
                      energy: features.energy,
                      tempo: features.tempo,
                      danceability: features.danceability,
                      acousticness: features.acousticness,
                      speechiness: features.speechiness,
                      mode: features.mode,
                      loudness: typeof f.loudness === 'number' ? f.loudness : -10,
                    },
                  })
                } catch {}
              }
            } catch {}
          }
          // Compute v3 valence–arousal classification
          const v3 = classifyEmotionCategory({
            valence: features.valence,
            energy: features.energy,
            danceability: features.danceability,
            acousticness: features.acousticness,
            speechiness: features.speechiness,
            tempo: features.tempo,
            loudness: features.loudness,
            mode: features.mode,
            duration_ms: 0,
          })
          let category = v3.category
          let moodScore = v3.mood
          if (allowAI && aiEnabled()) {
            try {
              const aiRaw = await classifyEmotionAI({
                trackName: play.trackName,
                artists: play.artistName ? [play.artistName] : [],
                features: {
                  valence: features.valence,
                  energy: features.energy,
                  danceability: features.danceability,
                  speechiness: features.speechiness,
                  acousticness: features.acousticness,
                  tempo: features.tempo,
                  mode: features.mode,
                },
              }, { timeoutMs: 5000 })
              const ai = reconcileAIWithV2(aiRaw, { valence: features.valence, energy: features.energy })
              if (ai?.category && ai.category !== 'Neutral') category = ai.category
              else if (requireAI && (!ai || !ai.category)) continue
              if (typeof ai?.moodScore === 'number') moodScore = Math.max(0, Math.min(1, ai.moodScore))
            } catch {}
          }
          // Try to persist v3 enrichment fields if available (DB migration may not be applied yet)
          try {
            await prisma.emotion.create({
              data: {
                playId: playRecord.id,
                category,
                moodScore,
                label: v3.label,
                valence: v3.valence,
                arousal: v3.arousal,
                confidence: v3.confidence,
              } as any,
            })
          } catch {
            // Fallback to minimal shape if columns don't exist yet
            await prisma.emotion.create({
              data: {
                playId: playRecord.id,
                category,
                moodScore,
              },
            })
          }
          createdEmotions += 1
        }
      } catch (e) {
        // Skip problematic entry but continue processing the rest
        skippedPlays += 1
        console.error('Upload item error:', e)
      }
    }

    return NextResponse.json({ message: `Processed ${plays.length} plays`, createdPlays, createdEmotions, skippedPlays })
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Upload validation error:', error.issues)
      return NextResponse.json({ error: 'Invalid file format', details: error.issues }, { status: 400 })
    }
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}