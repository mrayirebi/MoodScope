import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import UploadSection from '../components/UploadSection'
import Link from 'next/link'
import EmotionChart from '@/components/EmotionChart'
// import MoodScoreChart from '@/components/MoodScoreChart'
import TopGenresCard from '@/components/TopGenresCard'
import YearlyCalendar from '@/components/YearlyCalendar'
import TopArtistsCard from '@/components/TopArtistsCard'
import WeekdayHourHeatmap from '@/components/WeekdayHourHeatmap'
import TrendsCard from '@/components/TrendsCard'
import DataDebug from '@/components/DataDebug'
import OnboardingBanner from '@/components/OnboardingBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import dynamic from 'next/dynamic'
import { prisma } from '@/lib/prisma'
const MotionSection = dynamic(() => import('@/components/MotionSection'), { ssr: false })

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="bg-card border border-white/10 rounded-2xl shadow-sm p-8 max-w-md w-full">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2 text-slate-900 dark:text-slate-100">MoodScope</h1>
            <p className="mb-8 text-slate-600 dark:text-slate-300">Analyze your Spotify listening emotions</p>
            <Link href="/api/auth/signin/spotify">
              <Button className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm focus-visible:ring-emerald-400">
                Connect Spotify
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Determine if user has processed data (emotions) before showing charts
  const userId = (session.user as any).id as string
  const emotionsCount = await prisma.emotion.count({ where: { play: { userId } } })
  const hasProcessed = emotionsCount > 0

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <OnboardingBanner />

      <MotionSection>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Import Your Spotify Data</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadSection />
          </CardContent>
        </Card>
      </MotionSection>

      {hasProcessed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <MotionSection delay={0.05}>
              <Card>
                <CardHeader>
                  <CardTitle>Emotion Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <EmotionChart />
                </CardContent>
              </Card>
            </MotionSection>

            <MotionSection delay={0.1}>
              <TopGenresCard />
            </MotionSection>

            <MotionSection delay={0.15}>
              <YearlyCalendar />
            </MotionSection>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            <MotionSection>
              <TopArtistsCard />
            </MotionSection>
            <MotionSection>
              <TrendsCard />
            </MotionSection>
            <MotionSection>
              <WeekdayHourHeatmap />
            </MotionSection>
          </div>
        </>
      )}
    </main>
  )
}