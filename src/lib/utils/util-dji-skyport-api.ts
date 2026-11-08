/**
 * 大疆「司空平台」(DJI 司空 2 OpenAPI) 连接器的【前端封装】。
 *
 * 官方文档：https://fh2-api.apifox.cn/
 * 真实链路已下沉到后端（lib/store-skyport-config.ts + /api/skyport）：
 *   - 保存配置：setSkyportConfig → POST /api/skyport {action:'save'}
 *   - 连接/同步设备：connectSkyport → POST /api/skyport {action:'connect'}
 *   - 获取设备物模型（位置/热成像）：getDeviceState → POST /api/skyport {action:'device-state'}
 *   - 开启直播：startLiveStream → POST /api/skyport {action:'live-start'}
 *   - 停止直播：stopLiveStream → POST /api/skyport {action:'live-stop'}
 *   - 旁路推流：converterCreate/Start/Stop → POST /api/skyport {action:'converter-*'}
 *
 * 注意：
 *  - 实时位置遥测通过 MQTT 推送（thing/product/{sn}/osd），需在司空2配置云端互联
 *  - 凭证仅保存在后端，前端只持有配置镜像
 */
import { getDrones, addDrone, updateDrone } from '@/lib/store/store-drone-registry'

export interface SkyportConfig {
  enabled: boolean
  baseUrl: string
  userToken: string
  workspaceId: string
  mqttEnabled: boolean
  mqttHost: string
  mqttPort: number
  mqttUsername: string
  mqttPassword: string
  rtmpServerUrl: string
}

export interface DeviceState {
  sn: string
  latitude?: number
  longitude?: number
  altitude?: number
  speed?: number
  gimbalPitch?: number
  gimbalYaw?: number
  irMeteringMode?: string
  irMeteringPoint?: { x: number; y: number }
  irMeteringArea?: { x: number; y: number; width: number; height: number }
  batteryLevel?: number
  flightTime?: number
  raw?: any
}

const CFG_KEY = 'tianyan_skyport'
const CFG_EVENT = 'tianyan-skyport-change'

export const DEFAULT_SKYPORT: SkyportConfig = {
  enabled: false,
  baseUrl: 'https://es-flight-api-cn.djigate.com',
  userToken: '',
  workspaceId: '',
  mqttEnabled: false,
  mqttHost: '',
  mqttPort: 1883,
  mqttUsername: '',
  mqttPassword: '',
  rtmpServerUrl: '',
}

export function getSkyportConfig(): SkyportConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_SKYPORT }
  try {
    const raw = window.localStorage.getItem(CFG_KEY)
    if (raw) return { ...DEFAULT_SKYPORT, ...(JSON.parse(raw) as Partial<SkyportConfig>) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SKYPORT }
}

export async function setSkyportConfig(patch: Partial<SkyportConfig>): Promise<SkyportConfig> {
  const next = { ...getSkyportConfig(), ...patch }
  try {
    window.localStorage.setItem(CFG_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', patch }),
    })
    const d = await r.json()
    if (d.config) {
      window.localStorage.setItem(CFG_KEY, JSON.stringify(d.config))
      window.dispatchEvent(new Event(CFG_EVENT))
      return d.config as SkyportConfig
    }
  } catch {
    /* 离线：保留本地镜像 */
  }
  window.dispatchEvent(new Event(CFG_EVENT))
  return next
}

export function onSkyportChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const h = () => cb()
  window.addEventListener(CFG_EVENT, h)
  return () => window.removeEventListener(CFG_EVENT, h)
}

export type SkyportMode = 'real' | 'sim'

export interface ConnectResult {
  ok: boolean
  mode: SkyportMode
  devices: Array<{ sn: string; name: string; model: string; status: string }>
  error?: string
  message: string
}

async function syncDevicesToDroneStore(devices: ConnectResult['devices']) {
  const existing = getDrones()
  const existingBySn = new Map(existing.map((d: any) => [d.skyport?.deviceSn || d.sn, d]))

  for (const device of devices) {
    if (!device.sn) continue
    const existingDrone = existingBySn.get(device.sn)
    if (existingDrone) {
      await updateDrone(existingDrone.id, {
        connection: 'connected',
        name: device.name || existingDrone.name,
        model: device.model || existingDrone.model,
        skyport: { deviceSn: device.sn, workspaceId: getSkyportConfig().workspaceId },
      } as any)
    } else {
      await addDrone({
        name: device.name,
        model: device.model,
        connection: 'connected',
        hasThermal: false,
        homeLat: 22.6,
        homeLng: 100.3,
        skyport: { deviceSn: device.sn, workspaceId: getSkyportConfig().workspaceId },
      } as any)
    }
  }
}

/** 连接司空平台（经后端）。可选传入当前前端配置，先落后端再连接。 */
export async function connectSkyport(cfg: SkyportConfig = getSkyportConfig()): Promise<ConnectResult> {
  try {
    await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', patch: cfg }),
    })
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect' }),
    })
    const res = (await r.json()) as ConnectResult
    if (res.ok && res.devices && res.devices.length > 0) {
      await syncDevicesToDroneStore(res.devices)
    }
    window.dispatchEvent(new Event(CFG_EVENT))
    return res
  } catch (e: any) {
    return {
      ok: false,
      mode: 'sim',
      devices: [],
      error: e?.message || String(e),
      message: '司空连接请求失败（后端不可达），未接入真实无人机。',
    }
  }
}

/** 获取设备物模型信息（位置、热成像状态、电池等） */
export async function getDeviceState(deviceSn: string): Promise<DeviceState | null> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'device-state', deviceSn }),
    })
    const d = await r.json()
    if (d.success && d.state) return d.state as DeviceState
    return null
  } catch {
    return null
  }
}

/** 开启直播推流，返回拉流地址 */
export async function startLiveStream(deviceSn: string, cameraIndex: number = 0): Promise<{ playUrl: string; streamId?: string } | null> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'live-start', deviceSn, cameraIndex }),
    })
    const d = await r.json()
    if (d.success) return { playUrl: d.playUrl, streamId: d.streamId }
    return null
  } catch {
    return null
  }
}

/** 停止直播 */
export async function stopLiveStream(deviceSn: string): Promise<boolean> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'live-stop', deviceSn }),
    })
    const d = await r.json()
    return d.success
  } catch {
    return false
  }
}

/** 创建旁路推流转发器 */
export async function createConverter(deviceSn: string, rtmpUrl?: string): Promise<string | null> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'converter-create', deviceSn, rtmpUrl }),
    })
    const d = await r.json()
    if (d.success) return d.converterId
    return null
  } catch {
    return null
  }
}

/** 开启旁路推流转发器 */
export async function startConverter(converterId: string): Promise<boolean> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'converter-start', converterId }),
    })
    const d = await r.json()
    return d.success
  } catch {
    return false
  }
}

/** 停止旁路推流转发器 */
export async function stopConverter(converterId: string): Promise<boolean> {
  try {
    const r = await fetch('/api/skyport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'converter-stop', converterId }),
    })
    const d = await r.json()
    return d.success
  } catch {
    return false
  }
}

export function isRealSkyport(cfg: SkyportConfig = getSkyportConfig()): boolean {
  return !!(cfg.enabled && cfg.baseUrl && cfg.userToken && cfg.workspaceId)
}
