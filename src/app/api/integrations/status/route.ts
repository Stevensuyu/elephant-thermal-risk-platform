import { NextResponse } from 'next/server'
import { getIntegrationStatus } from '@/lib/integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('config')
  const override = raw ? (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })() : null
  return NextResponse.json(await getIntegrationStatus(override))
}
