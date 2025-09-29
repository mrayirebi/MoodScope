"use client"

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trophy } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useRange } from '@/components/range-context'

type DayRec = {
  date: string
  count: number
  moodAvg: number | null
  dominantEmotion: string | null
  zscore?: number | null
  anomaly?: boolean
}

const colorFor = (emotion: string | null) => {
  switch (emotion) {
    case 'Excited/Happy': return 'bg-yellow-400 text-slate-900'
    case 'Calm/Content': return 'bg-sky-400 text-white'
    case 'Sad/Melancholic': return 'bg-purple-500 text-white'
    case 'Tense/Angry': return 'bg-rose-500 text-white'
    case 'Neutral': return 'bg-slate-300 text-slate-800'
    default: return 'bg-slate-200 text-slate-600'
  }
}

function monthName(i: number) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][i]
}

export default function YearlyCalendar() {
  const { source } = useRange()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [days, setDays] = useState<DayRec[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayData, setDayData] = useState<{
    date: string
    total: number
    breakdown: Array<{ category: string; count: number }>
  tracksByEmotion: Record<string, Array<{ id: string; name: string; artist: string; artistImage?: string | null; explicit?: boolean }>>
    topArtists?: Array<{ artist: string; imageUrl?: string | null; count: number }>
    debug?: Array<{
      playId: string
      track: { id: string; name: string }
      features: { valence: number; energy: number; danceability: number; acousticness: number; speechiness: number; tempo: number; loudness?: number | null; mode?: number | null; duration_ms?: number | null } | null
      arousal: number | null
      classified: { label: string; category: string; mood: number; confidence: number } | null
      stored: { category: string; moodScore: number } | null
    }>
  } | null>(null)
  const [loadingDay, setLoadingDay] = useState(false)
  const [timeZone, setTimeZone] = useState<string>('UTC')

  // Guard: ensure label rendered is one of expected v3 labels; otherwise fall back to category
  const isValidLabel = (s: any): s is 'Happy' | 'Calm' | 'Sad' | 'Tense' | 'Neutral' | 'Speech' => (
    s === 'Happy' || s === 'Calm' || s === 'Sad' || s === 'Tense' || s === 'Neutral' || s === 'Speech'
  )

  const dateKeyInTZ = (date: Date, tz: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    const d = parts.find(p => p.type === 'day')?.value
    return `${y}-${m}-${d}`
  }

  // Custom tooltip to list songs for the hovered emotion slice
  const renderPieTooltip = (props: any) => {
    const { active, payload } = props || {}
    if (!active || !payload || !payload.length) return null
    const p = payload[0]
    const category: string = p?.name ?? p?.payload?.category ?? 'Unknown'
    const value: number = p?.value ?? 0
    const tracks = dayData?.tracksByEmotion?.[category] ?? []
    return (
      <div className="max-w-[280px] max-h-56 overflow-auto rounded-md border border-slate-200 bg-white/95 p-2 text-slate-800 shadow-lg">
        <div className="text-sm font-semibold mb-1">{category} • {value}</div>
        {tracks.length ? (
          <ul className="text-xs list-disc pl-4 space-y-0.5">
            {tracks.map(t => (
              <li key={t.id} className="truncate">
                {t.name}
                {t.explicit ? (
                  <span
                    className="ml-1 inline-flex items-center justify-center text-[9px] leading-none font-semibold w-3.5 h-3.5 rounded border border-rose-400/30 text-rose-500"
                    title="Explicit"
                    aria-label="Explicit"
                  >E</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-slate-500">No tracks</div>
        )}
      </div>
    )
  }

  useEffect(() => {
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
    const run = async () => {
      setLoading(true)
      const url = `/api/heatmap?from=${start.toISOString()}&to=${end.toISOString()}${source && source!=='all' ? `&source=${encodeURIComponent(source)}` : ''}`
      const res = await fetch(url)
      if (!res.ok) { setDays([]); setLoading(false); return }
      const json = await res.json()
      setDays(json.days || [])
      if (json.timeZone) setTimeZone(json.timeZone)
      setLoading(false)
    }
    run()
  }, [year, source])

  const map = useMemo(() => new Map(days.map(d => [d.date, d])), [days])

  const MonthGrid = ({ m }: { m: number }) => {
    const first = new Date(year, m, 1)
    const firstDow = first.getDay()
    const daysInMonth = new Date(year, m + 1, 0).getDate()
  const tiles: Array<{ key: string; label?: number; cls?: string; title?: string; anomaly?: boolean; onClick?: () => void }> = []
    for (let i = 0; i < firstDow; i++) tiles.push({ key: `pad-${m}-${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m, d)
      const key = dateKeyInTZ(date, timeZone)
      const rec = map.get(key)
      const count = rec?.count ?? 0
      const hasEmotion = (rec?.moodAvg ?? null) !== null || (rec?.dominantEmotion ?? null) !== null
      const base = colorFor(rec?.dominantEmotion ?? null)
      // Subtle intensity by count
      const intensity = count === 0 ? 'opacity-40' : count < 5 ? 'opacity-70' : count < 15 ? 'opacity-85' : 'opacity-100'
      const onClick = () => {
        if (!hasEmotion) return
        setSelectedDate(key)
        setLoadingDay(true)
        const q = `${source && source !== 'all' ? `?source=${encodeURIComponent(source)}` : ''}${source && source !== 'all' ? '&' : '?'}debug=1`
        fetch(`/api/day/${key}${q}`).then(async r => {
          const j = r.ok ? await r.json() : null
          setDayData(j)
          setLoadingDay(false)
        }).catch(() => setLoadingDay(false))
      }
      tiles.push({
        key,
        label: d,
        cls: `${base} ${intensity} rounded h-7 text-[10px] flex items-center justify-center border border-white/10 ${hasEmotion ? 'cursor-pointer' : 'cursor-default'} relative`,
        title: `${key} • ${count} plays`,
        onClick: hasEmotion ? onClick : undefined,
        anomaly: !!rec?.anomaly,
      })
    }
    return (
      <div>
        <div className="text-xs font-medium text-slate-300 mb-1 px-1">{monthName(m)}</div>
        <div className="grid grid-cols-7 gap-1">
          {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-[10px] text-slate-500 text-center mb-0.5">{d}</div>)}
          {tiles.map(t => t.label ? (
            <div key={t.key} className={t.cls} title={t.title} onClick={t.onClick}>
              {t.label}
              {t.anomaly ? (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.75)]"
                  title="Anomalous day"
                  aria-label="Anomaly"
                />
              ) : null}
            </div>
          ) : (
            <div key={t.key} className="h-7" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Listening Calendar</CardTitle>
        <div className="flex items-center gap-2 text-sm">
          <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/5" onClick={() => setYear(y => y - 1)}>‹ Prev</button>
          <span className="min-w-[4ch] text-center">{year}</span>
          <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/5" onClick={() => setYear(y => y + 1)}>Next ›</button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
          </div>
        ) : (
          <div className="h-64 flex flex-col">
            <div className="flex-1 rounded-md border border-white/10 bg-white/5 overflow-y-auto px-2 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 12 }, (_, i) => <MonthGrid key={i} m={i} />)}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-400" /> Excited/Happy</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-sky-400" /> Calm/Content</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-500" /> Sad/Melancholic</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-rose-500" /> Tense/Angry</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-slate-300" /> Neutral</div>
              <div className="flex items-center gap-1" title="|z| > 2 over daily mood average"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Anomaly</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    {selectedDate && createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={() => { setSelectedDate(null); setDayData(null) }}>
        <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-3xl shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="font-semibold">Emotions for {selectedDate}</div>
            <button className="px-2 py-1 rounded hover:bg-white/5" onClick={() => { setSelectedDate(null); setDayData(null) }}>Close</button>
          </div>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-56">
              {loadingDay ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                </div>
              ) : ((dayData?.breakdown?.length ?? 0) > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={renderPieTooltip} />
                    <Legend verticalAlign="bottom" height={24} />
                    <Pie dataKey="count" nameKey="category" data={dayData!.breakdown} outerRadius={80} label>
                      {(dayData!.breakdown).map((entry, i) => {
                        const color = entry.category === 'Excited/Happy' ? '#FACC15'
                          : entry.category === 'Calm/Content' ? '#38BDF8'
                          : entry.category === 'Sad/Melancholic' ? '#8B5CF6'
                          : entry.category === 'Tense/Angry' ? '#F43F5E'
                          : entry.category === 'Neutral' ? '#CBD5E1'
                          : '#94A3B8'
                        return <Cell key={i} fill={color} />
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-slate-400">No emotion data for this day.</div>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto pr-1">
              {loadingDay ? null : (Object.keys(dayData?.tracksByEmotion ?? {}).length > 0) ? (
                <div className="space-y-3">
                  {Object.entries(dayData!.tracksByEmotion).map(([cat, tracks]) => (
                    <div key={cat}>
                      <div className="text-xs font-semibold mb-1">{cat}</div>
                      <ul className="text-sm text-slate-300 space-y-1">
                        {tracks.map(t => (
                          <li key={t.id} className="flex items-center gap-2">
                            {t.artistImage ? (
                              <img src={t.artistImage} alt={t.artist} className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">{t.artist.slice(0,1).toUpperCase()}</div>
                            )}
                            <div className="min-w-0">
                              <span className="font-medium truncate">{t.name}</span>
                              {t.explicit ? (
                                <span
                                  className="ml-1 inline-flex items-center justify-center text-[10px] leading-none font-semibold w-4 h-4 rounded border border-rose-400/30 text-rose-300/90"
                                  title="Explicit"
                                  aria-label="Explicit"
                                >E</span>
                              ) : null}
                              <span className="text-slate-400"> — {t.artist}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400">No tracks available.</div>
              )}
            </div>
          </div>
          {(!loadingDay && (dayData?.topArtists?.length ?? 0) > 0) && (
            <div className="px-4 pb-4">
              <div className="text-sm font-semibold mb-2">Top artists</div>
              <ul className="text-sm text-slate-300 space-y-1">
                  {dayData!.topArtists!.map((a, i) => (
                  <li key={a.artist} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {/* Trophy for top 3 */}
                        {i < 3 ? (
                          <span
                            className="shrink-0 inline-flex items-center justify-center w-5"
                            title={i===0? 'Gold': i===1? 'Silver':'Bronze'}
                            aria-label={`Rank ${i+1}`}
                          >
                            <Trophy
                              className={`w-4 h-4 ${
                                i===0 ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]'
                                : i===1 ? 'text-slate-300'
                                : 'text-amber-700'
                              }`}
                              strokeWidth={2}
                            />
                          </span>
                        ) : (
                          <span className="w-5" />
                        )}
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt={a.artist} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">{a.artist.slice(0,1).toUpperCase()}</div>
                      )}
                      <span className="truncate">{a.artist}</span>
                    </div>
                    <span className="text-slate-400">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(!loadingDay && (dayData?.debug?.length ?? 0) > 0) && (
            <div className="px-4 pb-4">
              <div className="text-sm font-semibold mb-2">Debug</div>
              <div className="rounded border border-white/10 overflow-hidden">
                <div className="grid grid-cols-6 text-[11px] bg-white/5 px-2 py-1 text-slate-400">
                  <div className="truncate">Track</div>
                  <div className="truncate">Valence</div>
                  <div className="truncate">Energy</div>
                  <div className="truncate">Arousal</div>
                  <div className="truncate">Label</div>
                  <div className="truncate">Conf.</div>
                </div>
                <div className="max-h-40 overflow-auto divide-y divide-white/10">
                  {dayData!.debug!.map((d, i) => (
                    <div key={d.playId} className="grid grid-cols-6 text-[11px] px-2 py-1">
                      <div className="truncate" title={d.track.name}>{d.track.name}</div>
                      <div>{d.features ? d.features.valence.toFixed(2) : '—'}</div>
                      <div>{d.features ? d.features.energy.toFixed(2) : '—'}</div>
                      <div>{typeof d.arousal === 'number' ? d.arousal.toFixed(2) : '—'}</div>
                      <div>{d.classified?.label ? (isValidLabel(d.classified.label) ? d.classified.label : d.classified.category) : '—'}</div>
                      <div>{d.classified ? d.classified.confidence.toFixed(2) : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Tip: If valence/energy look like 0–100 instead of 0–1, fix scaling on write; high speechiness often forces Neutral.
              </div>
            </div>
          )}
        </div>
      </div>,
      typeof window !== 'undefined' ? document.body : (undefined as any)
    )}
  </>
  )
}
