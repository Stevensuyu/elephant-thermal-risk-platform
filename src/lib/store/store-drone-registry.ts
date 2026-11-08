/**
 * @/lib/mock-local-storage/droneRegistry.ts
 * 巡检无人机注册表（前端镜像适配器，后端为权威源）。
 *
 * 这是用户要求的「后端无人机设备管理」的前端镜像层。真正的数据源是服务端
 * storage/drones.json（见 lib/droneStore.ts + /api/drones）。本适配器：
 *   - 保留原注册表的全部函数签名（getDrones / addDrone / updateDrone /
 *     removeDrone / onDronesChange / nextDroneId），settings 面板与 UnifiedFeed
 *     无需改动即可继续工作。
 *   - addDrone / updateDrone / removeDrone 现在做「乐观本地更新 + 后台同步后端」，
 *     同步成功后以后端返回为准，保证后端数量与前端的「实时监控 / 态势总览」一致。
 *   - 提供 applyDronesFromBackend() / syncDrones() 供 useDroneFleet 与司空连接
 *     在拉到后端数据后刷新本地镜像。
 *
 * 诚实边界：connection 明确区分「模拟桥接」与「已接入司空·实时」，镜像层只搬运
 * 后端状态，绝不伪造。
 */
export type DroneConnection =
  | 'simulated'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'

export interface SkyportBinding {
  deviceSn: string
  workspaceId?: string
  streamUrl?: string
}

/** 前端档案（不含实时遥测；遥测由 useDroneFleet 直接从 /api/drones 取） */
export interface ManagedDrone {
  id: string
  name: string
  model: string
  connection: DroneConnection
  homeLat: number
  homeLng: number
  skyport?: SkyportBinding
  streamUrl?: string
  sampleVideo?: string
  hasThermal?: boolean
  notes?: string
  createdAt: string
}

/** 后端返回的完整无人机（档案 + 遥测同体） */
export interface ApiDrone extends ManagedDrone {
  lat: number
  lng: number
  altitude: number
  speed: number
  heading: number
  battery: number
  signal: number
  temperature: number
  status: string
  gpsLocked: boolean
  updatedAt: string
  // ── 快速发现与稳定跟踪（研究要点①，后端遥测引擎产出）──
  searchMode?: '螺旋扫描' | 'ROI锁定' | '自适应变焦' | '返航' | '待命' | '无'
  gimbalStable?: boolean
  trackingTargets?: number
  trackingFrames?: number
  occlusionRecovery?: number
  payload?: string
}

const STORAGE_KEY = 'tianyan_drones'
const EVENT = 'tianyan-drones-change'

// 诚实原则：不预置任何模拟无人机。本地镜像仅反映用户登记 / 后端返回的真实设备；
// 无记录时为空数组（机队显示「未接入」空态），绝不伪造虚假机队。

function readLocal(): ManagedDrone[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ManagedDrone[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore */
  }
  return []
}

function toManaged(a: ApiDrone): ManagedDrone {
  return {
    id: a.id,
    name: a.name,
    model: a.model,
    connection: a.connection,
    homeLat: a.homeLat,
    homeLng: a.homeLng,
    skyport: a.skyport,
    streamUrl: a.streamUrl,
    sampleVideo: a.sampleVideo,
    hasThermal: a.hasThermal,
    notes: a.notes,
    createdAt: a.createdAt,
  }
}

// ── 本地镜像（localStorage 兜底，后端不可达时也可用）──────────────────────────
let mirror: ManagedDrone[] | null = null

