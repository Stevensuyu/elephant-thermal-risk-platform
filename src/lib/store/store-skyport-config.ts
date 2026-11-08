/**
 * 大疆司空 2 OpenAPI 配置存储
 * 凭证仅保存在服务端 data/skyport-config.json，前端只持有配置镜像。
 *
 * 官方文档：https://fh2-api.apifox.cn/
 * API 基础 URL（公有云）：https://es-flight-api-cn.djigate.com
 * 认证方式：X-User-Token header（不是 OAuth 2.0）
 */
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const SKYPORT_CONFIG_FILE = path.join(DATA_DIR, 'skyport-config.json')

export interface SkyportConfig {
  enabled: boolean
  baseUrl: string
  userToken: string           // X-User-Token，司空2 OpenAPI 认证凭证
  workspaceId: string
  // MQTT 遥测配置（云端互联转发）
  mqttEnabled: boolean
  mqttHost: string
  mqttPort: number
  mqttUsername: string
  mqttPassword: string
  // RTMP 视频流配置
  rtmpServerUrl: string
}

export const DEFAULT_SKYPORT_CONFIG: SkyportConfig = {
  enabled: false,
  baseUrl: 'https://es-flight-api-cn.djigate.com', // 司空2 公有云 API 网关
  userToken: '',
  workspaceId: '',
  mqttEnabled: false,
  mqttHost: '',
  mqttPort: 1883,
  mqttUsername: '',
  mqttPassword: '',
  rtmpServerUrl: '',
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function getSkyportServerConfig(): SkyportConfig {
  ensureDataDir()
  try {
    if (fs.existsSync(SKYPORT_CONFIG_FILE)) {
      const raw = fs.readFileSync(SKYPORT_CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SKYPORT_CONFIG, ...parsed }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SKYPORT_CONFIG }
}

export function saveSkyportServerConfig(patch: Partial<SkyportConfig>): SkyportConfig {
  ensureDataDir()
  const current = getSkyportServerConfig()
  const next = { ...current, ...patch }
  fs.writeFileSync(SKYPORT_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function isSkyportConfigured(cfg: SkyportConfig = getSkyportServerConfig()): boolean {
  return !!(cfg.enabled && cfg.baseUrl && cfg.userToken && cfg.workspaceId)
}
