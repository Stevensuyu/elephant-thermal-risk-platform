import { NextRequest, NextResponse } from 'next/server'
import { getServerTasks, upsertServerTask, deleteServerTasks, saveServerTasks } from '@/lib/store/store-server-persistence'

function genId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}


/** 判断两个经纬度是否接近（0.01度 ≈ 1公里） */
function isNearby(lat1?: number, lng1?: number, lat2?: number, lng2?: number): boolean {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return false
  return Math.abs(lat1 - lat2) < 0.01 && Math.abs(lng1 - lng2) < 0.01
}

/**
 * 查找同一目标的未完成警情（去重判断）。
 * 去重依据：targetId 优先；其次同名；再次经纬度接近（1公里内）。
 * 仅匹配状态为 RUNNING/PENDING 的警情；已完成(COMPLETED)的警情不阻止新建。
 */
function findExistingActiveTask(body: any, tasks: any[]): any | null {
  const bodyTargetId = body.targetId || body.target_id || ''
  const bodyName = (body.name || '').trim().toLowerCase()
  const bodyLat = body.lat != null ? Number(body.lat) : undefined
  const bodyLng = body.lng != null ? Number(body.lng) : undefined

  for (const t of tasks) {
    // 已完成的警情不参与去重
    if (t.status === 'COMPLETED' || t.aggregatedAt) continue

    // 1. targetId 精确匹配
    if (bodyTargetId && t.targetId && t.targetId === bodyTargetId) return t

    // 2. 名称精确匹配（忽略大小写）
    const tName = (t.name || '').trim().toLowerCase()
    if (bodyName && tName && bodyName === tName) return t

    // 3. 经纬度接近（1公里内）
    if (isNearby(bodyLat, bodyLng, t.lat, t.lng)) return t
  }
  return null
}

function buildFullTask(body: any): any {
  const now = new Date().toISOString()
  const warningLevel = (body.warningLevel as string) || 'YELLOW'
  const intrusionRisk = Number(body.intrusionRisk) || 40
  return {
    id: body.id || genId('TASK'),
    name: body.name || '新建研判任务',
    description: body.description || '',
    status: body.status || 'RUNNING',
    progress: body.progress ?? 12,
    warningLevel,
    intrusionRisk,
    predictionWindow: body.predictionWindow || (warningLevel === 'RED' ? '30 分钟内' : warningLevel === 'ORANGE' ? '1 小时内' : '2 小时以上'),
    aiSummary: body.aiSummary || '',
    dispatchPlan: body.dispatchPlan || (warningLevel === 'RED' ? ['立即疏散人员', '无人机跟踪', '广播驱离'] : ['加强巡查', '保持监测']),
    detectedCount: Number(body.detectedCount ?? 1),
    needsModelConfirm: body.needsModelConfirm ?? false,
    stages: body.stages || [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 100, status: 'completed' },
      { name: 'AI 研判', progress: 80, status: 'running' },
      { name: '预警分发', progress: 0, status: 'pending' },
    ],
    createdAt: body.createdAt || now,
    updatedAt: now,
    realInference: body.realInference ?? false,
    classCounts: body.classCounts || { elephant: Number(body.detectedCount ?? 1) },
    triggeredBy: body.triggeredBy || (body.manual ? 'manual' : 'realtime-stream'),
    pendingConfirm: body.pendingConfirm != null ? !!body.pendingConfirm : true,
    alertType: body.alertType,
    province: body.province,
    city: body.city,
    county: body.county,
    township: body.township,
    lat: body.lat != null ? Number(body.lat) : 22.6,
    lng: body.lng != null ? Number(body.lng) : 100.3,
    simulated: body.simulated ?? false,
    manual: body.manual ?? false,
    sourceDevice: body.sourceDevice,
    hasMedia: body.hasMedia ?? false,
    // 保留所有传入的扩展字段
    ...body,
  }
}

export async function GET() {
  const tasks = getServerTasks()
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 去重判断：同一目标已有正在处置的警情时，返回已有警情而不重复创建
    const allTasks = getServerTasks()
    const existing = findExistingActiveTask(body, allTasks)
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        task: existing,
        tasks: allTasks,
        message: '同一目标已有正在处置的警情，返回已有警情（未重复创建）',
      })
    }

    const task = buildFullTask(body)
    const tasks = upsertServerTask(task)
    return NextResponse.json({ success: true, task, tasks })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    if (Array.isArray(body)) {
      saveServerTasks(body)
      return NextResponse.json({ success: true })
    }
    const task = buildFullTask(body)
    const tasks = upsertServerTask(task)
    return NextResponse.json({ success: true, task, tasks })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const ids: string[] = body.ids || []
    const tasks = deleteServerTasks(ids)
    return NextResponse.json({ success: true, tasks })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
