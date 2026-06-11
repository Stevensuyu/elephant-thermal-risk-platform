import { NextResponse } from 'next/server'
import { analyzeTaskInput } from '@/lib/analysis'
import { readIntegrations } from '@/lib/integrations'
import { runYoloPrediction } from '@/lib/yolo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const integrations = await readIntegrations()
  const detections =
    integrations.thermal.snapshotUrl && integrations.yolo.serviceUrl
      ? await runYoloPrediction({ sourceUrl: integrations.thermal.snapshotUrl })
      : null

  const detectionSummary = detections?.detections?.length
    ? `YOLO 识别到 ${detections.detections.length} 个目标：${detections.detections
        .slice(0, 5)
        .map((item) => `${item.label}(${Math.round(item.confidence * 100)}%)`)
        .join('、')}`
    : '当前未接入可分析的热成像快照，或未配置 YOLO 服务。'

  const analysis = await analyzeTaskInput({
    name: '实时热成像研判',
    description: [
      `地图：${integrations.map.apiKey ? '已配置' : '未配置'}`,
      `DJI：${integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '未配置'}`,
      `热成像：${integrations.thermal.streamUrl || integrations.thermal.snapshotUrl || '未配置'}`,
      detectionSummary,
    ].join('；'),
    videoUrl: integrations.thermal.snapshotUrl || integrations.thermal.streamUrl || '',
    modelType: 'yolo-live',
  })

  return NextResponse.json({
    source: integrations.thermal.sourceName,
    thermal: integrations.thermal,
    dji: integrations.dji,
    map: integrations.map,
    yolo: detections,
    analysis,
    summary: analysis.aiSummary,
  })
}

