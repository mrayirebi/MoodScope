"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

type Day = { date: string; count: number; moodAvg: number | null; dominantEmotion: string | null }

const colorFor = (emotion: string | null) => {
  switch (emotion) {
    case 'Excited/Happy': return 'bg-yellow-400'
    case 'Calm/Content': return 'bg-sky-400'
    case 'Sad/Melancholic': return 'bg-purple-500'
    case 'Tense/Angry': return 'bg-rose-500'
    case 'Neutral': return 'bg-slate-300'
    default: return 'bg-slate-200'
  }
}

export function CalendarCard() {
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const url = `/api/heatmap?from=${start.toISOString()}&to=${end.toISOString()}`
      const res = await fetch(url)
      if (!res.ok) { setDays([]); setLoading(false); return }
      const json = await res.json()
      setDays(json.days || [])
      setLoading(false)
    }
    run()
  }, [])

  const map = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const firstDow = new Date(start.getFullYear(), start.getMonth(), 1).getDay()
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const tiles: { date: Date; key: string }[] = []
  for (let i = 0; i < firstDow; i++) tiles.push({ date: new Date(NaN), key: `pad-${i}` })
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(start.getFullYear(), start.getMonth(), day)
    const key = d.toISOString().slice(0, 10)
    tiles.push({ date: d, key })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listening Calendar</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="text-xs text-slate-400 mb-1 text-center">{d}</div>
            ))}
            {tiles.map(({ date, key }) => {
              if (isNaN(date.getTime())) return <div key={key} className="h-8" />
              const ymd = key
              const rec = map.get(ymd)
              const count = rec?.count ?? 0
              const cls = `${colorFor(rec?.dominantEmotion ?? null)} ${count>0?'opacity-100':'opacity-50'} rounded h-8 flex items-center justify-center text-xs text-slate-900`
              return (
                <div key={key} className={cls} title={`${ymd} • ${count} plays`}>
                  {date.getDate()}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CalendarCard
