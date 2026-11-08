import { NextRequest, NextResponse } from 'next/server'
import { getAllServerWorkflows } from '@/lib/store/store-server-persistence'

/**
 * GET /api/disposal-workflows
 * 返回服务端持久化的全部处置工单（disposal_workflows.json）。
 * 用于：多角色待办计数 / 多角色分发统计 / TodoPopup 按角色提取待确认步骤。
 */
export async function GET(_req: NextRequest) {
  try {
    const workflows = getAllServerWorkflows()
    const list = Object.keys(workflows).map((taskId) => ({ taskId, ...workflows[taskId] }))
    return NextResponse.json({ success: true, workflows: list })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '获取失败' }, { status: 500 })
  }
}
