import { NextResponse } from 'next/server'
import { listTasks, updateTask } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const task = (await listTasks()).find((item) => item.id === params.id)
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json()
  const task = await updateTask(params.id, body)
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  return NextResponse.json(task)
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const task = await updateTask(params.id, { status: 'FAILED', errorMessage: '任务已删除或取消' })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  return NextResponse.json({ message: '任务已取消' })
}
