import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { aiEnabled, recommendTracksByEmotionAI } from '@/lib/ai'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!aiEnabled()) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as
      | 'Excited/Happy'
      | 'Calm/Content'
      | 'Sad/Melancholic'
      | 'Tense/Angry'
      | 'Neutral'
      | null
    const limit = Math.max(1, Math.min(20, parseInt(searchParams.get('limit') || '10')))
    if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })

    const tracks = await recommendTracksByEmotionAI(category, limit, { timeoutMs: 8000 })
    if (!tracks) return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 502 })
    return NextResponse.json({ category, tracks })
  } catch (e) {
    console.error('recommendations-ai error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
