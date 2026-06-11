import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const root = process.cwd()
const storageDir = path.join(root, 'storage')
const integrationsPath = path.join(storageDir, 'integrations.json')

export type IntegrationKind = 'map' | 'ai' | 'dji' | 'yolo' | 'thermal'

export interface IntegrationConfig {
  map: {
    provider: 'amap'
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
}

export interface IntegrationStatus {
  map: { configured: boolean; provider: string }
  ai: { configured: boolean; provider: string; endpoint: string }
  dji: { configured: boolean; provider: string; endpoint: string }
  yolo: { configured: boolean; provider: string; endpoint: string; weights: string }
  thermal: { configured: boolean; provider: string; source: string }
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
}

function isConfigured(value: string | undefined | null) {
  return Boolean(value && String(value).trim())
}

async function ensureStore() {
  await mkdir(storageDir, { recursive: true })
  try {
    await readFile(integrationsPath, 'utf8')
  } catch {
    await writeIntegrations(defaultConfig)
  }
}

export async function readIntegrations(): Promise<IntegrationConfig> {
  await ensureStore()
  try {
    const raw = await readFile(integrationsPath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<IntegrationConfig>
    return {
      map: { ...defaultConfig.map, ...(parsed.map || {}) },
      ai: { ...defaultConfig.ai, ...(parsed.ai || {}) },
      dji: { ...defaultConfig.dji, ...(parsed.dji || {}) },
      yolo: { ...defaultConfig.yolo, ...(parsed.yolo || {}) },
      thermal: { ...defaultConfig.thermal, ...(parsed.thermal || {}) },
    }
  } catch {
    return defaultConfig
  }
}

export async function writeIntegrations(config: IntegrationConfig) {
  await mkdir(storageDir, { recursive: true })
  await writeFile(integrationsPath, JSON.stringify(config, null, 2), 'utf8')
}

export async function updateIntegrations(patch: Partial<IntegrationConfig>) {
  const current = await readIntegrations()
  const next: IntegrationConfig = {
    map: { ...current.map, ...(patch.map || {}) },
    ai: { ...current.ai, ...(patch.ai || {}) },
    dji: { ...current.dji, ...(patch.dji || {}) },
    yolo: { ...current.yolo, ...(patch.yolo || {}) },
    thermal: { ...current.thermal, ...(patch.thermal || {}) },
  }
  await writeIntegrations(next)
  return next
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const config = await readIntegrations()
  return {
    map: {
      configured: isConfigured(config.map.apiKey),
      provider: 'AMap / 高德地图 JS API',
    },
    ai: {
      configured: isConfigured(config.ai.apiKey),
      provider: config.ai.providerName || 'AI 分析接口',
      endpoint: config.ai.baseUrl || '未配置',
    },
    dji: {
      configured: isConfigured(config.dji.cloudApiBaseUrl) || isConfigured(config.dji.openApiBaseUrl),
      provider: config.dji.providerName || 'DJI FlightHub 2',
      endpoint: config.dji.cloudApiBaseUrl || config.dji.openApiBaseUrl || '未配置',
    },
    yolo: {
      configured: isConfigured(config.yolo.serviceUrl),
      provider: config.yolo.providerName || 'YOLO 服务',
      endpoint: config.yolo.serviceUrl || '未配置',
      weights: config.yolo.weights || 'yolov8n.pt',
    },
    thermal: {
      configured: isConfigured(config.thermal.streamUrl) || isConfigured(config.thermal.snapshotUrl),
      provider: config.thermal.sourceName || '实时热成像流',
      source: config.thermal.streamUrl || config.thermal.snapshotUrl || '未配置',
    },
  }
}

