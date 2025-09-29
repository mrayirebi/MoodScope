import { Emotion } from './emotion_v2'

export type AIEmotionResult = { category: Emotion; moodScore?: number }

export function aiEnabled(): boolean {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT)
    || !!process.env.OPENAI_API_KEY
}

export type AIProvider = 'azure' | 'openai' | null

export function aiProvider(): AIProvider {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) return 'azure'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return null
}

type Input = {
  trackName?: string
  artists?: string[]
  features?: {
    valence?: number
    energy?: number
    danceability?: number
    speechiness?: number
    acousticness?: number
    tempo?: number
    loudness?: number
    mode?: number
  }
}

// Optional web search (Tavily) for classification context
type WebDoc = { title?: string; url: string; content?: string; published_date?: string | null }

async function tavilySearch(query: string, max_results = 6, signal?: AbortSignal): Promise<WebDoc[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: true,
      }),
      signal,
    })
    if (!res.ok) return []
    const j = await res.json()
    const results = Array.isArray(j.results) ? j.results : []
    return results.map((r: any) => ({ title: r.title, url: r.url, content: r.content, published_date: r.published_date ?? null }))
  } catch { return [] }
}

function buildPrompt(input: Input) {
  const { trackName, artists, features } = input
  const desc = [
    trackName ? `Track: ${trackName}` : null,
    artists && artists.length ? `Artists: ${artists.join(', ')}` : null,
    features ? `Audio features: ${JSON.stringify(features)}` : null,
  ].filter(Boolean).join('\n')
  const sys = `You are an expert music mood analyst. Classify the song's overall emotional category using ONLY the provided metadata and audio features.
Return concise JSON only with keys: category, moodScore.
Categories must be one of exactly: "Excited/Happy", "Calm/Content", "Sad/Melancholic", "Tense/Angry", "Neutral".
moodScore must be a number from 0 to 1 (0 = very negative, 1 = very positive).

Mapping guidance (deterministic):
- High valence (>= 0.6) and high energy (>= 0.6) -> "Excited/Happy"
- High valence (>= 0.6) and low energy (< 0.6) -> "Calm/Content"
- Low valence (< 0.4) and high energy (>= 0.6) -> "Tense/Angry"
- Low valence (< 0.4) and low energy (< 0.6) -> "Sad/Melancholic"
- Otherwise -> "Neutral"
Use other features (danceability, speechiness, acousticness, tempo, loudness, mode) only to disambiguate near-threshold cases. Do not invent categories beyond the list. Always follow the mapping guidance when valence/energy clearly indicate a bucket.`
  const user = `${desc}\n\nRespond as JSON like: {"category":"Calm/Content","moodScore":0.64}`
  return { system: sys, user }
}

function buildWebPrompt(trackName: string | undefined, artist: string | undefined, docs: WebDoc[]) {
  const meta = [
    trackName ? `Track: ${trackName}` : null,
    artist ? `Artist: ${artist}` : null,
  ].filter(Boolean).join('\n')
  const sys = `You are a music mood analyst. Using the web snippets provided, classify the song's overall emotional category.
Return strict JSON with: category, moodScore.
Categories: "Excited/Happy", "Calm/Content", "Sad/Melancholic", "Tense/Angry", "Neutral".
Rules:
- Prefer authoritative sources; do not invent.
- If sources conflict or are unclear, choose the closest category and set a moderate moodScore.
- Ignore non-song contexts (e.g., news, unrelated pages).`
  const payload = {
    meta,
    snippets: docs.map(d => ({ title: d.title, url: d.url, content: d.content })),
  }
  const user = `Input JSON:\n${JSON.stringify(payload)}\nRespond ONLY as JSON like {"category":"Calm/Content","moodScore":0.64}`
  return { system: sys, user }
}

async function callAzureOpenAI(prompt: { system: string, user: string }, signal?: AbortSignal): Promise<AIEmotionResult | null> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!
  const apiKey = process.env.AZURE_OPENAI_API_KEY!
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal,
  })
  if (!res.ok) return null
  const json: any = await res.json()
  const content: string | undefined = json?.choices?.[0]?.message?.content
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    const category = parsed.category as Emotion | undefined
    const moodScore = typeof parsed.moodScore === 'number' ? parsed.moodScore : undefined
    if (!category) return null
    return { category, moodScore }
  } catch { return null }
}

async function callOpenAI(prompt: { system: string, user: string }, signal?: AbortSignal): Promise<AIEmotionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY!
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal,
  })
  if (!res.ok) return null
  const json: any = await res.json()
  const content: string | undefined = json?.choices?.[0]?.message?.content
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    const category = parsed.category as Emotion | undefined
    const moodScore = typeof parsed.moodScore === 'number' ? parsed.moodScore : undefined
    if (!category) return null
    return { category, moodScore }
  } catch { return null }
}

