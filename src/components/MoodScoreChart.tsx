'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useRange } from '@/components/range-context'

interface MoodData {
  date: string
  score: number
}

export default function MoodScoreChart() {
  const [data, setData] = useState<MoodData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const { source } = useRange()

  useEffect(() => {
    const run = async () => {
      try {
        // Determine window
        const meRes = await fetch('/api/me/data')
        const me = await meRes.json()
        if (!me?.range?.max) {
          setData([])
          setLoading(false)
          return
        }

        let fromIso: string | undefined
        let toIso: string | undefined

        if (range === 'all') {
          const min = me?.range?.min ? new Date(me.range.min) : undefined
          const max = new Date(me.range.max)
          const start = min ? new Date(min.getFullYear(), min.getMonth(), min.getDate(), 0, 0, 0, 0) : undefined
          const end = new Date(max.getFullYear(), max.getMonth(), max.getDate(), 23, 59, 59, 999)
          fromIso = start?.toISOString()
          toIso = end.toISOString()
        } else {
          const days = Number(range)
          const max = new Date(me.range.max)
          const start = new Date(max)
          start.setDate(start.getDate() - (days - 1))
          fromIso = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).toISOString()
          toIso = new Date(max.getFullYear(), max.getMonth(), max.getDate(), 23, 59, 59, 999).toISOString()
        }

  const params = new URLSearchParams({ group: 'day' })
        if (fromIso) params.set('from', fromIso)
        if (toIso) params.set('to', toIso)
  if (source && source !== 'all') params.set('source', source)

  const res = await fetch(`/api/aggregate?${params.toString()}`)
        if (!res.ok) throw new Error('Failed to load daily aggregates')
        const rows = await res.json()

        // Build per-day weighted mood across categories: sum(avg_mood*count)/sum(count)
        // Use a stable UTC day key to avoid tz drift
        const dayKeyUTC = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000)
        type Acc = { moodSum: number; total: number }
        const map = new Map<number, Acc>()
        for (const r of rows) {
          const key = dayKeyUTC(new Date(r.period))
          const cnt = Number(r.count) || 0
          const avg = Number(r.avg_mood) || 0
          const acc = map.get(key) || { moodSum: 0, total: 0 }
          acc.moodSum += avg * cnt
          acc.total += cnt
          map.set(key, acc)
        }

        // Create sequential series for selected window so gaps render as zero
        const series: MoodData[] = []
        const fromDate = fromIso ? new Date(fromIso) : new Date()
        const toDate = toIso ? new Date(toIso) : new Date()
        // Calculate days inclusive between from and to
        const msPerDay = 86400000
        const startKey = dayKeyUTC(fromDate)
        const endKey = dayKeyUTC(toDate)
        for (let key = startKey; key <= endKey; key++) {
          const d = new Date(key * msPerDay)
          const acc = map.get(key)
          const score = acc && acc.total > 0 ? acc.moodSum / acc.total : 0
          series.push({
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            score,
          })
        }
        setData(series)
      } catch (e: any) {
        setError(e?.message || 'Failed to load mood chart')
        setData([])
      } finally {
        setLoading(false)
      }
    }
    setLoading(true)
    setError(null)
    run()
  }, [range, source])

  if (loading) {
    return (
      <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="h-64 bg-white rounded-lg border flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 mb-2">No daily mood scores yet.</p>
          <div className="flex items-center justify-center gap-2">
            <button
              className="px-2 py-1 text-xs rounded border text-slate-700 hover:bg-slate-50"
              onClick={async () => { const r = await fetch('/api/import/demo',{method:'POST'}); if(r.ok) location.reload() }}
            >Load Demo Data</button>
            <button
              className="px-2 py-1 text-xs rounded border text-slate-700 hover:bg-slate-50"
              onClick={async () => { const r = await fetch('/api/me/backfill-emotions',{method:'POST'}); if(r.ok) location.reload() }}
            >Generate Emotions</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-64">
      <div className="flex items-center justify-end gap-1 mb-1 text-xs">
        {(['7','30','90','all'] as const).map(r => (
          <button key={r} className={`px-2 py-0.5 rounded border ${range===r? 'bg-slate-100 border-slate-400':'border-slate-300 text-slate-600'}`} onClick={() => setRange(r)}>{r === 'all' ? 'All' : `Last ${r}`}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.9)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.9)' }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px'
            }}
            formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Mood Score']}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#82ca9d"
            strokeWidth={2}
            fill="url(#moodGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}