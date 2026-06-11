import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const root = process.cwd()
const storageDir = path.join(root, 'storage')
const integrationsPath = path.join(storageDir, 'integrations.json')

export type IntegrationKind = 'map' | 'ai' | 'dji' | 'yolo' | 'thermal' | 'threeD'

export interface IntegrationConfig {
  map: {
    provider: 'amap' | 'tencent'
    apiKey: string
    securityJsCode: string
  }
  ai: {
    providerName: string
    baseUrl: string
    apiKey: string
    model: string
  }
  dji: {
    providerName: string
    cloudApiBaseUrl: string
    openApiBaseUrl: string
    websocketUrl: string
    appKey: string
    appId: string
    accessToken: string
    workspaceId: string
  }
  yolo: {
    providerName: string
    serviceUrl: string
    apiKey: string
    weights: string
  }
  thermal: {
    streamUrl: string
    snapshotUrl: string
    sourceName: string
  }
  threeD: {
    providerName: string
    serviceUrl: string
    snapshotUrl: string
  }
}

export interface IntegrationStatus {
  map: { configured: boolean; provider: string; reachable?: boolean }
  ai: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
  dji: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
  yolo: { configured: boolean; provider: string; endpoint: string; weights: string; reachable?: boolean }
  thermal: { configured: boolean; provider: string; source: string; reachable?: boolean }
  threeD: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
}

export function mergeIntegrationConfig(current: IntegrationConfig, patch?: Partial<IntegrationConfig> | null): IntegrationConfig {
  if (!patch) return current
  return {
    map: { ...current.map, ...(patch.map || {}) },
    ai: { ...current.ai, ...(patch.ai || {}) },
    dji: { ...current.dji, ...(patch.dji || {}) },
    yolo: { ...current.yolo, ...(patch.yolo || {}) },
    thermal: { ...current.thermal, ...(patch.thermal || {}) },
    threeD: { ...current.threeD, ...(patch.threeD || {}) },
  }
}

const defaultConfig: IntegrationConfig = {
  map: {
    provider: 'amap',
    apiKey: process.env.NEXT_PUBLIC_AMAP_KEY || '',
    securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE || '',
  },
  ai: {
    providerName: 'OpenAI',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
  dji: {
    providerName: 'DJI FlightHub 2',
    cloudApiBaseUrl: '',
    openApiBaseUrl: '',
    websocketUrl: '',
    appKey: '',
    appId: '',
    accessToken: '',
    workspaceId: '',
  },
  yolo: {
    providerName: 'Ultralytics / Roboflow',
    serviceUrl: process.env.YOLO_SERVICE_URL || '',
    apiKey: '',
    weights: process.env.YOLO_WEIGHTS || 'yolov8n.pt',
  },
  thermal: {
    streamUrl: '',
    snapshotUrl: '',
    sourceName: '实时热成像流',
  },
  threeD: {
    providerName: '三维分析服务',
    serviceUrl: '',
    snapshotUrl: '',
  },
}

function isConfigured(value: string | undefined | null) {
  return Boolean(value && String(value).trim())
}

async function probeUrl(url: string, method: 'HEAD' | 'GET' = 'HEAD') {
  if (!isConfigured(url)) return false
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(url, { method, signal: controller.signal, redirect: 'follow' })
    return response.ok || response.status === 401 || response.status === 403
  } catch {
    return false
  } finally {
    globalThis.clearTimeout(timer)
  }
}

async function ensureStore() {
  await mkdir(storageDir, { recursive: true })
  try {
    await readFile(integrationsPath, 'utf8')
  } catch {
    await writeIntegrations(defaultConfig)
  }
}

export async function readIntegrations(override?: Partial<IntegrationConfig> | null): Promise<IntegrationConfig> {
  await ensureStore()
  try {
    const raw = await readFile(integrationsPath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<IntegrationConfig>
    return mergeIntegrationConfig(
      {
        map: { ...defaultConfig.map, ...(parsed.map || {}) },
        ai: { ...defaultConfig.ai, ...(parsed.ai || {}) },
        dji: { ...defaultConfig.dji, ...(parsed.dji || {}) },
        yolo: { ...defaultConfig.yolo, ...(parsed.yolo || {}) },
        thermal: { ...defaultConfig.thermal, ...(parsed.thermal || {}) },
        threeD: { ...defaultConfig.threeD, ...(parsed.threeD || {}) },
      },
      override,
    )
  } catch {
    return mergeIntegrationConfig(defaultConfig, override)
  }
}

export async function writeIntegrations(config: IntegrationConfig) {
  await mkdir(storageDir, { recursive: true })
  await writeFile(integrationsPath, JSON.stringify(config, null, 2), 'utf8')
}

export async function updateIntegrations(patch: Partial<IntegrationConfig>) {
  const current = await readIntegrations()
  const next = mergeIntegrationConfig(current, patch)
  await writeIntegrations(next)
  return next
}

export async function getIntegrationStatus(override?: Partial<IntegrationConfig> | null): Promise<IntegrationStatus> {
  const config = await readIntegrations(override)
  const mapReachable = await probeUrl(
    config.map.provider === 'tencent' ? 'https://map.qq.com/api/gljs?v=1.exp' : 'https://webapi.amap.com/maps?v=2.0',
    'HEAD',
  )
  const aiReachable = await probeUrl(config.ai.baseUrl, 'HEAD')
  const djiReachable = await probeUrl(config.dji.cloudApiBaseUrl || config.dji.openApiBaseUrl, 'HEAD')
  const yoloReachable = await probeUrl(config.yolo.serviceUrl, 'HEAD')
  const thermalReachable = await probeUrl(config.thermal.snapshotUrl || config.thermal.streamUrl, 'HEAD')
  const threeDReachable = await probeUrl(config.threeD.serviceUrl || config.threeD.snapshotUrl, 'GET')

  return {
    map: {
      configured: isConfigured(config.map.apiKey),
      provider: config.map.provider === 'tencent' ? 'Tencent / 腾讯地图 GL JS' : 'AMap / 高德地图 JS API',
      reachable: mapReachable,
    },
    ai: {
      configured: isConfigured(config.ai.apiKey),
      provider: config.ai.providerName || 'AI 分析接口',
      endpoint: config.ai.baseUrl || '未配置',
      reachable: aiReachable,
    },
    dji: {
      configured: isConfigured(config.dji.cloudApiBaseUrl) || isConfigured(config.dji.openApiBaseUrl),
      provider: config.dji.providerName || 'DJI FlightHub 2',
      endpoint: config.dji.cloudApiBaseUrl || config.dji.openApiBaseUrl || '未配置',
      reachable: djiReachable,
    },
    yolo: {
      configured: isConfigured(config.yolo.serviceUrl),
      provider: config.yolo.providerName || 'YOLO 服务',
      endpoint: config.yolo.serviceUrl || '未配置',
      weights: config.yolo.weights || 'yolov8n.pt',
      reachable: yoloReachable,
    },
    thermal: {
      configured: isConfigured(config.thermal.streamUrl) || isConfigured(config.thermal.snapshotUrl),
      provider: config.thermal.sourceName || '实时热成像流',
      source: config.thermal.streamUrl || config.thermal.snapshotUrl || '未配置',
      reachable: thermalReachable,
    },
    threeD: {
      configured: isConfigured(config.threeD.serviceUrl) || isConfigured(config.threeD.snapshotUrl),
      provider: config.threeD.providerName || '三维分析服务',
      endpoint: config.threeD.serviceUrl || config.threeD.snapshotUrl || '未配置',
      reachable: threeDReachable,
    },
  }
}
