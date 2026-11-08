import { NextResponse } from 'next/server'
import { getModelStatus, updateModelStatus } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getModelStatus())
}

export async function PUT(request: Request) {
  const body = await request.json()
  return NextResponse.json(await updateModelStatus(body))
}
