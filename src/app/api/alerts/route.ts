import { NextRequest, NextResponse } from 'next/server'
import { getServerTasks, upsertServerTask, deleteServerTasks } from '@/lib/store/store-server-persistence'

/**
 * /api/alerts — 警情列表（alerts 即 tasks，与 /api/tasks 共享同一份服务端数据）。
 * GET: 返回任务列表
 * POST: 标记已读/未读 { id, read }，或新建任务
 * DELETE: 删除任务 ?id=...
 */
export async function GET(req: NextRequest) {
  const tasks = getServerTasks()
  const role = req.nextUrl.searchParams.get('role')
  if (role) {
    // 按角色过滤：管理员看全部，其他角色看分配给自己的
    const filtered = tasks.filter((t: any) => {
      if (role === 'admin') return true
      const assigned = t.assignedRole || t.dispatchPlan?.some((p: any) => p?.role === role)
      return assigned !== false
    })
    return NextResponse.json(filtered)
  }
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // 标记已读/未读：{ id, read }
    if (body.id != null && body.read != null) {
      const tasks = getServerTasks()
      const idx = tasks.findIndex((t: any) => t.id === body.id)
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], read: body.read, updatedAt: new Date().toISOString() }
        upsertServerTask(tasks[idx])
      }
      return NextResponse.json({ success: true })
    }
    // 新建任务（兼容 /api/tasks 的 POST 行为）
    const now = new Date().toISOString()
    const task = {
      id: body.id || `TASK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: body.name || '新建研判任务',
      description: body.description || '',
      status: body.status || 'RUNNING',
      progress: body.progress ?? 12,
      warningLevel: body.warningLevel || 'YELLOW',
      intrusionRisk: Number(body.intrusionRisk) || 40,
      predictionWindow: body.predictionWindow || '2 小时以上',
      aiSummary: body.aiSummary || '',
      dispatchPlan: body.dispatchPlan || ['加强巡查', '保持监测'],
      detectedCount: Number(body.detectedCount ?? 1),
      createdAt: body.createdAt || now,
      updatedAt: now,
      lat: body.lat != null ? Number(body.lat) : 22.6,
      lng: body.lng != null ? Number(body.lng) : 100.3,
      ...body,
    }
    const tasks = upsertServerTask(task)
    return NextResponse.json({ success: true, task, tasks })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const tasks = deleteServerTasks([id])
      return NextResponse.json({ success: true, tasks })
    }
    const body = await req.json().catch(() => ({}))
    const ids: string[] = body.ids || []
    const tasks = deleteServerTasks(ids)
    return NextResponse.json({ success: true, tasks })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
