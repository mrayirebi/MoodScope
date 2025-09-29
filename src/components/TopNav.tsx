"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Calendar, User, LogOut, Trash2, ChevronDown } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRange } from '@/components/range-context'
import { useSession } from 'next-auth/react'

export default function TopNav() {
  const { theme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { range, setRange, source, setSource, aiMode, setAiMode } = useRange()
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const [hasData, setHasData] = useState<boolean>(false)
  const [aiProvider, setAiProvider] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let ignore = false
    if (!isAuthed) { setHasData(false); return }
    fetch('/api/me/data')
      .then(r => r.ok ? r.json() : { playsCount: 0 })
      .then(j => { if (!ignore) setHasData((j?.playsCount ?? 0) > 0) })
      .catch(() => { if (!ignore) setHasData(false) })
    return () => { ignore = true }
  }, [isAuthed])

  // Fetch AI provider status for small badge
  useEffect(() => {
    let ignore = false
    fetch('/api/ai/status')
      .then(r => r.ok ? r.json() : { enabled: false, provider: null })
      .then(j => { if (!ignore) setAiProvider(j?.enabled ? (j.provider||null) : null) })
      .catch(() => { if (!ignore) setAiProvider(null) })
    return () => { ignore = true }
  }, [])

  const onDelete = async () => {
    if (!confirm('Delete all data? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/me/data', { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      location.reload()
    } catch (e) {
      console.error(e)
      setDeleting(false)
    }
  }

  return (
  <nav className="relative sticky top-0 z-40 border-b border-white/10 bg-black/30 backdrop-blur">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 h-40 opacity-60">
        <div className="absolute inset-0" style={{background: 'radial-gradient(30rem 10rem at 50% 120%, rgba(56,189,248,0.15), transparent 70%)'}} />
        <img src="/backgrounds/wave-1.svg" alt="" className="absolute inset-x-0 bottom-0 w-full h-24 object-cover opacity-70" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-lg text-slate-900 dark:text-slate-100">
            <img src="/brand/logo-mark.svg" alt="" className="w-6 h-6" />
            MoodScope
          </Link>
          {isAuthed && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Calendar className="w-4 h-4" />
              <span>Range:</span>
              <div className="flex rounded-md border border-slate-300/40 dark:border-white/10 overflow-hidden">
                {(['90d','365d','all'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2 py-1 text-xs ${range===r? 'bg-slate-200 dark:bg-white/10':'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                  >
                    {r==='all'?'All':r}
                  </button>
                ))}
              </div>
              <span className="ml-3">Source:</span>
              <div className="flex rounded-md border border-slate-300/40 dark:border-white/10 overflow-hidden">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'oauth', label: 'Sync' },
                  { key: 'upload', label: 'Upload' },
                  { key: 'demo', label: 'Demo' },
                  { key: 'demo-rich', label: 'Demo Rich' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setSource(opt.key as any)}
                    className={`px-2 py-1 text-xs ${source===opt.key? 'bg-slate-200 dark:bg-white/10':'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                    title={`Filter to ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="ml-3">AI:</span>
              <div className="flex rounded-md border border-slate-300/40 dark:border-white/10 overflow-hidden">
                {([
                  { key: 'auto', label: 'Auto' },
                  { key: 'only', label: 'AI only' },
                  { key: 'web', label: 'Web' },
                  { key: 'off', label: 'Off' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setAiMode(opt.key as any)}
                    className={`px-2 py-1 text-xs ${aiMode===opt.key? 'bg-slate-200 dark:bg-white/10':'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                    title={`AI mode: ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {aiProvider && (
                <span className="ml-2 px-2 py-0.5 rounded text-xs border border-emerald-400/40 text-emerald-300/90">
                  {aiProvider === 'azure' ? 'Azure AI' : 'OpenAI'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            suppressHydrationWarning
          >
            {(!mounted || theme === 'dark') ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          {isAuthed && (
            <>
              <Link href="/api/auth/signout" className="hidden sm:inline-flex">
                <Button variant="outline" className="gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </Button>
              </Link>
              <div className="relative">
                <Button variant="ghost" onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
                  <User className="w-4 h-4 mr-2" /> Account
                  <ChevronDown className="w-4 h-4 ml-2 opacity-70" />
                </Button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-48 glass p-2">
                    <Link href="/api/auth/signout" className="flex items-center gap-2 px-2 py-2 rounded hover:bg-white/5"><LogOut className="w-4 h-4"/> Sign out</Link>
                    <button onClick={onDelete} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/5 text-red-300">
                      <Trash2 className="w-4 h-4"/>
                      {deleting ? 'Deleting…' : 'Delete data'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}