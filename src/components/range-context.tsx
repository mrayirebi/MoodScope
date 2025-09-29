"use client"

import { createContext, useContext, useEffect, useState } from 'react'

export type RangeKey = '90d' | '365d' | 'all'
export type DataSource = 'all' | 'oauth' | 'upload' | 'demo' | 'demo-rich'
export type AiMode = 'auto' | 'only' | 'off'

type RangeContextValue = {
  range: RangeKey
  setRange: (r: RangeKey) => void
  source: DataSource
  setSource: (s: DataSource) => void
  aiMode: AiMode
  setAiMode: (m: AiMode) => void
}

const RangeContext = createContext<RangeContextValue | undefined>(undefined)

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<RangeKey>(() => {
    try {
      const r = localStorage.getItem('moodscope.range') as RangeKey | null
      if (r === '90d' || r === '365d' || r === 'all') return r
    } catch {}
    return 'all'
  })
  const [source, setSource] = useState<DataSource>(() => {
    try {
      const s = localStorage.getItem('moodscope.source') as DataSource | null
      if (s === 'all' || s === 'oauth' || s === 'upload' || s === 'demo' || s === 'demo-rich') return s
    } catch {}
    return 'all'
  })
  const [aiMode, setAiMode] = useState<AiMode>(() => {
    try {
      const a = localStorage.getItem('moodscope.aiMode') as AiMode | null
      if (a === 'auto' || a === 'only' || a === 'off') return a
    } catch {}
    return 'auto'
  })

  // Persist on change
  useEffect(() => {
    try { localStorage.setItem('moodscope.range', range) } catch {}
  }, [range])
  useEffect(() => {
    try { localStorage.setItem('moodscope.source', source) } catch {}
  }, [source])
  useEffect(() => {
    try { localStorage.setItem('moodscope.aiMode', aiMode) } catch {}
  }, [aiMode])
  return (
    <RangeContext.Provider value={{ range, setRange, source, setSource, aiMode, setAiMode }}>
      {children}
    </RangeContext.Provider>
  )
}

export function useRange() {
  const ctx = useContext(RangeContext)
  if (!ctx) throw new Error('useRange must be used within RangeProvider')
  return ctx
}
