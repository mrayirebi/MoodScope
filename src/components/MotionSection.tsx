"use client"

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  children: React.ReactNode
  className?: string
  delay?: number
}

export default function MotionSection({ children, className, delay = 0 }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), Math.max(0, delay * 1000))
    return () => clearTimeout(t)
  }, [delay])
  return (
    <section
      className={cn(
        'transform transition-all duration-300',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        className
      )}
    >
      {children}
    </section>
  )
}
