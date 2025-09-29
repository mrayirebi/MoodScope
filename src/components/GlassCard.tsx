import React from 'react'

type Props = React.PropsWithChildren<{ className?: string }>

export default function GlassCard({ children, className }: Props) {
  return (
    <div className={`rounded-2xl border border-white/30 bg-white/40 backdrop-blur-xl shadow-lg ${className ?? ''}`}>
      {children}
    </div>
  )
}
