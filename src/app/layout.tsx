import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import dynamic from 'next/dynamic'
const TopNav = dynamic(() => import('@/components/TopNav'), { ssr: false })

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MoodScope',
  description: 'Spotify emotion analytics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
  <body className={`${inter.className} min-h-screen bg-surface text-slate-100`}>
        <Providers>
          <TopNav />
          {children}
        </Providers>
      </body>
    </html>
  )
}