"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRange } from '@/components/range-context'

type Trend = { category: string; current: number; previous: number; change: number }
type RecTrack = { id: string; name: string; spotifyId?: string | null; artists: string[]; imageUrl?: string | null; playCount: number; msPlayed: number; explicit?: boolean }

export default function TrendsCard() {
  const { source } = useRange()
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [windowDays, setWindowDays] = useState<'30' | '60' | '90' | 'all'>('60')
  const [sortByChange, setSortByChange] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [recs, setRecs] = useState<Record<string, { loading: boolean; tracks: RecTrack[]; visible: number }>>({})
  const [aiRecs, setAiRecs] = useState<Record<string, { loading: boolean; tracks: { title: string; artist: string }[]; visible: number }>>({})

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const url = `/api/trends?window=${windowDays}${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
    fetch(url)
      .then(async r => (r.ok ? await r.json() : []))
      .then((arr: any[]) => { if (!ignore) setTrends(arr.map(t => ({ category: t.category, current: Number(t.current||0), previous: Number(t.previous||0), change: Number(t.change||0) }))) })
      .catch(() => { if (!ignore) setTrends([]) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [source, windowDays])

  const sorted = useMemo(() => {
    const copy = [...trends]
    if (sortByChange) copy.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    else copy.sort((a, b) => b.current - a.current)
    return copy
  }, [trends, sortByChange])

  const arrow = (chg: number) => chg > 2 ? '↑' : chg < -2 ? '↓' : '→'
  const tone = (chg: number) => chg > 2 ? 'text-emerald-500' : chg < -2 ? 'text-rose-500' : 'text-slate-500'

  const toggleCategory = async (cat: string) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
    const isExpanding = !expanded[cat]
    if (isExpanding && !recs[cat]) {
      // fetch recommendations for this category
      const q = `/api/recommendations?category=${encodeURIComponent(cat)}&window=60${source && source !== 'all' ? `&source=${encodeURIComponent(source)}` : ''}`
      setRecs(prev => ({ ...prev, [cat]: { loading: true, tracks: [], visible: 0 } }))
      try {
        const r = await fetch(q)
        const j = r.ok ? await r.json() : { tracks: [] }
        const full = (j.tracks || []) as RecTrack[]
        setRecs(prev => ({ ...prev, [cat]: { loading: false, tracks: full, visible: Math.min(5, full.length) } }))
      } catch {
        setRecs(prev => ({ ...prev, [cat]: { loading: false, tracks: [], visible: 0 } }))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Trending Emotions</CardTitle>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <label className="flex items-center gap-1">
              <span>Window</span>
              <select
                className="bg-transparent border border-white/10 rounded px-1 py-0.5"
                value={windowDays}
                onChange={e => setWindowDays(e.target.value as any)}
              >
                <option value="30">30d</option>
                <option value="60">60d</option>
                <option value="90">90d</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={sortByChange} onChange={e => setSortByChange(e.target.checked)} />
              <span>Sort by change</span>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black dark:border-white" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-600 dark:text-slate-400">Not enough data.</div>
        ) : (
          <ul className="text-sm space-y-2">
            {sorted.slice(0,5).map(t => (
              <li key={t.category}>
                <button
                  className="w-full flex items-center justify-between hover:bg-white/5 dark:hover:bg-white/5 rounded px-2 py-1 text-left"
                  onClick={() => toggleCategory(t.category)}
                  aria-expanded={!!expanded[t.category]}
                >
                  <span className="font-medium truncate">{t.category}</span>
                  <span className="ml-2 shrink-0 text-xs text-slate-500">{t.current.toLocaleString()} plays</span>
                  <span className={`ml-2 shrink-0 text-xs ${tone(t.change)}`}>{arrow(t.change)} {t.change.toFixed(1)}%</span>
                </button>
                {expanded[t.category] && (
                  <div className="mt-2 ml-1 border-l border-white/10 pl-3">
                    {recs[t.category]?.loading ? (
                      <div className="text-xs text-slate-500">Loading songs…</div>
                    ) : (recs[t.category]?.tracks?.length ?? 0) === 0 ? (
                      <div className="text-xs text-slate-500">No recent songs available.</div>
                    ) : (
                      <ul className="space-y-1">
                        {recs[t.category]!.tracks.slice(0, recs[t.category]!.visible).map(tr => (
                          <li key={tr.id} className="flex items-center gap-2">
                            {tr.imageUrl ? (
                              <img src={tr.imageUrl} alt={tr.name} className="w-7 h-7 rounded object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-[10px]">{tr.name.slice(0,1).toUpperCase()}</div>
                            )}
                            <div className="min-w-0">
                              {tr.spotifyId ? (
                                <a
                                  className="hover:underline"
                                  href={`https://open.spotify.com/track/${tr.spotifyId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in Spotify"
                                >
                                  <span className="font-medium truncate">{tr.name}</span>
                                  {tr.explicit ? (
                                    <span
                                      className="ml-1 inline-flex items-center justify-center text-[10px] leading-none font-semibold w-4 h-4 rounded border border-rose-400/30 text-rose-300/90"
                                      title="Explicit"
                                      aria-label="Explicit"
                                    >E</span>
                                  ) : null}
                                </a>
                              ) : (
                                <>
                                  <span className="font-medium truncate">{tr.name}</span>
                                  {tr.explicit ? (
                                    <span
                                      className="ml-1 inline-flex items-center justify-center text-[10px] leading-none font-semibold w-4 h-4 rounded border border-rose-400/30 text-rose-300/90"
                                      title="Explicit"
                                      aria-label="Explicit"
                                    >E</span>
                                  ) : null}
                                </>
                              )}
                              <div className="text-xs text-slate-500 truncate">{tr.artists.join(', ')}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(recs[t.category]?.tracks?.length ?? 0) > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        {recs[t.category]!.visible < recs[t.category]!.tracks.length && (
                          <button
                            className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                            onClick={() => setRecs(prev => ({
                              ...prev,
                              [t.category]: {
                                ...prev[t.category]!,
                                visible: Math.min(prev[t.category]!.visible + 5, prev[t.category]!.tracks.length),
                              },
                            }))}
                          >Show more</button>
                        )}
                        {recs[t.category]!.visible > 5 && (
                          <button
                            className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                            onClick={() => setRecs(prev => ({
                              ...prev,
                              [t.category]: { ...prev[t.category]!, visible: 5 },
                            }))}
                          >Show less</button>
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <button
                        className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                        onClick={async () => {
                          setAiRecs(prev => ({ ...prev, [t.category]: { loading: true, tracks: [], visible: 0 } }))
                          try {
                            const r = await fetch(`/api/recommendations-ai?category=${encodeURIComponent(t.category)}&limit=8`)
                            const j = r.ok ? await r.json() : { tracks: [] }
                            const arr = (j.tracks || []) as Array<{ title: string; artist: string }>
                            setAiRecs(prev => ({ ...prev, [t.category]: { loading: false, tracks: arr, visible: Math.min(8, arr.length) } }))
                          } catch {
                            setAiRecs(prev => ({ ...prev, [t.category]: { loading: false, tracks: [], visible: 0 } }))
                          }
                        }}
                      >Get AI picks for this emotion</button>
                      {aiRecs[t.category]?.loading ? (
                        <div className="mt-2 text-xs text-slate-500">Asking AI…</div>
                      ) : (aiRecs[t.category]?.tracks?.length ?? 0) > 0 ? (
                        <ul className="mt-2 text-xs text-slate-300 space-y-1 list-disc pl-4">
                          {aiRecs[t.category]!.tracks.slice(0, aiRecs[t.category]!.visible).map((s, i) => (
                            <li key={`${s.title}-${s.artist}-${i}`} className="truncate">
                              <span className="font-medium">{s.title}</span> — <span className="text-slate-400">{s.artist}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {(aiRecs[t.category]?.tracks?.length ?? 0) > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          {aiRecs[t.category]!.visible < aiRecs[t.category]!.tracks.length && (
                            <button
                              className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                              onClick={() => setAiRecs(prev => ({
                                ...prev,
                                [t.category]: {
                                  ...prev[t.category]!,
                                  visible: Math.min(prev[t.category]!.visible + 8, prev[t.category]!.tracks.length),
                                },
                              }))}
                            >Show more</button>
                          )}
                          {aiRecs[t.category]!.visible > 8 && (
                            <button
                              className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                              onClick={() => setAiRecs(prev => ({
                                ...prev,
                                [t.category]: { ...prev[t.category]!, visible: 8 },
                              }))}
                            >Show less</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
