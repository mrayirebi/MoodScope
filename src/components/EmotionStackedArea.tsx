'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  period: string
  'Excited/Happy': number
  'Calm/Content': number
  'Sad/Melancholic': number
  'Tense/Angry': number
  Neutral: number
}

interface EmotionStackedAreaProps {
  data: DataPoint[]
}

export function EmotionStackedArea({ data }: EmotionStackedAreaProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="period" />
        <YAxis />
        <Tooltip />
        <Area type="monotone" dataKey="Excited/Happy" stackId="1" stroke="#8884d8" fill="#8884d8" />
        <Area type="monotone" dataKey="Calm/Content" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
        <Area type="monotone" dataKey="Sad/Melancholic" stackId="1" stroke="#ffc658" fill="#ffc658" />
        <Area type="monotone" dataKey="Tense/Angry" stackId="1" stroke="#ff7300" fill="#ff7300" />
        <Area type="monotone" dataKey="Neutral" stackId="1" stroke="#00ff00" fill="#00ff00" />
      </AreaChart>
    </ResponsiveContainer>
  )
}