export async function classifyEmotionAI(input: Input, opts?: { timeoutMs?: number }): Promise<AIEmotionResult | null> {
  if (!aiEnabled()) return null
  const prompt = buildPrompt(input)
  const timeoutMs = opts?.timeoutMs ?? 6000
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
      const res = await callAzureOpenAI(prompt, controller.signal)
      return res
    }
    if (process.env.OPENAI_API_KEY) {
      const res = await callOpenAI(prompt, controller.signal)
      return res
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Web-search–augmented classifier. Requires TAVILY_API_KEY and an AI provider.
export async function classifyEmotionAIWithWeb(input: { trackName?: string; artists?: string[] }, opts?: { timeoutMs?: number; maxResults?: number }): Promise<AIEmotionResult | null> {
  if (!aiEnabled() || !process.env.TAVILY_API_KEY) return null
  const timeoutMs = opts?.timeoutMs ?? 8000
  const maxResults = Math.max(3, Math.min(opts?.maxResults ?? 6, 10))
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const title = input.trackName?.trim()
    const artist = (input.artists && input.artists.length ? input.artists[0] : undefined)?.toString()
    if (!title) return null
    // Two focused queries
    const q1 = `${title} ${artist || ''} song mood meaning`.trim()
    const q2 = `${title} ${artist || ''} genre mood review`.trim()
    const [d1, d2] = await Promise.all([
      tavilySearch(q1, maxResults, controller.signal),
      tavilySearch(q2, maxResults, controller.signal),
    ])
    const docs = [...d1, ...d2].slice(0, maxResults)
    if (!docs.length) return null
    const prompt = buildWebPrompt(title, artist, docs)
    // Call provider
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT!
      const apiKey = process.env.AZURE_OPENAI_API_KEY!
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!
      const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({ messages: [ { role: 'system', content: prompt.system }, { role: 'user', content: prompt.user } ], temperature: 0, response_format: { type: 'json_object' } }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const j = await res.json()
      const content: string | undefined = j?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      const category = parsed.category as Emotion | undefined
      const moodScore = typeof parsed.moodScore === 'number' ? parsed.moodScore : undefined
      if (!category) return null
      return { category, moodScore }
    }
    if (process.env.OPENAI_API_KEY) {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, messages: [ { role: 'system', content: prompt.system }, { role: 'user', content: prompt.user } ], temperature: 0, response_format: { type: 'json_object' } }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const j = await res.json()
      const content: string | undefined = j?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      const category = parsed.category as Emotion | undefined
      const moodScore = typeof parsed.moodScore === 'number' ? parsed.moodScore : undefined
      if (!category) return null
      return { category, moodScore }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Reconcile AI output with deterministic valence/energy mapping.
// If features are far from thresholds, enforce mapping; otherwise trust AI.
export function reconcileAIWithV2(
  ai: AIEmotionResult | null,
  features?: { valence?: number; energy?: number }
): AIEmotionResult | null {
  if (!features || features.valence == null || features.energy == null) return ai
  const v = features.valence
  const e = features.energy
  const hi = 0.66, lo = 0.33
  const margin = 0.06 // near-threshold band where we allow AI discretion

  // Determine v2 bucket
  let v2: Emotion = 'Neutral'
  if (v >= hi && e >= hi) v2 = 'Excited/Happy'
  else if (v >= hi && e <= lo) v2 = 'Calm/Content'
  else if (v <= lo && e <= lo) v2 = 'Sad/Melancholic'
  else if (v <= lo && e >= hi) v2 = 'Tense/Angry'

  // If clearly not near thresholds and AI disagrees, override with v2
  const nearHiV = Math.abs(v - hi) < margin
  const nearLoV = Math.abs(v - lo) < margin
  const nearHiE = Math.abs(e - hi) < margin
  const nearLoE = Math.abs(e - lo) < margin
  const nearBoundary = nearHiV || nearLoV || nearHiE || nearLoE

  if (!ai || !ai.category) return { category: v2 }

  // If v2 is Neutral, prefer AI's judgment in the ambiguous region
  if (v2 === 'Neutral') return ai

  // Otherwise, if we are clearly away from thresholds and AI disagrees, enforce v2
  if (!nearBoundary && ai.category !== v2) {
    return { category: v2, moodScore: ai.moodScore }
  }
  return ai
}

// ===== AI-powered track recommendations by emotion =====
export type AITrackRecommendation = { title: string; artist: string }

function buildRecPrompt(category: string, limit: number) {
  const sys = `You are a music curator. Recommend popular and diverse songs that convey a specific emotional category.
Return strict JSON only with key "tracks" as an array of objects with keys: title, artist.
Do not include any extra keys or commentary.

Emotion categories (choose songs that match the requested one):
- "Excited/Happy": energetic, upbeat, positive
- "Calm/Content": mellow, relaxed, warm
- "Sad/Melancholic": somber, reflective, low-valence
- "Tense/Angry": intense, aggressive, high-arousal, low-valence
- "Neutral": balanced, unobtrusive
`
  const user = `Category: ${category}
Count: ${limit}
Respond as JSON like: {"tracks":[{"title":"Song Name","artist":"Artist Name"}]}`
  return { system: sys, user }
}

export async function recommendTracksByEmotionAI(category: string, limit = 10, opts?: { timeoutMs?: number }): Promise<AITrackRecommendation[] | null> {
  if (!aiEnabled()) return null
  const prompt = buildRecPrompt(category, Math.max(1, Math.min(limit, 20)))
  const timeoutMs = opts?.timeoutMs ?? 8000
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Azure OpenAI
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT!
      const apiKey = process.env.AZURE_OPENAI_API_KEY!
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!
      const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const json: any = await res.json()
      const content: string | undefined = json?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      const arr = Array.isArray(parsed?.tracks) ? parsed.tracks : []
      return arr
        .filter((x: any) => x && typeof x.title === 'string' && typeof x.artist === 'string')
        .slice(0, limit)
    }
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      const apiKey = process.env.OPENAI_API_KEY!
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const json: any = await res.json()
      const content: string | undefined = json?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      const arr = Array.isArray(parsed?.tracks) ? parsed.tracks : []
      return arr
        .filter((x: any) => x && typeof x.title === 'string' && typeof x.artist === 'string')
        .slice(0, limit)
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
