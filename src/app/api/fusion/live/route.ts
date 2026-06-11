import { NextResponse } from 'next/server'
import { analyzeTaskInput } from '@/lib/analysis'
import { readIntegrations } from '@/lib/integrations'
import { readDb } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const integrations = await readIntegrations()
  const db = await readDb()
  const modelStatus = db.modelStatus
  const latestTask = db.tasks[0]
  const activeTask = latestTask || db.tasks.find((task) => task.status === 'RUNNING') || db.tasks.find((task) => ['RED', 'ORANGE'].includes(task.warningLevel))

  const analysis = await analyzeTaskInput({
    name: '实时热成像研判',
    description: [
      `地图：${integrations.map.apiKey ? '已配置' : '未配置'}`,
      `DJI：${integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '未配置'}`,
      `热成像：${integrations.thermal.streamUrl || integrations.thermal.snapshotUrl || '未配置'}`,
      `YOLO 服务：${integrations.yolo.serviceUrl || '未配置'}`,
      `模型状态：${modelStatus.status}`,
      `最近任务：${activeTask?.name || '无'}`,
      `预警等级：${activeTask ? activeTask.warningLevel : 'BLUE'}`,
    ].join('；'),
    videoUrl: integrations.thermal.snapshotUrl || integrations.thermal.streamUrl || '',
    modelType: 'ai-fusion',
  })

  return NextResponse.json({
    source: integrations.thermal.sourceName,
    thermal: integrations.thermal,
    dji: integrations.dji,
    map: integrations.map,
    yolo: {
      configured: Boolean(integrations.yolo.serviceUrl),
      providerName: integrations.yolo.providerName,
      serviceUrl: integrations.yolo.serviceUrl,
      weights: integrations.yolo.weights,
    },
    modelStatus,
    latestTask: activeTask ? {
      id: activeTask.id,
      name: activeTask.name,
      status: activeTask.status,
      warningLevel: activeTask.warningLevel,
      intrusionRisk: activeTask.intrusionRisk,
      predictionWindow: activeTask.predictionWindow,
      updatedAt: activeTask.updatedAt,
    } : null,
    analysis,
    summary: analysis.aiSummary,
  })
}
