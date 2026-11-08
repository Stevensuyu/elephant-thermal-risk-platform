import { NextResponse } from 'next/server'
import { readIntegrations, updateIntegrations } from '@/lib/integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readOverride(request: Request) {
  const raw = new URL(request.url).searchParams.get('config')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  return NextResponse.json(await readIntegrations(readOverride(request)))
}

export async function PUT(request: Request) {
  const body = await request.json()
  return NextResponse.json(await updateIntegrations(body))
}
