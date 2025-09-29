'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function DeleteDataButton() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete all your data? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    setMessage('')

    try {
      const response = await fetch('/api/me/data', {
        method: 'DELETE',
      })

      if (response.ok) {
        setMessage('All data deleted successfully!')
        // Refresh the page after a short delay to show updated charts
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        const error = await response.json()
        setMessage(`Error: ${error.error || 'Failed to delete data'}`)
      }
    } catch (error) {
      setMessage('Error: Failed to delete data')
      console.error('Delete error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-end space-y-2">
      <Button
        onClick={handleDelete}
        disabled={isDeleting}
        variant="outline"
        className="border-amber-200 text-amber-700 hover:bg-amber-50"
      >
        {isDeleting ? 'Deleting...' : '🗑️ Delete Data'}
      </Button>
      {message && (
        <div className={`text-xs px-3 py-2 rounded-md ${
          message.includes('Error')
            ? 'bg-red-500/20 border border-red-500/30 text-red-200'
            : 'bg-green-500/20 border border-green-500/30 text-green-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}