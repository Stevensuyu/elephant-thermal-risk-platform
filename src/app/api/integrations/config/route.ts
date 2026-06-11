import { NextResponse } from 'next/server'
import { readIntegrations, updateIntegrations } from '@/lib/integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await readIntegrations())
}

export async function PUT(request: Request) {
  const body = await request.json()
  return NextResponse.json(await updateIntegrations(body))
}

