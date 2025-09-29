import { z } from 'zod'

export const streamingHistorySchema = z.array(
  z.object({
    // Basic required fields
    endTime: z.string().optional(),
    artistName: z.string().optional(),
    trackName: z.string().optional(),
    msPlayed: z.number().optional(),
    // Extended fields (make all optional)
    ts: z.string().optional(),
    username: z.string().optional(),
    platform: z.string().optional(),
    ms_played: z.number().optional(),
    conn_country: z.string().optional(),
    ip_addr_decrypted: z.string().optional(),
    user_agent_decrypted: z.string().optional(),
    master_metadata_track_name: z.string().optional(),
    master_metadata_album_artist_name: z.string().optional(),
    master_metadata_album_album_name: z.string().optional(),
    spotify_track_uri: z.string().optional(),
    episode_name: z.string().optional(),
    episode_show_name: z.string().optional(),
    spotify_episode_uri: z.string().optional(),
    reason_start: z.string().optional(),
    reason_end: z.string().optional(),
    shuffle: z.boolean().optional(),
    skipped: z.boolean().optional(),
    offline: z.boolean().optional(),
    offline_timestamp: z.number().optional(),
    incognito_mode: z.boolean().optional(),
    // Additional optional fields
    albumName: z.string().optional(),
    spotifyTrackUri: z.string().optional(),
  }).refine((obj) => {
    // Ensure we have either basic or extended format
    return (obj.endTime && obj.artistName && obj.trackName && obj.msPlayed) ||
           (obj.ts && obj.master_metadata_track_name && obj.ms_played)
  }, {
    message: "Must have either basic format (endTime, artistName, trackName, msPlayed) or extended format (ts, master_metadata_track_name, ms_played)"
  })
)

export type StreamingHistory = z.infer<typeof streamingHistorySchema>