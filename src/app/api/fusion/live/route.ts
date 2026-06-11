import { NextResponse } from 'next/server'
import { analyzeTaskInput } from '@/lib/analysis'
import { readIntegrations } from '@/lib/integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const integrations = await readIntegrations()

  const analysis = await analyzeTaskInput({
    name: '实时热成像研判',
    description: [
      `地图：${integrations.map.apiKey ? '已配置' : '未配置'}`,
      `DJI：${integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '未配置'}`,
      `热成像：${integrations.thermal.streamUrl || integrations.thermal.snapshotUrl || '未配置'}`,
      `YOLO 服务：${integrations.yolo.serviceUrl || '未配置'}`,
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
    analysis,
    summary: analysis.aiSummary,
  })
}
