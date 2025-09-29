import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotion, calculateMoodScore, type AudioFeatures } from '@/lib/emotion'
import { aiEnabled, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'
import { promises as fs } from 'fs'
import path from 'path'

// Mock audio features generator based on track/artist names (same as upload)
function generateMockFeatures(trackName: string, artistName: string): AudioFeatures {
  const text = `${trackName} ${artistName}`.toLowerCase()

  let valence = 0.5
  let energy = 0.5
  let tempo = 120
  let danceability = 0.5
  let acousticness = 0.5
  let speechiness = 0.1
  let mode = 1

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
    mode: Math.random() > 0.5 ? 1 : 0,
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

  const samplePath = path.join(process.cwd(), 'sample_streaming_history.json')
    const fileContent = await fs.readFile(samplePath, 'utf-8').catch(() => null)
    if (!fileContent) {
      return NextResponse.json({ error: 'Sample file not found' }, { status: 404 })
    }

    let data: any
    try {
      data = JSON.parse(fileContent)
    } catch {
      return NextResponse.json({ error: 'Invalid sample file JSON' }, { status: 400 })
    }

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Sample file must be an array' }, { status: 400 })
    }

    // Support both basic and extended formats
    const tracks = data.filter((entry: any) => {
      if (entry.endTime && entry.artistName && entry.trackName && entry.msPlayed) return true
      if (entry.ts && entry.master_metadata_track_name && entry.ms_played) return true
      return false
    })

    const uniquePlays = new Map<string, any>()
    for (const play of tracks) {
      let key: string
      let normalized: any
      if (play.endTime) {
        key = `${play.endTime}-${play.spotifyTrackUri || play.trackName}`
        normalized = {
          playedAt: new Date(play.endTime),
          trackName: play.trackName,
          artistName: play.artistName,
          msPlayed: play.msPlayed,
          spotifyTrackUri: play.spotifyTrackUri,
        }
      } else {
        key = `${play.ts}-${play.spotify_track_uri || play.master_metadata_track_name}`
        normalized = {
          playedAt: new Date(play.ts),
          trackName: play.master_metadata_track_name,
          artistName: play.master_metadata_album_artist_name,
          msPlayed: play.ms_played,
          spotifyTrackUri: play.spotify_track_uri,
        }
      }
      if (!uniquePlays.has(key)) uniquePlays.set(key, normalized)
    }

    const plays = Array.from(uniquePlays.values())

    // Introduce import-level mood profile bias to vary distributions across runs
    type MoodProfile = {
      name: string
      valenceDelta: number
      energyDelta: number
      tempoDelta: number
      speechinessDelta: number
    }
    const profiles: MoodProfile[] = [
      { name: 'Upbeat', valenceDelta: 0.08, energyDelta: 0.06, tempoDelta: 8, speechinessDelta: -0.02 },
      { name: 'Chill', valenceDelta: 0.04, energyDelta: -0.08, tempoDelta: -10, speechinessDelta: -0.01 },
      { name: 'Moody', valenceDelta: -0.08, energyDelta: -0.04, tempoDelta: -6, speechinessDelta: 0.00 },
      { name: 'Energetic', valenceDelta: 0.02, energyDelta: 0.12, tempoDelta: 12, speechinessDelta: -0.02 },
      { name: 'Talky', valenceDelta: -0.02, energyDelta: 0.02, tempoDelta: 0, speechinessDelta: 0.06 },
    ]
    const profile = profiles[Math.floor(Math.random() * profiles.length)]

    const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

    let createdPlays = 0
    let createdEmotions = 0
    let skipped = 0
    for (const p of plays) {
      try {
        const spotifyId = p.spotifyTrackUri || `demo:${p.artistName || 'unknown'}:${p.trackName}`
        const track = await prisma.track.upsert({
          where: { spotifyId },
          update: {},
          create: {
            name: p.trackName,
            artistIds: p.artistName ? [p.artistName] : [],
            spotifyId,
            durationMs: 0,
          },
        })

        const existingPlay = await prisma.play.findUnique({
          where: {
            userId_trackId_playedAt: {
              userId,
              trackId: track.id,
              playedAt: p.playedAt,
            },
          },
        })

        const play = existingPlay
          ? existingPlay
          : await prisma.play.create({
              data: {
                userId,
                trackId: track.id,
                playedAt: p.playedAt,
                msPlayed: p.msPlayed,
                source: 'demo',
              },
            })
        if (!existingPlay) createdPlays += 1

    const existingEmotion = await prisma.emotion.findUnique({ where: { playId: play.id } })
    if (!existingEmotion) {
          // Base features from text
          let features = generateMockFeatures(p.trackName, p.artistName || '')

          // Day-of-week bias to make distribution vary within a dataset
          const dow = new Date(p.playedAt).getDay() // 0-6 Sun-Sat
          let dayValence = 0, dayEnergy = 0
          switch (dow) {
            case 5: /* Fri */ dayValence = 0.10; dayEnergy = 0.10; break
            case 6: /* Sat */ dayValence = 0.08; dayEnergy = 0.06; break
            case 0: /* Sun */ dayValence = 0.05; dayEnergy = -0.02; break
            case 1: /* Mon */ dayValence = -0.06; dayEnergy = 0.04; break
            case 2: /* Tue */ dayValence = -0.03; dayEnergy = 0.02; break
            case 3: /* Wed */ dayValence = 0.00; dayEnergy = -0.04; break
            case 4: /* Thu */ dayValence = 0.03; dayEnergy = 0.00; break
          }

          // Apply import-level profile and day-of-week deltas
          features = {
            ...features,
            valence: clamp01(features.valence + profile.valenceDelta + dayValence + (Math.random() - 0.5) * 0.05),
            energy: clamp01(features.energy + profile.energyDelta + dayEnergy + (Math.random() - 0.5) * 0.05),
            tempo: features.tempo + profile.tempoDelta + (Math.random() - 0.5) * 6,
            speechiness: clamp01(features.speechiness + profile.speechinessDelta + (Math.random() - 0.5) * 0.02),
            danceability: clamp01(features.danceability + (Math.random() - 0.5) * 0.04),
            acousticness: clamp01(features.acousticness + (Math.random() - 0.5) * 0.04),
          }

          // Small chance to flip mode to influence mood subtly
          if (Math.random() < 0.15) features.mode = features.mode === 1 ? 0 : 1

          let category = classifyEmotion(features)
          let moodScore = calculateMoodScore(features)
          if (allowAI && aiEnabled()) {
            try {
              const aiRaw = await classifyEmotionAI({
                trackName: p.trackName,
                artists: p.artistName ? [p.artistName] : [],
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
              if (ai?.category) category = ai.category
              else if (requireAI) { continue }
              if (typeof ai?.moodScore === 'number') moodScore = Math.max(0, Math.min(1, ai.moodScore))
            } catch {}
          }
          await prisma.emotion.create({ data: { playId: play.id, category, moodScore } })
          createdEmotions += 1
        }
      } catch (e) {
        console.error('Demo import item error:', e)
        skipped += 1
      }
    }

    return NextResponse.json({ message: `Imported demo data`, createdPlays, createdEmotions, skipped })
  } catch (error) {
    console.error('Demo import error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
