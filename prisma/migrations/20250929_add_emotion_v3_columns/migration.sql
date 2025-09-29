-- Add v3 enrichment columns to emotions table (optional usage)
ALTER TABLE "emotions"
ADD COLUMN IF NOT EXISTS "label" TEXT,
ADD COLUMN IF NOT EXISTS "valence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "arousal" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;
