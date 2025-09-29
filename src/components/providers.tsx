'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { RangeProvider } from '@/components/range-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
        <RangeProvider>
          {children}
        </RangeProvider>
      </NextThemesProvider>
    </SessionProvider>
  )
}