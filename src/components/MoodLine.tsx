'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface DataPoint {
  date: string
  mood: number
  sma: number
}

interface MoodLineProps {
  data: DataPoint[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{`Date: ${label}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {`${entry.dataKey === 'mood' ? 'Daily Mood' : '7-Day Average'}: ${(entry.value * 100).toFixed(1)}%`}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function MoodLine({ data }: MoodLineProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          stroke="#666"
          fontSize={12}
          tickLine={false}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          label={{ value: 'Mood Score (%)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
        />
        <Line
          type="monotone"
          dataKey="mood"
          stroke="#3B82F6"
          strokeWidth={2}
          dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: '#fff' }}
          name="Daily Mood"
        />
        <Line
          type="monotone"
          dataKey="sma"
          stroke="#10B981"
          strokeWidth={3}
          strokeDasharray="5 5"
          dot={false}
          name="7-Day Average"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}