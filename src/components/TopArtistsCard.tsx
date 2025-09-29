"use client"

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useRange } from '@/components/range-context'
import { Trophy } from 'lucide-react'

type ArtistItem = { id: string; name: string; imageUrl: string | null; genres?: string[]; count: number }

export default function TopArtistsCard() {
  const { source } = useRange()
  const [items, setItems] = useState<ArtistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; name?: string; loading?: boolean; data?: { news: any[]; shows: any[]; summary?: string | null } }>()

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const url = `/api/top-artists?range=365d${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
    fetch(url).then(async r => {
      const j = r.ok ? await r.json() : { items: [] }
      if (!ignore) setItems(j.items || [])
    }).catch(() => {
      if (!ignore) setItems([])
    }).finally(() => {
      if (!ignore) setLoading(false)
    })
    return () => { ignore = true }
  }, [source])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Artists (365d){source && source!=='all' ? ` — ${source}` : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black dark:border-white" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-600 dark:text-slate-400">No data yet.</div>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {items.map((a, i) => (
              <li
                key={a.id}
                className="flex items-center gap-3 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded"
                onClick={async () => {
                  setModal({ open: true, name: a.name, loading: true })
                  try {
                    const r = await fetch(`/api/artist-info?name=${encodeURIComponent(a.name)}&limit=6`)
                    const j = r.ok ? await r.json() : null
                    setModal({ open: true, name: a.name, loading: false, data: j ? { news: j.news || [], shows: j.shows || [], summary: j.summary || null } : { news: [], shows: [] } })
                  } catch {
                    setModal({ open: true, name: a.name, loading: false, data: { news: [], shows: [] } })
                  }
                }}
              >
                {/* Trophy for top 3 */}
                {i < 3 ? (
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-6"
                    title={i===0? 'Gold': i===1? 'Silver':'Bronze'}
                    aria-label={`Rank ${i+1}`}
                  >
                    <Trophy
                      className={`w-5 h-5 ${
                        i===0 ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]'
                        : i===1 ? 'text-slate-300'
                        : 'text-amber-700'
                      }`}
                      strokeWidth={2}
                    />
                  </span>
                ) : (
                  <span className="w-6" />
                )}
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-sm font-semibold text-slate-800 dark:text-white">
                    {a.name.slice(0,1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{i+1}. {a.name}</div>
                  {(a.genres && a.genres.length > 0) && (
                    <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                      {a.genres.slice(0,3).map(g => (
                        <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-300">{g}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-slate-600 dark:text-slate-400 text-sm">{a.count}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {modal?.open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-2 sm:px-4" onClick={() => setModal({ open: false })}>
          <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="font-semibold">{modal?.name}</div>
              <button className="px-2 py-1 rounded hover:bg-white/5" onClick={() => setModal({ open: false })}>Close</button>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto max-h-[70vh]">
              <div>
                <div className="text-sm font-semibold mb-2">News</div>
                {modal?.loading ? (
                  <div className="text-sm text-slate-400">Searching…</div>
                ) : (modal?.data?.news?.length ?? 0) > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {modal!.data!.news!.slice(0,6).map((n: any, idx: number) => (
                      <li key={idx} className="border border-white/10 rounded p-2">
                        <div className="font-medium truncate">{n.title || n.source}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          {n.source && <span>{n.source}</span>}
                          {n.date && <span>• {typeof n.date === 'string' ? n.date.slice(0,10) : ''}</span>}
                        </div>
                        {n.url && (
                          <a className="text-xs text-sky-400 hover:underline" href={n.url} target="_blank" rel="noopener noreferrer">Open</a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-slate-400">No recent news found.</div>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Shows</div>
                {modal?.loading ? (
                  <div className="text-sm text-slate-400">Checking listings…</div>
                ) : (modal?.data?.shows?.length ?? 0) > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {modal!.data!.shows!.slice(0,6).map((s: any, idx: number) => (
                      <li key={idx} className="border border-white/10 rounded p-2">
                        <div className="font-medium truncate">{s.title || s.venue || 'Show'}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          {s.date && <span>{typeof s.date === 'string' ? s.date.slice(0,10) : ''}</span>}
                          {s.city && <span>• {s.city}</span>}
                          {s.country && <span>• {s.country}</span>}
                        </div>
                        {s.url && (
                          <a className="text-xs text-sky-400 hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">Tickets</a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-slate-400">No upcoming shows found.</div>
                )}
              </div>
            </div>
            {modal?.data?.summary && (
              <div className="px-4 pb-4 text-xs text-slate-400">
                <div className="font-semibold mb-1">About</div>
                <p className="leading-relaxed">{modal.data.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
