"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRange } from '@/components/range-context'

type Cell = { weekday: number; hour: number; count: number; msPlayed: number; dominantEmotion: string | null }

const emotionColor = (emotion: string | null) => {
  switch (emotion) {
    case 'Excited/Happy': return 'bg-yellow-400 text-slate-900'
    case 'Calm/Content': return 'bg-sky-400 text-white'
    case 'Sad/Melancholic': return 'bg-purple-500 text-white'
    case 'Tense/Angry': return 'bg-rose-500 text-white'
    case 'Neutral': return 'bg-slate-300 text-slate-800'
    default: return 'bg-slate-200 text-slate-600'
  }
}

export default function WeekdayHourHeatmap() {
  const { source } = useRange()
  const [items, setItems] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ weekday: number; hour: number; tracks: Array<{ id: string; name: string; artist: string; artistImage?: string | null; count: number }> } | null>(null)

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const url = `/api/weekday-hour?range=90d${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
    fetch(url).then(async r => {
      const j = r.ok ? await r.json() : { items: [] }
      if (!ignore) setItems(j.items || [])
    }).catch(() => { if (!ignore) setItems([]) }).finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [source])

  const grid = useMemo(() => {
    const m = new Map<string, Cell>()
    for (const it of items) m.set(`${it.weekday}:${it.hour}`, it)
    return m
  }, [items])

  const openDetail = async (weekday: number, hour: number) => {
    try {
      const url = `/api/weekday-hour/detail?weekday=${weekday}&hour=${hour}${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
      const r = await fetch(url)
      if (!r.ok) return
      const j = await r.json()
      setDetail(j)
    } catch {}
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekday × Hour Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black dark:border-white" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[auto_repeat(24,minmax(16px,1fr))] gap-px bg-black/5 dark:bg-white/10 rounded">
              <div className="sticky left-0 bg-transparent" />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={`h-${h}`} className="text-[10px] text-slate-600 dark:text-slate-400 text-center py-1">{h}</div>
              ))}
              {Array.from({ length: 7 }, (_, w) => (
                <>
                  <div key={`d-${w}`} className="text-[11px] px-1 py-1 text-slate-700 dark:text-slate-300">{days[w]}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const c = grid.get(`${w}:${h}`)
                    const cls = c ? emotionColor(c.dominantEmotion) : 'bg-slate-100 text-slate-400'
                    const tone = !c || c.count === 0 ? 'opacity-40' : c.count < 3 ? 'opacity-70' : c.count < 8 ? 'opacity-85' : 'opacity-100'
                    return (
                      <button
                        key={`c-${w}-${h}`}
                        title={c ? `${days[w]} ${h}:00 • ${c.count} plays` : `${days[w]} ${h}:00 • 0 plays`}
                        className={`h-6 min-w-[16px] ${cls} ${tone} text-[10px] flex items-center justify-center border border-black/10 dark:border-white/10`}
                        onClick={() => c && c.count > 0 && openDetail(w, h)}
                      >
                        {c?.count ?? 0}
                      </button>
                    )
                  })}
                </>
              ))}
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-2 sm:px-4" onClick={() => setDetail(null)}>
            <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-md max-h-[85vh] overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3 border-b border-white/10">
                <div className="font-semibold text-sm">Top tracks — {days[detail.weekday]} {detail.hour}:00</div>
                <button className="px-2 py-1 rounded hover:bg-white/5" onClick={() => setDetail(null)}>Close</button>
              </div>
              <div className="p-3 overflow-y-auto max-h-[70vh]">
                {detail.tracks.length === 0 ? (
                  <div className="text-sm text-slate-400">No tracks in this slot.</div>
                ) : (
                  <ul className="text-sm text-slate-300 space-y-2">
                    {detail.tracks.map(t => (
                      <li key={t.id} className="flex items-center gap-2">
                        {t.artistImage ? (
                          <img src={t.artistImage} alt={t.artist} className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">{t.artist.slice(0,1).toUpperCase()}</div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium truncate">{t.name}</span> <span className="text-slate-400">— {t.artist}</span>
                        </div>
                        <span className="ml-auto text-[11px] text-slate-400">{t.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
