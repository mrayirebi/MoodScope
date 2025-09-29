'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRange } from '@/components/range-context'

function UploadSection() {
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [loadingRichDemo, setLoadingRichDemo] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [generatingV2, setGeneratingV2] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const { aiMode } = useRange()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files)
  }

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setMessage('Please select files first')
      return
    }

    setUploading(true)
    setMessage('')

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`/api/import/upload?ai=${encodeURIComponent(aiMode)}`, {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Upload failed')
        }

        setMessage(`Successfully uploaded ${files.length} file(s)!`)
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  const handleLoadDemo = async () => {
    setLoadingDemo(true)
    setMessage('')
    try {
  const res = await fetch(`/api/import/demo?ai=${encodeURIComponent(aiMode)}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load demo data')
      setMessage(body.message || 'Demo data loaded')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Failed to load demo data'}`)
    } finally {
      setLoadingDemo(false)
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    setMessage('')
    try {
  const res = await fetch(`/api/me/backfill-emotions?ai=${encodeURIComponent(aiMode)}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to generate emotions')
      setMessage(body.message || 'Emotions generated')
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Failed to generate emotions'}`)
    } finally {
      setBackfilling(false)
    }
  }

  const handleLoadRichDemo = async () => {
    setLoadingRichDemo(true)
    setMessage('')
    try {
  const res = await fetch(`/api/import/demo-rich?ai=${encodeURIComponent(aiMode)}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load rich demo data')
      setMessage(body.message || 'Rich demo data loaded')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Failed to load rich demo data'}`)
    } finally {
      setLoadingRichDemo(false)
    }
  }

  const handleGenerateV2 = async () => {
    setGeneratingV2(true)
    setMessage('')
    try {
      const res = await fetch('/api/emotions/generate', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to generate v2 emotions')
      setMessage(body.message || `Generated ${body.created ?? ''} emotions`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Failed to generate v2 emotions'}`)
    } finally {
      setGeneratingV2(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage('')
    try {
  const res = await fetch(`/api/import/sync?ai=${encodeURIComponent(aiMode)}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to sync from Spotify')
      setMessage(body.message || `Imported ${body.imported ?? ''} plays`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Failed to sync from Spotify'}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
  <label className="block text-sm font-medium text-slate-700 mb-2">
          Select your Spotify StreamingHistory JSON files:
        </label>
        <input
          type="file"
          multiple
          accept=".json"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:text-sm file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50"
        />
        {files && (
          <p className="mt-2 text-sm text-slate-600">
            {files.length} file(s) selected
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={handleUpload}
          disabled={!files || uploading}
          className="w-full sm:w-auto"
        >
          {uploading ? 'Uploading...' : 'Upload and Analyze'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleLoadDemo}
          disabled={loadingDemo}
          className="w-full sm:w-auto"
        >
          {loadingDemo ? 'Loading Demo…' : 'Load Demo Data'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleLoadRichDemo}
          disabled={loadingRichDemo}
          className="w-full sm:w-auto"
        >
          {loadingRichDemo ? 'Loading Rich Demo…' : 'Load Rich Demo Data'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleBackfill}
          disabled={backfilling}
          className="w-full sm:w-auto"
        >
          {backfilling ? 'Generating…' : 'Generate Emotions'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSync}
          disabled={syncing}
          className="w-full sm:w-auto"
        >
          {syncing ? 'Syncing…' : 'Sync recent plays (Spotify)'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleGenerateV2}
          disabled={generatingV2}
          className="w-full sm:w-auto"
        >
          {generatingV2 ? 'Generating v2…' : 'Generate Emotions (v2)'}
        </Button>
      </div>

      {message && (
  <div className={`p-3 rounded ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}

  <div className="text-sm text-slate-600">
        <p>
          <strong>Note:</strong> Your JSON files should be named like
          {' '}<code>StreamingHistory0.json</code>, <code>StreamingHistory1.json</code>, etc.
        </p>
        <p>You can download these from your Spotify account privacy settings.</p>
      </div>
    </div>
  )
}

export { UploadSection }
export default UploadSection