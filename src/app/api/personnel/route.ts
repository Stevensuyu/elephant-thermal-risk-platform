import { NextResponse } from 'next/server'
import { createPersonnelMember, readPersonnel } from '@/lib/personnel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await readPersonnel())
}

export async function POST(request: Request) {
  const body = await request.json()
  return NextResponse.json(
    await createPersonnelMember({
      name: String(body.name || ''),
      role: body.role === 'ADMIN' ? 'ADMIN' : 'POLICE',
      scope: String(body.scope || ''),
      channels: String(body.channels || ''),
      levels: Array.isArray(body.levels) ? body.levels : ['YELLOW'],
      duty: String(body.duty || ''),
    }),
  )
}
