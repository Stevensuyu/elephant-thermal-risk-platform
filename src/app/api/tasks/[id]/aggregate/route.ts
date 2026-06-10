import { NextResponse } from 'next/server'
import { aggregateTaskToModel } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const result = await aggregateTaskToModel(params.id)
  if (!result) return NextResponse.json({ error: '任务不存在或没有可汇总结果' }, { status: 404 })
  return NextResponse.json(result)
}
