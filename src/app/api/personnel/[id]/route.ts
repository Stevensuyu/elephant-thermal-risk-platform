import { NextResponse } from 'next/server'
import { deletePersonnelMember } from '@/lib/personnel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const ok = await deletePersonnelMember(id)
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 })
}
