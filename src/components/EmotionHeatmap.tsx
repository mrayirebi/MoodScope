'use client'

import { useEffect, useMemo, useState } from 'react'

interface CalendarData {
  dateKey: number
  count: number
  avgMood: number
  dominantCategory: string | null
}

export default function EmotionHeatmap() {
  const [data, setData] = useState<CalendarData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [minDate, setMinDate] = useState<Date | null>(null)
  const [maxDate, setMaxDate] = useState<Date | null>(null)
  const [rangeLoading, setRangeLoading] = useState(true)
  const [dataMonths, setDataMonths] = useState<number[]>([])

  useEffect(() => {
    // Load overall range (earliest/latest month with activity)
    const fetchRange = async () => {
      try {
        const res = await fetch('/api/aggregate?group=month')
        if (!res.ok) throw new Error('Failed to load range')
        const obj = await res.json()
        const rows = Array.isArray(obj) ? obj : (obj?.rows || [])
        if (!Array.isArray(rows) || rows.length === 0) {
          setMinDate(null)
          setMaxDate(null)
          return
        }
        const periods = rows
          .map((r: any) => new Date(r.period))
          .filter((d: Date) => !isNaN(d.getTime()))

        if (periods.length === 0) {
          setMinDate(null)
          setMaxDate(null)
          return
        }

  const min = new Date(Math.min(...periods.map(d => d.getTime())))
  const max = new Date(Math.max(...periods.map(d => d.getTime())))

        // Normalize to first day of month
        const minNorm = new Date(min.getFullYear(), min.getMonth(), 1)
        const maxNorm = new Date(max.getFullYear(), max.getMonth(), 1)

        setMinDate(minNorm)
        setMaxDate(maxNorm)

        // Build list of months that have data
        const monthKeys = Array.from(
          new Set(
            rows
              .map((r: any) => new Date(r.period))
              .filter((d: Date) => !isNaN(d.getTime()))
              .map((d: Date) => d.getFullYear() * 12 + d.getMonth())
          )
        ).sort((a, b) => a - b)
        setDataMonths(monthKeys)

        // Auto-jump to latest data month if current not within range
        const curNorm = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        if (curNorm < minNorm || curNorm > maxNorm) {
          setCurrentDate(maxNorm)
        }
      } catch (e) {
        console.error(e)
        setMinDate(null)
        setMaxDate(null)
      } finally {
        setRangeLoading(false)
      }
    }
    fetchRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchCalendarData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  const fetchCalendarData = async () => {
    try {
      // Build a stable day key in UTC days since epoch to avoid tz drift
      const dayKeyUTC = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000)

      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0)
  // Include the entire last day (23:59:59.999) so we don't drop that day in the filter
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999)

      const response = await fetch(`/api/aggregate?group=day&from=${startOfMonth.toISOString()}&to=${endOfMonth.toISOString()}`)
      if (response.ok) {
        const obj = await response.json()
        const rawData = Array.isArray(obj) ? obj : (obj?.rows || [])
        // Group by date, accumulate counts per category, and weighted mood
        const dateMap = new Map<number, { totalCount: number, moodSum: number, perCategory: Record<string, number> }>()

        rawData.forEach((item: any) => {
          // Use UTC date key to match server-side DATE_TRUNC results (UTC)
          // Use UTC day key to match server-side DATE_TRUNC results (UTC)
          const date = dayKeyUTC(new Date(item.period))
          const cnt = Number(item.value) || 0
          const avg = Number(item.avg_mood) || 0
          const cat = String(item.category || 'Neutral')
          const existing = dateMap.get(date) || { totalCount: 0, moodSum: 0, perCategory: {} }
          existing.totalCount += cnt
          existing.moodSum += avg * cnt
          existing.perCategory[cat] = (existing.perCategory[cat] || 0) + cnt
          dateMap.set(date, existing)
        })

        const calendarData: CalendarData[] = Array.from(dateMap.entries()).map(([dateKey, values]) => {
          let dominantCategory: string | null = null
          let maxCount = -1
          for (const [cat, c] of Object.entries(values.perCategory)) {
            if (c > maxCount) {
              maxCount = c
              dominantCategory = cat
            }
          }
        
          return {
            dateKey,
            count: values.totalCount,
            avgMood: values.totalCount > 0 ? values.moodSum / values.totalCount : 0,
            dominantCategory,
          }
        })

        setData(calendarData)
      } else {
        setData([])
      }
    } catch (error) {
      console.error('Failed to fetch calendar data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fast lookup map keyed by UTC day
  const dayMap = useMemo(() => {
    const m = new Map<number, CalendarData>()
    for (const d of data) m.set(d.dateKey, d)
    return m
  }, [data])

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    return { daysInMonth, startingDayOfWeek }
  }

  const getActivityLevel = (count: number) => {
    if (count === 0) return 'none'
    if (count < 5) return 'low'
    if (count < 15) return 'medium'
    if (count < 30) return 'high'
    return 'very-high'
  }

  // Emotion color mapping (dominant mood drives color)
  const categoryTileBase = (category: string | null) => {
    switch (category) {
      case 'Excited/Happy':
        return 'bg-yellow-400 text-slate-900 border-yellow-500'
      case 'Calm/Content':
        return 'bg-sky-400 text-white border-sky-500'
      case 'Sad/Melancholic':
        return 'bg-purple-500 text-white border-purple-600'
      case 'Tense/Angry':
        return 'bg-rose-500 text-white border-rose-600'
      case 'Neutral':
        return 'bg-slate-300 text-slate-800 border-slate-400'
      default:
        return 'bg-slate-100 text-slate-400 border-slate-200'
    }
  }

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']

  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const dateFromMonthKey = (k: number) => new Date(Math.floor(k / 12), k % 12, 1)

  const findNearestIndex = (targetKey: number) => {
    if (dataMonths.length === 0) return -1
    let bestIdx = 0
    let bestDiff = Math.abs(dataMonths[0] - targetKey)
    for (let i = 1; i < dataMonths.length; i++) {
      const diff = Math.abs(dataMonths[i] - targetKey)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    return bestIdx
  }

  const isPrevDisabled = useMemo(() => {
    if (!minDate) return false
    return monthKey(currentDate) <= monthKey(minDate)
  }, [currentDate, minDate])

  const isNextDisabled = useMemo(() => {
    if (!maxDate) return false
    return monthKey(currentDate) >= monthKey(maxDate)
  }, [currentDate, maxDate])

  const navigateMonth = (direction: number) => {
    if (dataMonths.length === 0) return
    const curKey = monthKey(currentDate)
    let idx = dataMonths.indexOf(curKey)
    if (idx === -1) idx = findNearestIndex(curKey)
    let nextIdx = idx + (direction > 0 ? 1 : -1)
    if (nextIdx < 0 || nextIdx >= dataMonths.length) return
    setCurrentDate(dateFromMonthKey(dataMonths[nextIdx]))
  }

  const navigateYear = (direction: number) => {
    if (dataMonths.length === 0) return
    const curKey = monthKey(currentDate)
    const targetKey = curKey + direction * 12
    // Prefer first data month on/after target when moving forward, on/before when moving backward
    if (direction > 0) {
      const candidate = dataMonths.find((k) => k >= targetKey)
      if (candidate !== undefined) return setCurrentDate(dateFromMonthKey(candidate))
      return setCurrentDate(dateFromMonthKey(dataMonths[dataMonths.length - 1]))
    } else {
      const reversed = [...dataMonths].reverse()
      const candidate = reversed.find((k) => k <= targetKey)
      if (candidate !== undefined) return setCurrentDate(dateFromMonthKey(candidate))
      return setCurrentDate(dateFromMonthKey(dataMonths[0]))
    }
  }

  const jumpToStart = () => {
    if (minDate) setCurrentDate(minDate)
  }
  const jumpToEnd = () => {
    if (maxDate) setCurrentDate(maxDate)
  }
  const jumpToToday = () => {
    const today = new Date()
    const key = monthKey(today)
    if (dataMonths.includes(key)) {
      setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    } else if (dataMonths.length > 0) {
      const nearestIdx = findNearestIndex(key)
      setCurrentDate(dateFromMonthKey(dataMonths[nearestIdx]))
    }
  }

  if (loading || rangeLoading) {
    return (
      <div className="h-96 bg-white rounded-xl flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <div className="">
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={jumpToStart}
            disabled={!minDate}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Jump to first month with activity"
          >
            « First
          </button>
          <button
            onClick={() => navigateYear(-1)}
            disabled={isPrevDisabled}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Previous year"
          >
            ‹ Year
          </button>
          <button
            onClick={() => navigateMonth(-1)}
            disabled={isPrevDisabled}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Previous month"
          >
            ‹ Month
          </button>
          <select
            aria-label="Select month"
            className="px-2 py-1 text-xs rounded border text-slate-700 bg-white"
            value={currentDate.getMonth()}
            onChange={(e) => {
              const m = Number(e.target.value)
              const targetKey = currentDate.getFullYear() * 12 + m
              if (dataMonths.includes(targetKey)) {
                setCurrentDate(dateFromMonthKey(targetKey))
              } else if (dataMonths.length > 0) {
                const nearestIdx = findNearestIndex(targetKey)
                setCurrentDate(dateFromMonthKey(dataMonths[nearestIdx]))
              }
            }}
          >
            {months.map((m, idx) => (
              <option
                key={m}
                value={idx}
                disabled={!dataMonths.includes(currentDate.getFullYear() * 12 + idx)}
              >
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Select year"
            className="px-2 py-1 text-xs rounded border text-slate-700 bg-white"
            value={currentDate.getFullYear()}
            onChange={(e) => {
              const y = Number(e.target.value)
              const candidates = dataMonths.filter((k) => Math.floor(k / 12) === y)
              if (candidates.length > 0) {
                // choose same month if available, otherwise nearest within that year
                const desiredKey = y * 12 + currentDate.getMonth()
                const exact = candidates.find((k) => k === desiredKey)
                if (exact !== undefined) return setCurrentDate(dateFromMonthKey(exact))
                // nearest in that year
                let best = candidates[0]
                let bestDiff = Math.abs(candidates[0] - desiredKey)
                for (let i = 1; i < candidates.length; i++) {
                  const diff = Math.abs(candidates[i] - desiredKey)
                  if (diff < bestDiff) {
                    bestDiff = diff
                    best = candidates[i]
                  }
                }
                return setCurrentDate(dateFromMonthKey(best))
              } else if (dataMonths.length > 0) {
                // fallback to nearest month with data overall
                const nearestIdx = findNearestIndex(y * 12 + currentDate.getMonth())
                setCurrentDate(dateFromMonthKey(dataMonths[nearestIdx]))
              }
            }}
          >
            {(() => {
              const years: number[] = []
              const startY = minDate ? minDate.getFullYear() : currentDate.getFullYear() - 5
              const endY = maxDate ? maxDate.getFullYear() : currentDate.getFullYear() + 5
              for (let y = startY; y <= endY; y++) years.push(y)
              return years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))
            })()}
          </select>
          <button
            onClick={() => navigateMonth(1)}
            disabled={isNextDisabled}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Next month"
          >
            Month ›
          </button>
          <button
            onClick={() => navigateYear(1)}
            disabled={isNextDisabled}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Next year"
          >
            Year ›
          </button>
          <button
            onClick={jumpToToday}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50"
            title="Jump to current month or nearest with data"
          >
            Today
          </button>
          <button
            onClick={jumpToEnd}
            disabled={!maxDate}
            className="px-2 py-1 text-xs rounded border text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Jump to last month with activity"
          >
            Last »
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map(day => (
          <div key={day} className="text-center text-slate-500 text-xs font-medium py-2">
            {day}
          </div>
        ))}

        {Array.from({ length: startingDayOfWeek }, (_, i) => (
          <div key={`empty-${i}`} className="aspect-square"></div>
        ))}

        {Array.from({ length: daysInMonth }, (_, day) => {
          // Build UTC day key directly from calendar year/month/day to avoid tz drift
          const y = currentDate.getFullYear()
          const m = currentDate.getMonth()
          const dnum = day + 1
          const tileKey = Math.floor(Date.UTC(y, m, dnum) / 86400000)
          const date = new Date(y, m, dnum)
          const dayData = dayMap.get(tileKey)
          const activityLevel = getActivityLevel(dayData?.count || 0)

          return (
            <div
              key={day + 1}
              className={`aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-150 hover:ring-2 hover:ring-white/30 cursor-pointer ${
                dayData && dayData.count > 0 ? `${categoryTileBase(dayData.dominantCategory)} border` : 'bg-white/10 text-white/50 border border-white/20'
              }`}
              title={dayData ? `${date.toDateString()} • ${dayData.count} plays • Dominant: ${dayData.dominantCategory || 'N/A'} • Avg mood: ${dayData.avgMood.toFixed(2)}` : `${date.toDateString()} • No activity`}
            >
              {day + 1}
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">Legend:</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 border border-yellow-500 inline-block"></span>Excited/Happy</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-400 border border-sky-500 inline-block"></span>Calm/Content</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 border border-purple-600 inline-block"></span>Sad/Melancholic</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500 border border-rose-600 inline-block"></span>Tense/Angry</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300 border border-slate-400 inline-block"></span>Neutral</span>
        </div>
        <div className="text-right text-slate-500">Color represents dominant mood; size and number indicate day.</div>
      </div>
    </div>
  )
}