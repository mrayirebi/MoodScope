import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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