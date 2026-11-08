'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapPinned, BrainCircuit, ShieldAlert,
  ListChecks, AlertTriangle, Radio, Activity, TrendingUp, Inbox,
} from 'lucide-react'
import RealMap, { type RealMapMarker, type RealMapDrone } from '@/components/dashboard/dashboard-real-map-leaflet'
import UnifiedFeed from '@/components/alert/alert-unified-feed-list'
import DroneSearchModes from '@/components/dashboard/dashboard-drone-search-modes'
import ActiveWarningBanner from '@/components/alert/alert-active-warning-banner'
import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

const LEVEL_ORDER: WarningLevel[] = ['RED', 'ORANGE', 'YELLOW', 'BLUE']

const LEVEL_META: Record<WarningLevel, {
  label: string
  short: string
  gradient: string
  text: string
  bar: string
  dot: string
  hex: string
}> = {
  RED: {
    label: '红色预警', short: '红',
    gradient: 'from-red-600 to-rose-500',
    text: 'text-white', bar: 'bg-white/80', dot: 'bg-red-500', hex: '#ff3b3b',
  },
  ORANGE: {
    label: '橙色预警', short: '橙',
    gradient: 'from-orange-500 to-amber-500',
    text: 'text-white', bar: 'bg-white/80', dot: 'bg-orange-500', hex: '#ff8a3b',
  },
  YELLOW: {
    label: '黄色预警', short: '黄',
    gradient: 'from-amber-400 to-yellow-400',
    text: 'text-slate-900', bar: 'bg-slate-900/25', dot: 'bg-amber-400', hex: '#facc15',
  },
  BLUE: {
    label: '蓝色预警', short: '蓝',
    gradient: 'from-sky-500 to-blue-500',
    text: 'text-white', bar: 'bg-white/80', dot: 'bg-sky-500', hex: '#3b82f6',
  },
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = display
    const to = value
    if (from === to) return
    const startTime = performance.now()
    const duration = 500
    const tick = (now: number) => {
      const p = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display}</span>
}

const MARKER_PRESETS = [
  { lat: 21.48, lng: 101.57, name: '西双版纳-野象谷' },
  { lat: 22.83, lng: 100.97, name: '普洱-景东' },
  { lat: 24.88, lng: 102.83, name: '昆明-晋宁' },
  { lat: 25.12, lng: 99.16, name: '保山-腾冲' },
  { lat: 23.36, lng: 103.15, name: '红河-个旧' },
  { lat: 22.00, lng: 100.80, name: '西双版纳-勐腊' },
  { lat: 25.69, lng: 100.16, name: '大理-巍山' },
  { lat: 23.88, lng: 102.83, name: '玉溪-新平' },
]

export default function MonitorView({
  tasks,
  fleet,
}: {
  tasks: TrainingTask[]
  fleet: Drone[]
}) {
  const mapMarkers = useMemo<RealMapMarker[]>(
    () => tasks.map((task, i) => {
      const p = MARKER_PRESETS[i % MARKER_PRESETS.length]
      const lng = typeof task.lng === 'number' ? task.lng : p.lng + ((i * 0.07) % 0.4) - 0.2
      const lat = typeof task.lat === 'number' ? task.lat : p.lat + ((i * 0.05) % 0.3) - 0.15
      return {
        id: task.id,
        name: task.name,
        lng,
        lat,
        level: task.warningLevel,
        risk: task.intrusionRisk,
      }
    }),
    [tasks],
  )

  const droneMarkers = useMemo<RealMapDrone[]>(
    () => fleet.map((d) => ({ id: d.id, lng: d.lng, lat: d.lat, status: d.status, battery: d.battery, altitude: d.altitude })),
    [fleet],
  )

  const levelCounts = useMemo(() => {
    const c: Record<WarningLevel, number> = { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }
    tasks.forEach((t) => { c[t.warningLevel] = (c[t.warningLevel] || 0) + 1 })
    return c
  }, [tasks])

  const total = tasks.length
  const realCount = tasks.filter((t) => t.realInference).length
  const highCount = levelCounts.RED + levelCounts.ORANGE
  const maxLevelCount = Math.max(1, ...LEVEL_ORDER.map((lv) => levelCounts[lv]))

  const latestTask = useMemo(
    () =>
      tasks.find((t) => t.warningLevel === 'RED') ||
      tasks.find((t) => t.warningLevel === 'ORANGE') ||
      tasks.find((t) => t.warningLevel === 'YELLOW') ||
      tasks.find((t) => t.warningLevel === 'BLUE') ||
      tasks[0] ||
      null,
    [tasks],
  )

  const [focusLevel, setFocusLevel] = useState<WarningLevel | null>(null)

  const activeBannerTask = useMemo(() => {
    const order: WarningLevel[] = ['RED', 'ORANGE', 'YELLOW']
    for (const lv of order) {
      const hit = tasks.find((t) => t.warningLevel === lv && t.status !== 'COMPLETED')
      if (hit) return hit
    }
    return null
  }, [tasks])

  return (
    <div className="space-y-4">
      {activeBannerTask && <ActiveWarningBanner task={activeBannerTask} />}


      {/* 统一画面中心（实时监控真实流 + 无人机频道，单一视频模块） */}
      <UnifiedFeed fleet={fleet} />

      {/* 实时动态地图 */}
      <section className="dv-panel dv-border-corners relative overflow-hidden p-5">
        <div className="dv-section-header mb-4">
          <div className="dv-section-accent" />
          <MapPinned size={18} className="text-emerald-400" />
          <h2 className="dv-section-title">实时动态地图</h2>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
            <span className="dv-dot-online" /> {fleet.length} 架无人机在线
          </span>
        </div>
        <div className="relative h-[calc(100vh-560px)] min-h-[540px] overflow-hidden rounded-lg border border-cyan-400/10 bg-slate-900">
          <RealMap markers={mapMarkers} drones={droneMarkers} routePoints={[]} className="h-full w-full" />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-3 rounded-lg border border-cyan-400/10 bg-black/70 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-sm">
            {LEVEL_ORDER.map((lv) => (
              <span key={lv} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${LEVEL_META[lv].dot}`} style={{ boxShadow: `0 0 6px ${LEVEL_META[lv].hex}` }} />
                {LEVEL_META[lv].label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 无人机热成像快速发现 */}
      <DroneSearchModes fleet={fleet} />
    </div>
  )
}
