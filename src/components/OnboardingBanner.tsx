"use client"

import { useEffect, useState } from 'react'

type MeData = { playsCount: number; emotionsCount: number; range: { min: string | null; max: string | null } }

export default function OnboardingBanner() {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'demo' | 'emotions'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/me/data')
        const json = await res.json()
        setMe(json)
      } catch (e: any) {
        setError(e?.message || 'Failed to check data status')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) return null
  const hasData = (me?.playsCount ?? 0) > 0 && (me?.emotionsCount ?? 0) > 0
  if (hasData) return null

  const onDemo = async () => {
    setBusy('demo'); setError(null)
    try {
      const r = await fetch('/api/import/demo', { method: 'POST' })
      if (!r.ok) throw new Error('Demo import failed')
      location.reload()
    } catch (e: any) {
      setError(e?.message || 'Demo import failed')
      setBusy(null)
    }
  }
  const onEmotions = async () => {
    setBusy('emotions'); setError(null)
    try {
      const r = await fetch('/api/me/backfill-emotions', { method: 'POST' })
      if (!r.ok) throw new Error('Backfill failed')
      location.reload()
    } catch (e: any) {
      setError(e?.message || 'Backfill failed')
      setBusy(null)
    }
  }

  return (
    <div className="mb-6 border rounded-xl bg-amber-50 border-amber-200 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-amber-900">Get started</h4>
          <p className="text-sm text-amber-900/80">No listening data detected yet. Load sample data or generate emotions for existing plays to see charts.</p>
          {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onDemo} disabled={busy!==null} className="px-3 py-1.5 text-xs rounded border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50">{busy==='demo'?'Loading…':'Load Demo Data'}</button>
          <button onClick={onEmotions} disabled={busy!==null} className="px-3 py-1.5 text-xs rounded border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50">{busy==='emotions'?'Generating…':'Generate Emotions'}</button>
        </div>
      </div>
    </div>
  )
}
