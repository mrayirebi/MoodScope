"use client"

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useRange } from '@/components/range-context'
import { Trophy } from 'lucide-react'

type GenreItem = { name: string; count: number }

export default function TopGenresCard() {
  const { source } = useRange()
  const [items, setItems] = useState<GenreItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const url = `/api/top-genres?range=365d${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
    fetch(url).then(async r => {
      const j = r.ok ? await r.json() : { items: [] }
      if (!ignore) setItems((j.items || []).slice(0, 5))
    }).catch(() => { if (!ignore) setItems([]) }).finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [source])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Genres (365d){source && source!=='all' ? ` — ${source}` : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black dark:border-white" /></div>
        ) : items.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-600 dark:text-slate-400">No data yet.</div>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {items.map((g, i) => (
              <li key={g.name} className="flex items-center gap-3 py-3">
                {i < 3 ? (
                  <span className="shrink-0 inline-flex items-center justify-center w-6" title={i===0? 'Gold': i===1? 'Silver':'Bronze'} aria-label={`Rank ${i+1}`}>
                    <Trophy className={`w-5 h-5 ${i===0 ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]' : i===1 ? 'text-slate-300' : 'text-amber-700'}`} strokeWidth={2} />
                  </span>
                ) : (
                  <span className="w-6" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{i+1}. {g.name}</div>
                </div>
                <div className="text-slate-600 dark:text-slate-400 text-sm">{Math.round(g.count)}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
