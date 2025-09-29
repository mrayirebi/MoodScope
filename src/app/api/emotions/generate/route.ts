import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotionCategory } from '@/lib/emotion_v3'
import { aiEnabled, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'
import { getUserSpotifyAccessToken } from '@/lib/spotify'

function clamp01(x: number) { return Math.max(0, Math.min(1, x)) }

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id as string

  const aiParam = (new URL(req.url)).searchParams.get('ai') as 'auto'|'only'|'off'|null
    const allowAI = aiParam !== 'off'
    const requireAI = aiParam === 'only'

    // Find plays missing emotion
    const plays = await prisma.play.findMany({
      where: { userId, emotion: { is: null } },
      include: { track: { include: { audioFeature: true } } },
      take: 2000,
    })

    // Prefetch Spotify audio features for tracks missing them to avoid Neutral defaults
    const missingAf = plays
      .filter(p => !p.track.audioFeature && /^[0-9A-Za-z]{22}$/.test(p.track.spotifyId))
      .map(p => p.track.spotifyId)
    const uniqueMissing = Array.from(new Set(missingAf))
    if (uniqueMissing.length) {
      const token = await getUserSpotifyAccessToken(userId).catch(() => null)
      if (token) {
        for (let i = 0; i < uniqueMissing.length; i += 100) {
          const batch = uniqueMissing.slice(i, i + 100)
          try {
            const afRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (afRes.ok) {
              const afJson = await afRes.json()
              const arr = (afJson.audio_features || []).filter((x: any) => !!x)
              for (const f of arr) {
                try {
                  const t = await prisma.track.findUnique({ where: { spotifyId: f.id }, select: { id: true } })
                  if (!t) continue
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
                } catch {}
              }
            }
          } catch {}
        }
      }
    }

    let created = 0
    for (const p of plays) {
  // Reload latest audio features from DB to include any new upserts
  const af = p.track.audioFeature || await prisma.audioFeature.findUnique({ where: { trackId: p.track.id } })
      // Use audio features if available, else safe defaults
      const valence = af ? clamp01(af.valence) : 0.5
      const energy = af ? clamp01(af.energy) : 0.5
  const danceability = af ? clamp01(af.danceability) : 0.5
  const speechiness = af ? clamp01(af.speechiness) : 0.1
  const tempo = af ? af.tempo : 120
  const acousticness = af ? clamp01(af.acousticness) : 0.5
  const mode = af ? (typeof af.mode === 'number' ? af.mode : 1) : 1

      // Try AI classification if enabled; fallback to v2 unless AI is required
  const v3 = classifyEmotionCategory({ valence, energy, danceability, acousticness, speechiness, tempo, mode, duration_ms: p.track.durationMs as any })
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
          else if (requireAI && (!ai || !ai.category)) continue
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
      } catch {
        await prisma.emotion.create({ data: { playId: p.id, category, moodScore } })
      }
      created++
    }

    return NextResponse.json({ message: 'Emotions generated', created })
  } catch (e) {
    console.error('emotions/generate error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
