import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">MoodScope</h1>
          <p className="mb-8">Analyze your Spotify listening emotions</p>
          <Button>Connect Spotify</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">MoodScope</h1>
            <div className="flex items-center space-x-4">
              <span>Welcome, {session.user?.email}</span>
              <Button variant="outline">Settings</Button>
              <Button variant="outline">Delete Data</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Placeholder for charts */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Emotion by Month</h3>
              <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                Chart Placeholder
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Daily Mood Score</h3>
              <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                Chart Placeholder
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Heatmap</h3>
              <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                Chart Placeholder
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}