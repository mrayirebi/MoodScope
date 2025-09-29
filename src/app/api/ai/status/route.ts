import { NextResponse } from 'next/server'
import { aiEnabled, aiProvider } from '@/lib/ai'

export async function GET() {
  try {
    return NextResponse.json({ enabled: aiEnabled(), provider: aiProvider() })
  } catch (e) {
    return NextResponse.json({ enabled: false, provider: null }, { status: 200 })
  }
}
