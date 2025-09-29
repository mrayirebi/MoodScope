# MoodScope

A full-stack web app that ingests a user's Spotify listening data and produces emotion insights by day/week/month, plus interactive charts.

## Tech Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion
- **Auth**: NextAuth with Spotify OAuth
- **Backend/API**: Next.js route handlers (Node)
- **DB**: PostgreSQL + Prisma
- **Charts**: Recharts
 - Optional AI: OpenAI/Azure for enhanced emotion classification

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up PostgreSQL database
4. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `SPOTIFY_CLIENT_ID`
    - `SPOTIFY_CLIENT_SECRET`
    - Optional AI (choose one):
       - Azure OpenAI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`
       - OpenAI: `OPENAI_API_KEY` and optional `OPENAI_MODEL` (default `gpt-4o-mini`)
5. Run Prisma migrations: `npx prisma migrate dev`
6. Generate Prisma client: `npx prisma generate`
7. Run the development server: `npm run dev`

## Features

- OAuth flow to read recent plays, saved tracks, top tracks/artists from Spotify
- File upload for StreamingHistory*.json bundles
- Emotion classification based on Spotify audio features (valence, energy), with optional AI enhancement when configured
- Aggregation by day, week, month
- Interactive charts: stacked area, line chart with SMA, heatmap
- Data deletion for privacy

## API Routes

- `POST /api/import/upload` - Upload streaming history JSON
- `POST /api/import/sync` - Sync recent plays from Spotify
- `GET /api/aggregate` - Get aggregated emotion data
- `GET /api/trends` - Get emotion trends
- `DELETE /api/me/data` - Delete all user data

## Database Schema

- User: id, email, timezone
- Track: id, name, artistIds[], spotifyId, durationMs
- AudioFeature: trackId, valence, energy, tempo, etc.
- Play: userId, trackId, playedAt, msPlayed, source
- Emotion: playId, category, moodScore

## Development

- Seed script: `npm run seed`
- Tests: `npm test`
- Lint: `npm run lint`