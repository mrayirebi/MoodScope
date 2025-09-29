import { vi } from 'vitest'

// Mock next-auth session retrieval
vi.mock('next-auth', async () => {
  return {
    getServerSession: vi.fn(async () => ({ user: { id: 'user_1', email: 'test@example.com' } })),
  }
})

// Mock next/server NextResponse
vi.mock('next/server', async () => {
  class NextResponseMock {
    static json(data: any, init?: { status?: number }) {
      return { ok: (init?.status ?? 200) < 400, status: init?.status ?? 200, json: async () => data }
    }
  }
  return { NextResponse: NextResponseMock }
})

// Mock prisma client
vi.mock('@/lib/prisma', async () => {
  const plays: any[] = []
  const emotions: any[] = []
  return {
    prisma: {
      track: {
        upsert: vi.fn(async ({ where, create }: any) => ({ id: `track_${where.spotifyId}`, ...create })),
      },
      play: {
        count: vi.fn(async ({ where }: any) => plays.filter(p => !where || p.userId === where.userId).length),
        findUnique: vi.fn(async ({ where }: any) => plays.find(p => p.userId === where.userId_trackId_playedAt.userId && p.trackId === where.userId_trackId_playedAt.trackId && p.playedAt.getTime() === where.userId_trackId_playedAt.playedAt.getTime()) || null),
        findMany: vi.fn(async ({ where, include }: any) => plays.filter(p => (!where || p.userId === where.userId) && (!where?.emotion || where.emotion.is === null)).map(p => ({ ...p, track: { name: 'T', artistIds: ['A'] } }))),
        findFirst: vi.fn(async ({ where, orderBy, select }: any) => {
          const filtered = plays.filter(p => !where || p.userId === where.userId)
          if (!filtered.length) return null
          const sorted = filtered.sort((a, b) => orderBy.playedAt === 'asc' ? a.playedAt.getTime() - b.playedAt.getTime() : b.playedAt.getTime() - a.playedAt.getTime())
          return { playedAt: sorted[0].playedAt }
        }),
        create: vi.fn(async ({ data }: any) => { const rec = { id: `play_${plays.length+1}`, ...data }; plays.push(rec); return rec }),
        deleteMany: vi.fn(async ({ where }: any) => { const before = plays.length; for (let i=plays.length-1;i>=0;i--) if (plays[i].userId === where.userId) plays.splice(i,1); return { count: before - plays.length } }),
      },
      emotion: {
        count: vi.fn(async ({ where }: any) => emotions.filter(e => !where || emotions).length),
        findUnique: vi.fn(async ({ where }: any) => emotions.find(e => e.playId === where.playId) || null),
        create: vi.fn(async ({ data }: any) => { const rec = { id: `emo_${emotions.length+1}`, ...data }; emotions.push(rec); return rec }),
        deleteMany: vi.fn(async ({ where }: any) => { const before = emotions.length; for (let i=emotions.length-1;i>=0;i--) if (where.play.userId === undefined || true) emotions.splice(i,1); return { count: before - emotions.length } }),
        groupBy: vi.fn(async () => []),
      },
      $queryRaw: vi.fn(async () => []),
    },
  }
})
