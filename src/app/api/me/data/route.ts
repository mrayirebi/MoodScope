import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id

    // Delete all data for the user
    await prisma.emotion.deleteMany({
      where: { play: { userId: userId } },
    })

    await prisma.play.deleteMany({
      where: { userId: userId },
    })

    // Note: Tracks and AudioFeatures are shared, so don't delete them
    // If needed, we could delete orphaned ones, but for now, keep

    return NextResponse.json({ message: 'All data deleted' })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}