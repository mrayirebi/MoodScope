-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artistIds" TEXT[],
    "spotifyId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_features" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "valence" DOUBLE PRECISION NOT NULL,
    "energy" DOUBLE PRECISION NOT NULL,
    "tempo" DOUBLE PRECISION NOT NULL,
    "danceability" DOUBLE PRECISION NOT NULL,
    "acousticness" DOUBLE PRECISION NOT NULL,
    "speechiness" DOUBLE PRECISION NOT NULL,
    "mode" INTEGER NOT NULL,
    "loudness" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plays" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "msPlayed" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emotions" (
    "id" TEXT NOT NULL,
    "playId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "moodScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_spotifyId_key" ON "tracks"("spotifyId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_features_trackId_key" ON "audio_features"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "plays_userId_trackId_playedAt_key" ON "plays"("userId", "trackId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "emotions_playId_key" ON "emotions"("playId");

-- AddForeignKey
ALTER TABLE "audio_features" ADD CONSTRAINT "audio_features_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotions" ADD CONSTRAINT "emotions_playId_fkey" FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