function writeLocal(list: ManagedDrone[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function setMirror(list: ManagedDrone[], dispatch = true): ManagedDrone[] {
  mirror = list
  writeLocal(list)
  if (dispatch) window.dispatchEvent(new Event(EVENT))
  return list
}

/** 把后端返回的完整无人机列表落到本地镜像（不触发事件，供轮询静默刷新） */
export function applyDronesFromBackend(list: ApiDrone[]): ManagedDrone[] {
  return setMirror(list.map(toManaged), false)
}

export function getDrones(): ManagedDrone[] {
  if (typeof window === 'undefined') return []
  if (!mirror) mirror = readLocal()
  return mirror
}

/** 主动从后端拉取一次并刷新镜像（UI 首次挂载 / 司空连接后调用） */
export async function syncDrones(): Promise<ManagedDrone[]> {
  try {
    const r = await fetch('/api/drones')
    const d = await r.json()
    if (Array.isArray(d.drones)) return setMirror(d.drones.map(toManaged), false)
  } catch {
    /* 离线：保留既有镜像（无虚假种子） */
  }
  return getDrones()
}

function postJson(url: string, body: unknown): Promise<any> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
}

function putJson(url: string, body: unknown): Promise<any> {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
}

function delJson(url: string, body: unknown): Promise<any> {
  return fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
}

/** 添加无人机：乐观本地更新 + 后台同步后端，返回最新镜像 */
export async function addDrone(
  input: Omit<ManagedDrone, 'id' | 'createdAt' | 'connection'> & { id?: string },
): Promise<ManagedDrone[]> {
  const list = getDrones()
  let id = input.id?.trim()
  if (!id) {
    const max = list.reduce((m, d) => {
      const n = Number(d.id.replace(/[^0-9]/g, ''))
      return Number.isFinite(n) ? Math.max(m, n) : m
    }, 0)
    id = `UAV-${String(max + 1).padStart(2, '0')}`
  }
  const drone: ManagedDrone = {
    ...input,
    id,
    connection: input.skyport?.deviceSn ? 'disconnected' : 'simulated',
    createdAt: new Date().toISOString(),
  }
  const optimistic = [...list.filter((d) => d.id !== id), drone]
  setMirror(optimistic) // 立即渲染
  try {
    const d = await postJson('/api/drones', {
      id: drone.id,
      name: drone.name,
      model: drone.model,
      homeLat: drone.homeLat,
      homeLng: drone.homeLng,
      skyport: drone.skyport,
      streamUrl: drone.streamUrl,
      sampleVideo: drone.sampleVideo,
      hasThermal: drone.hasThermal,
      notes: drone.notes,
    })
    if (Array.isArray(d.drones)) return setMirror(d.drones.map(toManaged))
  } catch {
    /* 离线：保留乐观结果 */
  }
  return getDrones()
}

export async function updateDrone(id: string, patch: Partial<ManagedDrone>): Promise<ManagedDrone[]> {
  const optimistic = getDrones().map((d) => (d.id === id ? { ...d, ...patch } : d))
  setMirror(optimistic)
  try {
    const d = await putJson('/api/drones', { id, patch })
    if (Array.isArray(d.drones)) return setMirror(d.drones.map(toManaged))
  } catch {
    /* 离线：保留乐观结果 */
  }
  return getDrones()
}

export async function removeDrone(id: string): Promise<ManagedDrone[]> {
  const optimistic = getDrones().filter((d) => d.id !== id)
  setMirror(optimistic)
  try {
    // 批量删除端点（DELETE /api/drones，body.ids）会真正从 mock 仓库移除并返回最新列表，
    // 保证 useDroneFleet 每 5s 轮询不会把已删无人机复活。
    const d = await delJson('/api/drones', { ids: [id] })
    if (Array.isArray(d.drones)) return setMirror(d.drones.map(toManaged))
  } catch {
    /* 离线：保留乐观结果 */
  }
  return getDrones()
}

/** 批量删除（满足「支持对数量进行删除」） */
export async function removeDrones(ids: string[]): Promise<ManagedDrone[]> {
  const set = new Set(ids)
  const optimistic = getDrones().filter((d) => !set.has(d.id))
  setMirror(optimistic)
  try {
    const d = await delJson('/api/drones', { ids })
    if (Array.isArray(d.drones)) return setMirror(d.drones.map(toManaged))
  } catch {
    /* 离线：保留乐观结果 */
  }
  return getDrones()
}

export function onDronesChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

export function nextDroneId(): string {
  const list = getDrones()
  const max = list.reduce((m, d) => {
    const n = Number(d.id.replace(/[^0-9]/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `UAV-${String(max + 1).padStart(2, '0')}`
}
