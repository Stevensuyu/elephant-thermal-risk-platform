// ───────────────────────────────────────────────────────────────────────────
// 前端模拟数据层：localStorage 持久化 + 轻量模拟演化
// 纯浏览器端，无任何服务器依赖。所有集合以此为准，由 router.ts 经 fetch 拦截提供。
// ───────────────────────────────────────────────────────────────────────────
import type { ApiDrone } from '@/lib/store/store-drone-registry'
import {
  SEED_TASKS,
  SEED_DRONES,
  SEED_PEOPLE,
  SEED_AI_MODELS,
  SEED_DISPATCH_CHANNELS,
  SEED_VIDEO_SOURCES,
  SEED_DETECTION_CONFIG,
  SEED_REALTIME_JUDGE_SETTINGS,
  type MockPerson,
} from '@/lib/mock/mock-data-seeder'
import type { TrainingTask } from '@/lib/utils/util-app-types'

const PREFIX = 'tianyan_mock_'

/** 警情数据版本：seed 发生结构性变化（如此次从默认 10 条清空为 []）时升级，
 *  确保已登录浏览器不会残留旧种子数据。 */
const TASKS_VERSION = '2'

function hasLS(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function read<T>(key: string, seed: T): T {
  if (!hasLS()) return seed
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    /* ignore */
  }
  // 首次：写入种子
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(seed))
  } catch {
    /* ignore */
  }
  return seed
}

