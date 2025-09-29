'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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

const emotionColors = {
  'Excited/Happy': '#FFD700', // Gold
  'Calm/Content': '#87CEEB', // Sky blue
  'Sad/Melancholic': '#9370DB', // Medium purple
  'Tense/Angry': '#FF6347', // Tomato red
  'Neutral': '#98FB98' // Pale green
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0)
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{`Period: ${label}`}</p>
        <p className="text-sm text-gray-600">{`Total: ${total.toFixed(1)}%`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {`${entry.dataKey}: ${entry.value.toFixed(1)}%`}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function EmotionStackedArea({ data }: EmotionStackedAreaProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
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
          dataKey="period"
          stroke="#666"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          stroke="#666"
          fontSize={12}
          tickLine={false}
          label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="rect"
        />
        <Area
          type="monotone"
          dataKey="Excited/Happy"
          stackId="1"
          stroke={emotionColors['Excited/Happy']}
          fill={emotionColors['Excited/Happy']}
          fillOpacity={0.8}
        />
        <Area
          type="monotone"
          dataKey="Calm/Content"
          stackId="1"
          stroke={emotionColors['Calm/Content']}
          fill={emotionColors['Calm/Content']}
          fillOpacity={0.8}
        />
        <Area
          type="monotone"
          dataKey="Sad/Melancholic"
          stackId="1"
          stroke={emotionColors['Sad/Melancholic']}
          fill={emotionColors['Sad/Melancholic']}
          fillOpacity={0.8}
        />
        <Area
          type="monotone"
          dataKey="Tense/Angry"
          stackId="1"
          stroke={emotionColors['Tense/Angry']}
          fill={emotionColors['Tense/Angry']}
          fillOpacity={0.8}
        />
        <Area
          type="monotone"
          dataKey="Neutral"
          stackId="1"
          stroke={emotionColors['Neutral']}
          fill={emotionColors['Neutral']}
          fillOpacity={0.8}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}