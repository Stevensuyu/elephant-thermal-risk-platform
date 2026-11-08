import { NextRequest, NextResponse } from 'next/server'
import { getServerTasks, upsertServerTask, confirmDispatchRecords, createDefaultDisposalWorkflow } from '@/lib/store/store-server-persistence'

export const dynamic = 'force-dynamic'

// POST /api/dispatch/confirm - 确认分发，更新警情状态并保存分发记录到服务端
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const taskId = body.taskId as string
    const by = body.by || body.officerName || 'admin'
    const officerName = body.officerName || body.by || '待分配'
    const officerId = body.officerId || ''
    const recipients: any[] = Array.isArray(body.recipients) ? body.recipients : []
    const region: string = body.region || ''

    if (!taskId) {
      return NextResponse.json({ ok: false, error: '缺少警情ID' }, { status: 400 })
    }

    const tasks = getServerTasks()
    const tIdx = tasks.findIndex((t: any) => t.id === taskId)
    if (tIdx < 0) {
      return NextResponse.json({ ok: false, error: '警情不存在' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const dispatchRegion = region || tasks[tIdx].township || tasks[tIdx].county || '全县'

    // 更新警情状态
    const updatedTask = {
      ...tasks[tIdx],
      pendingConfirm: false,
      confirmedBy: by,
      confirmedAt: now,
      updatedAt: now,
      assignedOfficers: recipients,
      dispatchRegion,
      status: tasks[tIdx].status === 'PENDING' ? 'RUNNING' : tasks[tIdx].status,
    }

    // 保存警情到服务端
    upsertServerTask(updatedTask)

    // 保存分发记录到服务端（关键：之前缺失，导致联动面板无数据）
    const dispatchRecords = confirmDispatchRecords(taskId, updatedTask)
    const sentCount = dispatchRecords.filter((r: any) => r.status === 'sent').length

    // 分发确认时自动创建默认处置工单（workflow），确保立即出现在"我的任务"中
    // 已有工单则不覆盖（AI生成的工单优先）
    try {
      createDefaultDisposalWorkflow(taskId, updatedTask)
    } catch (wfErr: any) {
      // workflow 创建失败不影响分发确认的主流程
      console.error('[dispatch/confirm] 创建默认处置工单失败:', wfErr?.message || wfErr)
    }

    return NextResponse.json({
      ok: true,
      summary: {
        sent: sentCount,
        total: dispatchRecords.length,
        recipients: recipients.length,
        region: dispatchRegion,
      },
      task: updatedTask,
      dispatchRecords,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '确认分发失败' }, { status: 500 })
  }
}
