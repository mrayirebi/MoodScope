import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classifyEmotion, calculateMoodScore, type AudioFeatures } from '@/lib/emotion'
import { aiEnabled, classifyEmotionAI, reconcileAIWithV2 } from '@/lib/ai'

function randomBetween(min: number, max: number) { return Math.random() * (max - min) + min }
function pick<T>(arr: T[]) { return arr[Math.floor(Math.random()*arr.length)] }

function genFeaturesForCategory(cat: string): AudioFeatures {
  const presets: Record<string, Partial<AudioFeatures>> = {
    'Excited/Happy': { valence: 0.85, energy: 0.7, tempo: 130 },
    'Calm/Content': { valence: 0.75, energy: 0.3, tempo: 90 },
    'Sad/Melancholic': { valence: 0.25, energy: 0.35, tempo: 85 },
    'Tense/Angry': { valence: 0.3, energy: 0.85, tempo: 140 },
    'Neutral': { valence: 0.5, energy: 0.5, tempo: 120 },
  }
  const p = presets[cat] || presets['Neutral']
  return {
    valence: Math.max(0, Math.min(1, (p.valence ?? 0.5) + (Math.random()-0.5)*0.2)),
    energy: Math.max(0, Math.min(1, (p.energy ?? 0.5) + (Math.random()-0.5)*0.2)),
    tempo: (p.tempo ?? 120) + (Math.random()-0.5)*20,
    danceability: Math.max(0, Math.min(1, 0.5 + (Math.random()-0.5)*0.3)),
    acousticness: Math.max(0, Math.min(1, 0.4 + (Math.random()-0.5)*0.3)),
    speechiness: Math.max(0, Math.min(1, 0.1 + (Math.random()-0.5)*0.1)),
    mode: Math.random() > 0.5 ? 1 : 0,
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id as string
    const url = new URL(req.url)
    const aiParam = (url.searchParams.get('ai') as 'auto'|'only'|'off'|null) || 'auto'
    const allowAI = aiParam !== 'off'
    const requireAI = aiParam === 'only'

    const categories = ['Excited/Happy','Calm/Content','Sad/Melancholic','Tense/Angry','Neutral']
    const start = new Date(); start.setMonth(start.getMonth()-3); start.setDate(1)
    const end = new Date()

    let createdPlays = 0
    let createdEmotions = 0

    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
      // 0-5 plays per day
      const playsToday = Math.floor(Math.random()*6)
      for (let i=0;i<playsToday;i++) {
        const cat = pick(categories)
        const features = genFeaturesForCategory(cat)
        const playedAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(Math.random()*24), Math.floor(Math.random()*60))
        const artist = pick(['Nova Pulse','Velvet Echo','Crimson Tide','Azure Sky','Golden Beam'])
        const trackName = `${cat.split('/')[0]} Track ${Math.floor(Math.random()*1000)}`
        const spotifyId = `demo-rich:${artist}:${trackName}`

        const track = await prisma.track.upsert({
          where: { spotifyId },
          update: {},
          create: { name: trackName, artistIds: [artist], spotifyId, durationMs: Math.floor(randomBetween(120000, 300000)) },
        })

        const existing = await prisma.play.findUnique({ where: { userId_trackId_playedAt: { userId, trackId: track.id, playedAt } } })
        const play = existing ?? await prisma.play.create({ data: { userId, trackId: track.id, playedAt, msPlayed: Math.floor(randomBetween(60000, track.durationMs)), source: 'demo-rich' } })
        if (!existing) createdPlays++

        const emotion = await prisma.emotion.findUnique({ where: { playId: play.id } })
        if (!emotion) {
          const category = classifyEmotion(features)
          let moodScore = calculateMoodScore(features)
          let finalCategory = category
          if (allowAI && aiEnabled()) {
            try {
              const aiRaw = await classifyEmotionAI({
                trackName: trackName,
                artists: [artist],
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
              if (ai?.category) finalCategory = ai.category
              else if (requireAI) { continue }
              if (typeof ai?.moodScore === 'number') moodScore = Math.max(0, Math.min(1, ai.moodScore))
            } catch {}
          }
          await prisma.emotion.create({ data: { playId: play.id, category: finalCategory, moodScore } })
          createdEmotions++
        }
      }
    }

    return NextResponse.json({ message: 'Rich demo data generated', createdPlays, createdEmotions })
  } catch (e) {
    console.error('demo-rich error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
