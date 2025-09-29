import { NextRequest, NextResponse } from 'next/server'
import { aiEnabled } from '@/lib/ai'

type SearchDoc = { title?: string; url: string; content?: string; published_date?: string | null }

async function tavilySearch(query: string, max_results = 6): Promise<SearchDoc[]> {
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
    })
    if (!res.ok) return []
    const j = await res.json()
    const results = Array.isArray(j.results) ? j.results : []
    return results.map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      published_date: r.published_date ?? null,
    }))
  } catch { return [] }
}

function domainFromUrl(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

async function summarizeWithAI(artist: string, news: SearchDoc[], shows: SearchDoc[]): Promise<{ news: any[]; shows: any[] } | null> {
  if (!aiEnabled()) return null
  const useAzure = !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT)
  const useOpenAI = !!process.env.OPENAI_API_KEY
  if (!useAzure && !useOpenAI) return null
  const system = 'You are a helpful music assistant. Given web search results about an artist, extract two lists: news (title, source, url, date) and shows (date ISO if possible, venue, city, country, url). Return strict JSON with keys news and shows. Do not invent; only extract what is supported by the snippets. Prefer official and reputable sources.'
  const payload = {
    artist,
    news: news.map(n => ({ title: n.title, url: n.url, source: domainFromUrl(n.url), content: n.content, date: n.published_date })),
    shows: shows.map(s => ({ title: s.title, url: s.url, source: domainFromUrl(s.url), content: s.content, date: s.published_date })),
  }
  const user = `Input JSON: \n${JSON.stringify(payload)}\nRespond ONLY as JSON with keys news and shows.`
  try {
    if (useAzure) {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT as string
      const apiKey = process.env.AZURE_OPENAI_API_KEY as string
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT as string
      const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return null
      const j = await res.json()
      const content: string | undefined = j?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      return { news: Array.isArray(parsed.news) ? parsed.news : [], shows: Array.isArray(parsed.shows) ? parsed.shows : [] }
    }
    if (useOpenAI) {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return null
      const j = await res.json()
      const content: string | undefined = j?.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      return { news: Array.isArray(parsed.news) ? parsed.news : [], shows: Array.isArray(parsed.shows) ? parsed.shows : [] }
    }
    return null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const name = url.searchParams.get('name')?.trim()
    const limit = Math.max(3, Math.min(parseInt(url.searchParams.get('limit') || '6', 10) || 6, 10))
    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

    let newsDocs: SearchDoc[] = []
    let showDocs: SearchDoc[] = []
    if (process.env.TAVILY_API_KEY) {
      newsDocs = await tavilySearch(`${name} latest news 2025`, limit)
      showDocs = await tavilySearch(`${name} upcoming tour dates 2025 OR 2026 site:ticketmaster.com OR site:songkick.com OR site:bandsintown.com`, limit)
    }

    let fallbackSummary: string | null = null
    if (!newsDocs.length && !showDocs.length) {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`)
        if (res.ok) {
          const j = await res.json()
          fallbackSummary = j?.extract || null
        }
      } catch {}
    }

    let structured: { news: any[]; shows: any[] } | null = null
    if ((newsDocs.length || showDocs.length) && aiEnabled()) {
      structured = await summarizeWithAI(name, newsDocs, showDocs)
    }

    return NextResponse.json({
      artist: name,
      news: structured ? structured.news : newsDocs.map(d => ({ title: d.title, source: domainFromUrl(d.url), url: d.url, date: d.published_date || null })),
      shows: structured ? structured.shows : showDocs.map(d => ({ title: d.title, url: d.url })),
      summary: fallbackSummary,
      provider: process.env.TAVILY_API_KEY ? 'tavily' : 'fallback',
    })
  } catch (e) {
    console.error('artist-info error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
