import { NextRequest, NextResponse } from 'next/server'
import { getServerTasks, saveServerTasks } from '@/lib/store/store-server-persistence'
import { recordLog, LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { taskId, by, reason } = body

    if (!taskId) {
      return NextResponse.json({ ok: false, error: '缺少警情ID' }, { status: 400 })
    }

    const tasks = getServerTasks()
    const idx = tasks.findIndex((t: any) => t.id === taskId)

    if (idx === -1) {
      return NextResponse.json({ ok: false, error: '警情不存在' }, { status: 404 })
    }

    const task = tasks[idx]

    if (task.status === 'COMPLETED') {
      return NextResponse.json({ ok: false, error: '已结案的警情不能取消分发' }, { status: 400 })
    }

    // 回退状态到待分发
    tasks[idx] = {
      ...task,
      status: 'PENDING',
      pendingConfirm: true,
      dispatched: false,
      dispatchInfo: null,
      progress: 0,
    }

    saveServerTasks(tasks)

    // 记录操作日志
    recordLog({
      userName: by || '管理员',
      role: 'admin',
      action: LOG_ACTIONS.DISPATCH,
      detail: `警情 ${taskId}（${task.name}）取消分发${reason ? `，原因：${reason}` : ''}`,
    })

    return NextResponse.json({ ok: true, task: tasks[idx] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || '取消分发失败' }, { status: 500 })
  }
}
