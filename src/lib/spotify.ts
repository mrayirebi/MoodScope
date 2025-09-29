import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function getSpotifyAccessToken() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    throw new Error('No access token')
  }
  return session.accessToken as string
}

export async function spotifyApi(endpoint: string, accessToken: string) {
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`)
  }

  return response.json()
}

// Centralized helper to retrieve (and refresh) a user's Spotify access token from DB
export async function getUserSpotifyAccessToken(userId: string) {
  const accRows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT id, access_token, expires_at, refresh_token
      FROM accounts
      WHERE "userId" = ${userId} AND provider = 'spotify'
      LIMIT 1
    `
  ) as Array<{ id: string, access_token: string | null, expires_at: number | null, refresh_token: string | null }>
  const acc = accRows?.[0]
  if (!acc) return null

  const nowSec = Math.floor(Date.now() / 1000)
  const isExpired = acc.expires_at ? acc.expires_at <= nowSec + 60 : false
  let accessToken = acc.access_token || null

  if ((!accessToken || isExpired) && acc.refresh_token) {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    if (clientId && clientSecret) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const params = new URLSearchParams()
      params.set('grant_type', 'refresh_token')
      params.set('refresh_token', acc.refresh_token)
      const resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      })
      if (resp.ok) {
        const j = await resp.json()
        accessToken = j.access_token
        const expiresIn = typeof j.expires_in === 'number' ? j.expires_in : 3600
        const newExpiresAt = Math.floor(Date.now() / 1000) + expiresIn
        try {
          await prisma.$executeRaw(
            Prisma.sql`UPDATE accounts SET access_token = ${accessToken}, expires_at = ${newExpiresAt} WHERE id = ${acc.id}`
          )
        } catch {}
      }
    }
  }

  return accessToken
}