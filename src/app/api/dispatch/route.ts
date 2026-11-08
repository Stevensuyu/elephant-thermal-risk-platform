import { NextRequest, NextResponse } from 'next/server'
import { getDispatchRecords } from '@/lib/store/store-server-persistence'

export const dynamic = 'force-dynamic'

// GET /api/dispatch?taskId=xxx - 获取分发记录
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const taskId = searchParams.get('taskId')
    const allRecords = getDispatchRecords()
    const records = taskId ? allRecords.filter((r: any) => r.taskId === taskId) : allRecords
    return NextResponse.json({ records })
  } catch (e: any) {
    return NextResponse.json({ records: [], error: e instanceof Error ? e.message : '获取分发记录失败' }, { status: 500 })
  }
}

// POST /api/dispatch - 触发分发（重新生成分发记录）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const taskId = body.taskId as string
    if (!taskId) {
      return NextResponse.json({ ok: false, error: '缺少警情ID' }, { status: 400 })
    }
    const { getServerTasks, confirmDispatchRecords } = await import('@/lib/store/store-server-persistence')
    const tasks = getServerTasks()
    const task = tasks.find((t: any) => t.id === taskId)
    if (!task) {
      return NextResponse.json({ ok: false, error: '警情不存在' }, { status: 404 })
    }
    const records = confirmDispatchRecords(taskId, task)
    const sent = records.filter((r: any) => r.status === 'sent').length
    return NextResponse.json({ ok: true, records, summary: { sent, total: records.length } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '分发失败' }, { status: 500 })
  }
}
