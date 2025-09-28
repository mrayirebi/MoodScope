import { NextAuthOptions } from 'next-auth'
import SpotifyProvider from 'next-auth/providers/spotify'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
  }
  interface User {
    id: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'user-read-recently-played user-library-read user-top-read',
        },
      },
    }),
  ],
  callbacks: {
    session: async ({ session, token }) => {
      if (session?.user) {
        (session.user as any).id = token.sub!
        session.accessToken = token.accessToken as string
      }
      return session
    },
    jwt: async ({ user, token, account }) => {
      if (user) {
        token.sub = user.id
      }
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
  },
}