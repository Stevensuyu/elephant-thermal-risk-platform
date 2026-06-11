import { NextResponse } from 'next/server'
import { analyzeTaskInput } from '@/lib/analysis'
import { readIntegrations } from '@/lib/integrations'
import { readDb } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function fetchProbe(url: string, method: 'HEAD' | 'GET' = 'HEAD') {
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(url, { method, redirect: 'follow', signal: controller.signal })
    const text = method === 'GET' && response.ok ? (await response.text()).slice(0, 180) : ''
    return {
      ok: response.ok,
      status: response.status,
      endpoint: url,
      preview: text,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      endpoint: url,
      preview: error instanceof Error ? error.message : 'fetch failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const integrations = await readIntegrations()
  const db = await readDb()
  const modelStatus = db.modelStatus
  const latestTask = db.tasks[0]
  const activeTask = latestTask || db.tasks.find((task) => task.status === 'RUNNING') || db.tasks.find((task) => ['RED', 'ORANGE'].includes(task.warningLevel))

  const connectionSummary = [
    { name: '地图', configured: Boolean(integrations.map.apiKey), endpoint: '高德地图 JS API' },
    { name: 'AI', configured: Boolean(integrations.ai.apiKey), endpoint: integrations.ai.baseUrl || '未配置' },
    { name: 'DJI', configured: Boolean(integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl), endpoint: integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '未配置' },
    { name: 'YOLO', configured: Boolean(integrations.yolo.serviceUrl), endpoint: integrations.yolo.serviceUrl || '未配置' },
    { name: '热成像', configured: Boolean(integrations.thermal.streamUrl || integrations.thermal.snapshotUrl), endpoint: integrations.thermal.streamUrl || integrations.thermal.snapshotUrl || '未配置' },
    { name: '三维分析', configured: Boolean(integrations.threeD.serviceUrl || integrations.threeD.snapshotUrl), endpoint: integrations.threeD.serviceUrl || integrations.threeD.snapshotUrl || '未配置' },
  ].map((item) => ({
    ...item,
    status: item.configured ? '已配置' : '待配置',
  }))

  const acquisitionResults = await Promise.all([
    fetchProbe('https://webapi.amap.com/maps?v=2.0'),
    fetchProbe(integrations.ai.baseUrl || '', 'HEAD'),
    fetchProbe(integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '', 'GET'),
    fetchProbe(integrations.thermal.snapshotUrl || integrations.thermal.streamUrl || '', 'GET'),
    fetchProbe(integrations.threeD.serviceUrl || integrations.threeD.snapshotUrl || '', 'GET'),
    fetchProbe(integrations.yolo.serviceUrl || '', 'GET'),
  ])

  const acquisitionByName = {
    map: acquisitionResults[0],
    ai: acquisitionResults[1],
    dji: acquisitionResults[2],
    thermal: acquisitionResults[3],
    threeD: acquisitionResults[4],
    yolo: acquisitionResults[5],
  }

  const acquiredCount = acquisitionResults.filter((item) => item?.ok).length

  const analysis = await analyzeTaskInput({
    name: '实时热成像研判',
    description: [
      `地图：${integrations.map.apiKey ? '已配置' : '未配置'}`,
      `DJI：${integrations.dji.cloudApiBaseUrl || integrations.dji.openApiBaseUrl || '未配置'}`,
      `热成像：${integrations.thermal.streamUrl || integrations.thermal.snapshotUrl || '未配置'}`,
      `三维分析：${integrations.threeD.serviceUrl || integrations.threeD.snapshotUrl || '未配置'}`,
      `YOLO 服务：${integrations.yolo.serviceUrl || '未配置'}`,
      `模型状态：${modelStatus.status}`,
      `最近任务：${activeTask?.name || '无'}`,
      `预警等级：${activeTask ? activeTask.warningLevel : 'BLUE'}`,
    ].join('\n'),
    videoUrl: integrations.thermal.snapshotUrl || integrations.thermal.streamUrl || integrations.threeD.snapshotUrl || '',
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
    threeD: {
      configured: Boolean(integrations.threeD.serviceUrl || integrations.threeD.snapshotUrl),
      providerName: integrations.threeD.providerName,
      serviceUrl: integrations.threeD.serviceUrl,
      snapshotUrl: integrations.threeD.snapshotUrl,
    },
    modelStatus,
    latestTask: activeTask
      ? {
          id: activeTask.id,
          name: activeTask.name,
          status: activeTask.status,
          warningLevel: activeTask.warningLevel,
          intrusionRisk: activeTask.intrusionRisk,
          predictionWindow: activeTask.predictionWindow,
          updatedAt: activeTask.updatedAt,
        }
      : null,
    connectionSummary,
    acquisitionByName,
    acquisitionResults,
    acquisitionSummary: `${acquiredCount}/${acquisitionResults.length} 项已获取到外部响应`,
    analysis,
    summary: analysis.aiSummary,
  })
}
