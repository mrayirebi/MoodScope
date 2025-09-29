'use client'

import { useEffect, useState } from 'react'
import { useRange } from '@/components/range-context'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

interface EmotionData {
  category: string
  current: number
}

const emotionColors: Record<string, string> = {
  'Excited/Happy': '#FFD700',
  'Calm/Content': '#87CEEB',
  'Sad/Melancholic': '#4682B4',
  'Tense/Angry': '#DC143C',
  'Neutral': '#808080'
}

export default function EmotionChart() {
  const [data, setData] = useState<EmotionData[]>([])
  const [loading, setLoading] = useState(true)
  const { range, source } = useRange()

  useEffect(() => {
  const win = range === 'all' ? 'all' : (range === '90d' ? '90' : '365')
    setLoading(true)
  const url = `/api/trends?window=${win}${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
  fetch(url)
      .then(res => res.json())
      .then(data => {
        // Transform data to include colors
        const transformedData = (data || []).map((item: EmotionData) => ({
          ...item,
          fill: emotionColors[item.category] || '#808080'
        }))
        setData(transformedData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch emotion data:', err)
        setLoading(false)
      })
  }, [range, source])

  if (loading) {
    return (
      <div className="h-64 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-64 bg-white rounded-lg border flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 mb-2">No emotion data yet.</p>
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
      {/* Range is now controlled from TopNav */}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
          <XAxis
            dataKey="category"
            tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.9)' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.9)' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#333'
            }}
          />
          <Bar
            dataKey="current"
            radius={[4, 4, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={emotionColors[entry.category] || '#808080'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}