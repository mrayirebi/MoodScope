"use client"

import { useEffect, useState } from 'react'

type MeData = { playsCount: number; emotionsCount: number; range: { min: string | null; max: string | null } }

export default function DataDebug() {
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState<MeData | null>(null)
  const [months, setMonths] = useState<any[] | null>(null)
  const [days, setDays] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const meRes = await fetch('/api/me/data')
        const meJson = await meRes.json()
        setMe(meJson)
        const mRes = await fetch('/api/aggregate?group=month')
        const mJson = await mRes.json()
        setMonths(mJson)
        if (meJson?.range?.max) {
          const max = new Date(meJson.range.max)
          const start = new Date(max.getFullYear(), max.getMonth(), 1, 0, 0, 0, 0).toISOString()
          const end = new Date(max.getFullYear(), max.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
          const dRes = await fetch(`/api/aggregate?group=day&from=${start}&to=${end}`)
          const dJson = await dRes.json()
          setDays(dJson)
        }
      } catch (e: any) {
        setErr(e?.message || 'debug fetch failed')
      }
    }
    if (open) run()
  }, [open])

  return (
    <div className="mt-4">
      <button className="text-xs text-slate-600 underline" onClick={() => setOpen(v => !v)}>
        {open ? 'Hide Debug' : 'Show Debug'}
      </button>
      {open && (
        <div className="mt-2 p-3 border rounded bg-slate-50 text-xs text-slate-700 overflow-auto max-h-64">
          {err && <div className="text-rose-600 mb-2">{err}</div>}
          <div className="mb-2"><strong>/api/me/data</strong>
            <pre className="whitespace-pre-wrap">{JSON.stringify(me, null, 2)}</pre>
          </div>
          <div className="mb-2"><strong>/api/aggregate?group=month (first 5)</strong>
            <pre className="whitespace-pre-wrap">{JSON.stringify(months?.slice?.(0,5) ?? months, null, 2)}</pre>
          </div>
          <div className="mb-2"><strong>/api/aggregate?group=day (month of max, first 10)</strong>
            <pre className="whitespace-pre-wrap">{JSON.stringify(days?.slice?.(0,10) ?? days, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )}
