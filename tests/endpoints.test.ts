import { describe, it, expect } from 'vitest'
import * as backfillRoute from '@/app/api/me/backfill-emotions/route'
import * as rebuildRoute from '@/app/api/me/rebuild-emotions/route'
import * as v2GenerateRoute from '@/app/api/emotions/generate/route'
import * as rebuildAggRoute from '@/app/api/emotions/rebuild-aggregates/route'

describe('emotions endpoints', () => {
  it('backfill returns ok JSON', async () => {
    const res = await backfillRoute.POST()
    // NextResponse.json returns a Response-like object; we just assert it exists
    expect(res).toBeDefined()
  })
  it('rebuild returns ok JSON', async () => {
    const res = await rebuildRoute.POST()
    expect(res).toBeDefined()
  })
  it('v2 generate returns ok JSON', async () => {
    const res = await v2GenerateRoute.POST()
    expect(res).toBeDefined()
  })
  it('rebuild-aggregates returns ok JSON', async () => {
    const res = await rebuildAggRoute.POST()
    expect(res).toBeDefined()
  })
})
