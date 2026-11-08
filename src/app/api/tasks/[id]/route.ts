import { NextRequest, NextResponse } from 'next/server'
import { getServerTasks, upsertServerTask } from '@/lib/store/store-server-persistence'

export const dynamic = 'force-dynamic'

/** GET /api/tasks/[id] - 获取单个警情详情 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const tasks = getServerTasks()
    const task = tasks.find((t: any) => t.id === id)
    if (!task) {
      return NextResponse.json({ success: false, error: '警情不存在' }, { status: 404 })
    }
    return NextResponse.json(task)
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 })
  }
}

/** PATCH /api/tasks/[id] - 部分更新警情 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await req.json()
    const tasks = getServerTasks()
    const tIdx = tasks.findIndex((t: any) => t.id === id)
    if (tIdx < 0) {
      return NextResponse.json({ success: false, error: '警情不存在' }, { status: 404 })
    }
    const now = new Date().toISOString()
    const updatedTask = {
      ...tasks[tIdx],
      ...body,
      id,
      updatedAt: now,
    }
    upsertServerTask(updatedTask)
    return NextResponse.json({ success: true, task: updatedTask })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '更新失败' }, { status: 500 })
  }
}
