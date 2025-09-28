'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  date: string
  mood: number
  sma: number
}

interface MoodLineProps {
  data: DataPoint[]
}

export function MoodLine({ data }: MoodLineProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0, 1]} />
        <Tooltip />
        <Line type="monotone" dataKey="mood" stroke="#8884d8" />
        <Line type="monotone" dataKey="sma" stroke="#82ca9d" strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  )
}