// 无人机机队遥测 —— 后端权威驱动（/api/drones 提供数据）。
// 诚实原则：未接入真实链路（司空）时不显示任何无人机 —— 本地不做任何模拟兜底。
// 仅当后端返回 connection==='connected'（已接入司空平台·真实链路）的无人机时，
// 才进入实时机队；否则机队为空（前端各面板显示「未接入」空态）。

import { useEffect, useState } from 'react'
import {
  applyDronesFromBackend,
  type ApiDrone,
  type DroneConnection,
} from '@/lib/store/store-drone-registry'

export type DroneStatus =
  | '飞行中'
  | '巡航'
  | '返航'
  | '充电中'
  | '待命'
  | '离线'
  | '故障'

export interface Drone {
  id: string
  name: string
  model: string
  status: DroneStatus
  battery: number // 0-100
  altitude: number // m
  speed: number // m/s
  lng: number
  lat: number
  heading: number // 度
  signal: number // 0-100
  temperature: number // °C
  task: string
  homeLng: number
  homeLat: number
  batteryHistory: number[]
  /** 连接状态：已接入司空·实时 / 断开 / 异常 / 登记未接入 */
  connection: DroneConnection
  // ── 快速发现与稳定跟踪（研究要点①，真实链路字段；无真实值时如实为空）──
  /** 当前快速搜索模式：螺旋扫描 / ROI锁定 / 自适应变焦 / 返航 / 待命 / 无 */
  searchMode: '螺旋扫描' | 'ROI锁定' | '自适应变焦' | '返航' | '待命' | '无'
  /** 视觉里程计云台稳定 */
  gimbalStable: boolean
  /** 动态跟踪目标数 */
  trackingTargets: number
  /** 连续跟踪帧数 */
  trackingFrames: number
  /** 遮挡恢复次数 */
  occlusionRecovery: number
  /** 任务载荷 */
  payload: string
}

function taskText(d: { status: DroneStatus; id: string }): string {
  switch (d.status) {
    case '飞行中': return `飞行中 · ${d.id}`
    case '巡航': return '区域巡航'
    case '返航': return '返航中'
    case '充电中': return '充电中'
    case '待命': return '待命'
    case '离线': return '信号失联'
    case '故障': return '设备故障'
  }
}

/** 后端已接入真实链路(connected)的无人机 → 前端 Drone（保留电池历史曲线） */
function apiToDrone(a: ApiDrone, prev?: Drone): Drone {
  const dr: Drone = {
    id: a.id,
    name: a.name,
    model: a.model,
    status: a.status as DroneStatus,
    battery: a.battery ?? 0,
    altitude: a.altitude ?? 0,
    speed: a.speed ?? 0,
    lng: a.lng,
    lat: a.lat,
    heading: a.heading ?? 0,
    signal: a.signal ?? 0,
    temperature: a.temperature ?? 0,
    task: taskText({ status: a.status as DroneStatus, id: a.id }),
    homeLng: a.homeLng,
    homeLat: a.homeLat,
    batteryHistory: prev?.batteryHistory ?? [],
    connection: a.connection,
    searchMode: (a.searchMode as Drone['searchMode']) || '待命',
    gimbalStable: a.gimbalStable ?? false,
    trackingTargets: a.trackingTargets ?? 0,
    trackingFrames: a.trackingFrames ?? 0,
    occlusionRecovery: a.occlusionRecovery ?? 0,
    payload: a.payload || (a.hasThermal ? '热成像 + 可见光' : '可见光'),
  }
  return {
    ...dr,
    batteryHistory: prev?.batteryHistory && prev.batteryHistory.length ? [...prev.batteryHistory, Math.round(a.battery * 10) / 10].slice(-30) : [Math.round(a.battery * 10) / 10],
  }
}

/** 仅保留已接入真实链路（connection === 'connected'）的无人机 */
function backendFleet(list: ApiDrone[], prev: Drone[]): Drone[] {
  const byId = new Map(prev.map((d) => [d.id, d]))
  return list
    .filter((a) => a.connection === 'connected')
    .map((a) => apiToDrone(a, byId.get(a.id)))
}

/**
 * 实时机队（诚实空态）：后端无已接入(connected)无人机时返回空数组，
 * 前端各面板据此显示「未接入」，绝不伪造任何无人机遥测。
 */
export function useDroneFleet(): Drone[] {
  const [fleet, setFleet] = useState<Drone[]>([])

  useEffect(() => {
    let cancelled = false

    async function pull() {
      try {
        const r = await fetch('/api/drones')
        const d = await r.json()
        if (!r.ok || !Array.isArray(d.drones)) throw new Error('bad response')
        const list = d.drones as ApiDrone[]
        // 静默刷新注册表镜像（admin 面板用），但不影响机队空态判定
        applyDronesFromBackend(list)
        if (!cancelled) setFleet((prev) => backendFleet(list, prev))
      } catch {
        // 后端不可达：保持空机队（不显示任何虚假无人机）
        if (!cancelled) setFleet([])
      }
    }

    pull()
    const id = setInterval(pull, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return fleet
}