function write<T>(key: string, data: T): void {
  if (!hasLS()) return
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

// ── 集合访问器 ────────────────────────────────────────────────
export const getTasks = (): TrainingTask[] => {
  if (!hasLS()) return SEED_TASKS
  try {
    const ver = window.localStorage.getItem(PREFIX + 'tasks_version')
    if (ver !== TASKS_VERSION) {
      // seed 已升级：清空旧 tasks，用新 seed 覆盖并记录版本
      window.localStorage.setItem(PREFIX + 'tasks', JSON.stringify(SEED_TASKS))
      window.localStorage.setItem(PREFIX + 'tasks_version', TASKS_VERSION)
      return SEED_TASKS
    }
  } catch { /* ignore */ }
  return read<TrainingTask[]>('tasks', SEED_TASKS)
}
export const setTasks = (t: TrainingTask[]) => {
  write('tasks', t)
  try {
    if (hasLS()) window.localStorage.setItem(PREFIX + 'tasks_version', TASKS_VERSION)
  } catch { /* ignore */ }
}

export const getDrones = (): ApiDrone[] => read<ApiDrone[]>('drones', SEED_DRONES)
export const setDrones = (d: ApiDrone[]) => write('drones', d)

// 登录账号以种子账号为准：若本地存储的人员数据为旧版/不兼容（缺失种子账号或无口令），
// 自动合并补回种子账号（保留用户自建账号），确保默认口令登录始终可用，杜绝因陈旧
// localStorage 数据导致「点登录进不去」的问题。
export const getPeople = (): MockPerson[] => {
  const list = read<MockPerson[]>('people', SEED_PEOPLE)
  let changed = false
  const merged: MockPerson[] = [...list]
  for (const s of SEED_PEOPLE) {
    const idx = merged.findIndex((p) => p.account === s.account)
    if (idx < 0) {
      merged.push(s)
      changed = true
    } else if (typeof merged[idx].password !== 'string' || merged[idx].password.length === 0) {
      merged[idx] = { ...merged[idx], ...s }
      changed = true
    }
  }
  if (changed) setPeople(merged)
  return merged
}
export const setPeople = (p: MockPerson[]) => write('people', p)

// AI 模型列表：保证预置的 OpenRouter 模型始终存在（兼容旧浏览器残留的空列表/旧种子），
// 且至少有一个模型处于 active 状态。用户自建模型予以保留。
export const getAiModels = (): any[] => {
  const list = read<any[]>('ai_models', SEED_AI_MODELS)
  let changed = false
  const merged: any[] = [...list]
  for (const seed of SEED_AI_MODELS) {
    const idx = merged.findIndex((m) => m.id === seed.id)
    if (idx < 0) {
      merged.unshift({ ...seed })
      changed = true
    }
  }
  if (!merged.some((m) => m.active ?? m.enabled)) {
    if (merged.length > 0) {
      merged[0] = { ...merged[0], active: true }
      changed = true
    }
  }
  if (changed) setAiModels(merged)
  return merged
}
export const setAiModels = (m: any[]) => write('ai_models', m)

export const getDispatchChannels = () => read<any[]>('dispatch_channels', SEED_DISPATCH_CHANNELS)
export const setDispatchChannels = (c: any[]) => write('dispatch_channels', c)

export const getVideoSources = () => read<any[]>('video_sources', SEED_VIDEO_SOURCES)
export const setVideoSources = (v: any[]) => write('video_sources', v)

// 已接入（测试通过）的视频源 id：仅代表“取流链路已连通”，不驱动任何检测/警情（诚实边界）。
export const getVideoSourceConnectedId = (): string | null => read<string | null>('video_source_connected', null)
export const setVideoSourceConnectedId = (id: string | null) => write('video_source_connected', id)

export const getDetectionConfig = () => read<any>('detection_config', SEED_DETECTION_CONFIG)
export const setDetectionConfig = (c: any) => write('detection_config', c)

export const getRealtimeJudgeSettings = () => read<any>('realtime_judge', SEED_REALTIME_JUDGE_SETTINGS)
export const setRealtimeJudgeSettings = (s: any) => write('realtime_judge', s)

// 直播检测来源模式：默认 'off'（未接入任何视频源，诚实返回无检测）。
// 仅当用户主动开启 'demo'（推演演示）时才返回模拟检测结果，且全程明确标注「推演」。
export const getLiveDetectionMode = (): 'off' | 'demo' => read<'off' | 'demo'>('live_detection_mode', 'off')
export const setLiveDetectionMode = (m: 'off' | 'demo') => write('live_detection_mode', m)

export const getDisposalWorkflows = () => read<any[]>('disposal_workflows', [])
export const setDisposalWorkflows = (w: any[]) => write('disposal_workflows', w)

// 处置流程「后台可配置」项（成员确认门控 / 步骤角色映射 / 报告字段）
export const getDisposalConfig = () => read<any>('disposal_config', null)
export const setDisposalConfig = (c: any) => write('disposal_config', c)

// 端到端分发记录：每次确认/分发都会真实落库（前端模拟），供面板推导流程阶段、渲染终端结果
export const getDispatchRecords = () => read<any[]>('dispatch_records', [])
export const setDispatchRecords = (r: any[]) => write('dispatch_records', r)

// ── 模拟直播状态（替代原 Python MJPEG 子进程） ─────────────────
export const getLiveRunning = (): boolean => read<boolean>('live_running', false)
export const setLiveRunning = (v: boolean) => write('live_running', v)

export function getLiveStateSim() {
  if (!getLiveRunning()) return null
  return {
    source: 'sim',
    name: '前端模拟直播',
    startedAt: new Date(Date.now() - 60000).toISOString(),
  }
}
export function getLiveStatusSim() {
  const running = getLiveRunning()
  return {
    running,
    connected: running,
    source: 'sim',
    name: '前端模拟直播',
    last_frame_ts: running ? new Date().toISOString() : null,
    last_error: null,
    note: running ? '前端模拟 · 实时检测中' : '已停止',
  }
}

// ── 轻量模拟演化：无人机缓慢移动 + 电量自然波动 ────────────────
let simTimer: ReturnType<typeof setInterval> | null = null
export function startSimulation(): void {
  if (typeof window === 'undefined') return
  if (simTimer) return
  simTimer = setInterval(() => {
    try {
      const list = getDrones()
      const next = list.map((d) => {
        const moving = d.status === '飞行中' || d.status === '巡航'
        const lat = moving ? d.lat + (Math.random() - 0.5) * 0.004 : d.lat
        const lng = moving ? d.lng + (Math.random() - 0.5) * 0.004 : d.lng
        const battery = Math.max(8, Math.min(100, d.battery - (moving ? 0.2 : -0.1)))
        const heading = moving ? (d.heading + 5) % 360 : d.heading
        const signal = Math.max(40, Math.min(100, d.signal + (Math.random() - 0.5) * 4))
        return { ...d, lat, lng, battery: Math.round(battery * 10) / 10, heading: Math.round(heading), signal: Math.round(signal), updatedAt: new Date().toISOString() }
      })
      setDrones(next)
    } catch {
      /* ignore */
    }
  }, 3000)
}
