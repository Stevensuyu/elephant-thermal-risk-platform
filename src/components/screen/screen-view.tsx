'use client'

// ───────────────────────────────────────────────────────────────────────────
// 数据大屏总装:登录后默认视图
// 布局 1920×1080:头部 72 / 左列(实时预警+分析笔录) / 中列(云南地图) / 右列(地点分析+精进反思)
// ───────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import ScreenContainer from './screen-container'
import ScreenHeader from './screen-header'
import { ScreenAlertsPanel, ScreenNotesPanel } from './screen-panel-alerts-notes'
import ScreenReflectionPanel from './screen-panel-reflection'
import ScreenLocationsPanel from './screen-panel-locations'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

const ScreenMapYunnan = dynamic(() => import('./screen-map-yunnan'), { ssr: false })

interface Props {
  tasks: TrainingTask[]
  fleet: Drone[]
  onOpenTask: (t: TrainingTask) => void
}

export default function ScreenView({ tasks, fleet, onOpenTask }: Props) {
  const [eff, setEff] = useState<{ closedRatio: number; avgResponseMin: number }>({ closedRatio: 0, avgResponseMin: 0 })

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/evaluation-metrics', { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (alive && d?.alerts) {
          setEff({ closedRatio: d.alerts.closedRatio ?? 0, avgResponseMin: d.alerts.avgResponseMin ?? 0 })
        }
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const droneNames = fleet.map((d) => d.name)
  const droneOnline = fleet.filter((d) => d.status && !['离线', '故障'].includes(d.status)).length

  return (
    <ScreenContainer>
      <div className="flex h-full w-full flex-col">
        <ScreenHeader tasks={tasks} closedRatio={eff.closedRatio} avgResponseMin={eff.avgResponseMin} />

        <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 pt-2">
          {/* 左列:实时预警(稍高) + 分析笔录 */}
          <div className="flex w-[460px] shrink-0 flex-col gap-3">
            <div className="flex min-h-0 flex-[11] flex-col">
              <ScreenAlertsPanel tasks={tasks} onOpenTask={onOpenTask} />
            </div>
            <div className="flex min-h-0 flex-[10] flex-col">
              <ScreenNotesPanel tasks={tasks} />
            </div>
          </div>

          {/* 中列:地图 */}
          <div className="relative min-w-0 flex-1 border border-[#1d4ed8]/25" style={{ background: 'rgba(6,18,48,0.6)' }}>
            <ScreenMapYunnan tasks={tasks} onOpenTask={onOpenTask} />
            {/* 地图标题角标 */}
            <div className="pointer-events-none absolute left-3 top-2.5 text-[13px] font-semibold tracking-widest text-cyan-200/80">
              云南亚洲象活动区 · 实时态势
            </div>
          </div>

          {/* 右列:地点分析 + 精进反思(填满整列高度) */}
          <div className="flex w-[460px] shrink-0 flex-col gap-3">
            <div className="flex min-h-0 flex-[11] flex-col">
              <ScreenLocationsPanel tasks={tasks} droneNames={droneNames} droneOnline={droneOnline} />
            </div>
            <div className="flex min-h-0 flex-[10] flex-col">
              <ScreenReflectionPanel />
            </div>
          </div>
        </div>
      </div>
    </ScreenContainer>
  )
}
