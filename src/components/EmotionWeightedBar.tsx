"use client"

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useRange } from '@/components/range-context'

type Row = { category: string; ms: number }

const colors: Record<string, string> = {
  'Excited/Happy': '#fbbf24',
  'Calm/Content': '#38bdf8',
  'Sad/Melancholic': '#a855f7',
  'Tense/Angry': '#f43f5e',
  'Neutral': '#94a3b8',
}

export default function EmotionWeightedBar() {
  const [data, setData] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('all')
  const { source } = useRange()

  useEffect(() => {
    const run = async () => {
      try {
        let url = '/api/aggregate-weighted'
        if (range !== 'all') {
          const days = Number(range)
          const to = new Date()
          const from = new Date()
          from.setDate(to.getDate() - days + 1)
          url += `?from=${new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0).toISOString()}&to=${new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).toISOString()}`
        }
        if (source && source !== 'all') {
          url += (url.includes('?') ? '&' : '?') + `source=${encodeURIComponent(source)}`
        }
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch weighted emotions')
        const rows = await res.json()
        const normalized: Row[] = rows.map((r: any) => ({ category: r.category, ms: Number(r.ms) || 0 }))
        setData(normalized)
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
        setData([])
      } finally {
        setLoading(false)
      }
    }
    setLoading(true)
    setError(null)
    run()
  }, [range, source])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.map((d) => ({ name: d.category, value: Math.round(d.ms / 60000) })) // minutes listened
  }, [data])

  if (loading) {
    return <div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
  }
  if (error) {
    return <div className="h-64 flex items-center justify-center text-sm text-rose-600">{error}</div>
  }
  if (!chartData.length) {
    return <div className="h-64 flex items-center justify-center text-sm text-slate-500">No listening yet</div>
  }

  return (
    <div className="h-64">
      <div className="flex items-center justify-end gap-1 mb-1 text-xs">
        {(['7','30','90','all'] as const).map(r => (
          <button key={r} className={`px-2 py-0.5 rounded border ${range===r? 'bg-slate-100 border-slate-400':'border-slate-300 text-slate-600'}`} onClick={() => setRange(r)}>{r === 'all' ? 'All' : `Last ${r}`}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
          <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', offset: 0, fill: '#475569' }} />
          <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }} formatter={(v: any) => [`${v} min`, 'Time']} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[entry.name] || '#94a3b8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
