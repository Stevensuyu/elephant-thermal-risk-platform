import { NextRequest, NextResponse } from 'next/server'
import { getServerWorkflow, saveServerWorkflow, getAllServerWorkflows, getServerTasks, upsertServerTask } from '@/lib/store/store-server-persistence'
import { sortDisposalSteps } from '@/lib/utils/util-disposal-step-order'

export const dynamic = 'force-dynamic'

/** 构建完整 workflow 对象 */
function buildWorkflow(taskId: string, data: any): any {
  const now = new Date().toISOString()
  const existing = getServerWorkflow(taskId) || {}
  const rawSteps = Array.isArray(data.steps) ? data.steps : (existing.steps || [])
  // 强制排序：确保上报联动(report)紧接核实研判(verify)之后，绑定死顺序
  const sortedSteps = sortDisposalSteps(rawSteps)
  return {
    taskId,
    scenario: data.scenario || existing.scenario || 'AI 生成处置方案',
    aiSummary: data.aiSummary || existing.aiSummary || '',
    aiModel: data.aiModel || existing.aiModel || '',
    template: data.template || existing.template || 'auto',
    officer: data.officer || existing.officer || '',
    steps: sortedSteps,
    advanced: data.advanced ?? existing.advanced ?? false,
    report: data.report || existing.report || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  }
}

/** GET /api/disposal - 获取处置工单（支持 ?taskId=xxx） */
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId')
    if (taskId) {
      const wf = getServerWorkflow(taskId)
      return NextResponse.json({ success: true, workflow: wf })
    }
    const all = getAllServerWorkflows()
    return NextResponse.json({ success: true, workflows: all })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

/** POST /api/disposal - 创建处置工单（支持传入 steps/aiSummary 或 template） */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { taskId } = body
    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 })
    }
    // 如果传入了 steps，直接构建并保存
    if (Array.isArray(body.steps) || body.aiSummary || body.scenario) {
      const wf = buildWorkflow(taskId, body)
      const saved = saveServerWorkflow(taskId, wf)
      return NextResponse.json({ success: true, workflow: saved })
    }
    // 如果只传了 template（前端期望服务端生成，但服务端不生成AI，返回空workflow让前端处理）
    const wf = buildWorkflow(taskId, { ...body, steps: [] })
    const saved = saveServerWorkflow(taskId, wf)
    return NextResponse.json({ success: true, workflow: saved })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

/** PATCH /api/disposal - 更新处置工单（保存步骤/推进/结案） */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { taskId } = body
    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId' }, { status: 400 })
    }
    const existing = getServerWorkflow(taskId)
    if (!existing) {
      return NextResponse.json({ success: false, error: '处置工单不存在，请先生成' }, { status: 404 })
    }

    // 结案推进：advance=true
    if (body.advance === true) {
      const now = new Date().toISOString()
      // 结案时同步将所有未完成步骤标记为 done，确保处置预案进度与结案状态一致
      const updatedSteps = Array.isArray(existing.steps)
        ? existing.steps.map((s: any) => {
            if (s.status === 'done' || s.status === 'skipped') return s
            return { ...s, status: 'done', doneAt: s.doneAt || now, executedAt: s.executedAt || now }
          })
        : []
      const updatedWf = {
        ...existing,
        steps: updatedSteps,
        advanced: true,
        report: body.report || existing.report,
        advancedBy: body.by || '',
        advancedAt: now,
        closedAt: now,
        closedBy: body.by || '',
        updatedAt: now,
      }
      const saved = saveServerWorkflow(taskId, updatedWf)
      // 同步更新警情状态为 COMPLETED
      const tasks = getServerTasks()
      const tIdx = tasks.findIndex((t: any) => t.id === taskId)
      if (tIdx >= 0) {
        const updatedTask = {
          ...tasks[tIdx],
          status: 'COMPLETED',
          closedAt: now,
          closedBy: body.by || '',
          completedAt: now,
          updatedAt: now,
          report: body.report || tasks[tIdx].report || null,
          closureId: body.closureId || tasks[tIdx].closureId || `AJ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(tIdx+1).padStart(3,'0')}`,
        }
        upsertServerTask(updatedTask)
      }
      return NextResponse.json({ success: true, workflow: saved })
    }

    // 确认步骤：confirm=true
    if (body.confirm === true && body.stepId) {
      const now = new Date().toISOString()
      const updatedSteps = existing.steps.map((s: any) =>
        s.id === body.stepId
          ? { ...s, confirmedBy: body.by || '成员', confirmedAt: now, status: 'done', doneAt: now, executedAt: s.executedAt || now }
          : s
      )
      const updatedWf = { ...existing, steps: updatedSteps, updatedAt: now }
      const saved = saveServerWorkflow(taskId, updatedWf)
      return NextResponse.json({ success: true, workflow: saved })
    }

    // 单步状态更新：stepId + status
    if (body.stepId && body.status) {
      const now = new Date().toISOString()
      const updatedSteps = existing.steps.map((s: any) =>
        s.id === body.stepId ? (() => {
          const patch: any = { ...s, status: body.status }
          if (body.status === 'executing' && !s.executedAt) patch.executedAt = now
          if (body.status === 'done') { patch.doneAt = now; if (!s.executedAt) patch.executedAt = now }
          return patch
        })() : s
      )
      const updatedWf = { ...existing, steps: updatedSteps, updatedAt: now }
      const saved = saveServerWorkflow(taskId, updatedWf)
      return NextResponse.json({ success: true, workflow: saved })
    }

    // 保存步骤更新
    if (Array.isArray(body.steps)) {
      const updatedWf = {
        ...existing,
        steps: body.steps,
        updatedAt: new Date().toISOString(),
      }
      const saved = saveServerWorkflow(taskId, updatedWf)
      return NextResponse.json({ success: true, workflow: saved })
    }

    // 全量更新 workflow
    if (body.workflow) {
      const saved = saveServerWorkflow(taskId, { ...existing, ...body.workflow, updatedAt: new Date().toISOString() })
      return NextResponse.json({ success: true, workflow: saved })
    }

    return NextResponse.json({ success: false, error: '未指定更新内容' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
