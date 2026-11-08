'use client'

// ───────────────────────────────────────────────────────────────────────────
// 面板④地点分析:机场(无人机机场) / OS(观察站) 两个页签
// 每站点:今日预警、累计预警、平均风险、近7日趋势、设备状态(诚实:未接入显示未接入)
// ───────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import ScreenPanelFrame from './screen-panel-frame'
import { SCREEN_SITES, haversineKm, type SiteType } from '@/lib/utils/util-screen-sites'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Props {
  tasks: TrainingTask[]
  droneNames: string[]
  droneOnline: number
}

export default function ScreenLocationsPanel({ tasks, droneNames, droneOnline }: Props) {
  const [tab, setTab] = useState<SiteType>('dock')

  const stats = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('zh-CN')
    const bySite = new Map<string, { today: number; total: number; risks: number[]; days: number[] }>()
    for (const s of SCREEN_SITES) bySite.set(s.id, { today: 0, total: 0, risks: [], days: new Array(7).fill(0) })
    for (const t of tasks) {
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number') continue
      let bestId: string | null = null
      let bestD = Infinity
      for (const s of SCREEN_SITES) {
        const d = haversineKm(t.lat, t.lng, s.lat, s.lng)
        if (d < bestD) {
          bestD = d
          bestId = s.id
        }
      }
      if (!bestId || bestD > 60) continue
      const st = bySite.get(bestId)!
      st.total += 1
      st.risks.push(t.intrusionRisk ?? 0)
      if (t.createdAt) {
        const d = new Date(t.createdAt)
        const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
        if (diff >= 0 && diff < 7) st.days[6 - diff] += 1
        if (d.toLocaleDateString('zh-CN') === todayKey) st.today += 1
      }
    }
    return bySite
  }, [tasks])

  const sites = SCREEN_SITES.filter((s) => s.type === tab)
  const typeLabel = tab === 'dock' ? '无人机机场' : 'OS 观察站'

  return (
    <ScreenPanelFrame
      title="地点分析"
      extra={
        <div className="flex overflow-hidden rounded-sm border border-[#1d4ed8]/50">
          {(['dock', 'os'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-2.5 py-[3px] text-[12px] transition-colors ${
                tab === k ? 'bg-cyan-400/25 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {k === 'dock' ? '机场分析' : 'OS 分析'}
            </button>
          ))}
        </div>
      }
      className="min-h-0"
      bodyClass="overflow-hidden"
    >
      <div className="flex h-full flex-col gap-2 px-3 pb-2.5 pt-2">
        {/* 设备状态总条 */}
        <div className="flex shrink-0 items-center justify-between border border-[#1d4ed8]/25 bg-[#0a1c40]/60 px-3 py-1.5 text-[12px]">
          <span className="text-slate-400">{typeLabel} · 共 {sites.length} 处</span>
          <span className={droneOnline > 0 ? 'text-emerald-300' : 'text-slate-500'}>
            接入设备 {droneOnline > 0 ? `${droneOnline}/${droneNames.length} 在线` : '未接入(链路待开通)'}
          </span>
        </div>

        {/* 站点卡片 */}
        <div className="grid min-h-0 flex-1 grid-rows-3 gap-2">
          {sites.map((s) => {
            const st = stats.get(s.id) ?? { today: 0, total: 0, risks: [] as number[], days: new Array(7).fill(0) }
            const avgRisk = st.risks.length ? Math.round(st.risks.reduce((a, b) => a + b, 0) / st.risks.length) : 0
            const maxDay = Math.max(1, ...st.days)
            const online = droneNames.some((n) => n.includes(s.name.slice(0, 2)))
            return (
              <div key={s.id} className="flex min-h-0 items-center gap-3 border border-[#1d4ed8]/25 bg-[#0a1c40]/50 px-3">
                {/* 左:名称+状态 */}
                <div className="w-[132px] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="truncate text-[14px] font-semibold text-slate-100">{s.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {s.type === 'dock' ? '起降点' : '观察哨'} · {online ? '设备在线' : '待接入'}
                  </div>
                </div>
                {/* 中:数字 */}
                <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
                  <NumCell label="今日预警" value={st.today} color="#ff9a3c" />
                  <NumCell label="累计" value={st.total} color="#4da3ff" />
                  <NumCell label="均风险" value={avgRisk} color="#ff4d4f" />
                </div>
                {/* 右:近7日趋势 sparkline */}
                <div className="ml-auto flex h-[38px] w-[150px] shrink-0 flex-col">
                  <svg viewBox="0 0 150 26" className="w-full flex-1" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="1.6"
                      points={st.days.map((v, i) => `${(i / 6) * 146 + 2},${24 - (v / maxDay) * 21}`).join(' ')}
                      style={{ filter: 'drop-shadow(0 0 3px rgba(34,211,238,0.6))' }}
                    />
                    {st.days.map((v, i) => (
                      <circle key={i} cx={(i / 6) * 146 + 2} cy={24 - (v / maxDay) * 21} r="1.8" fill="#67e8f9" />
                    ))}
                  </svg>
                  <div className="text-center text-[10px] text-slate-500">近 7 日预警趋势</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScreenPanelFrame>
  )
}

function NumCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="font-mono text-[18px] font-bold leading-tight" style={{ color, textShadow: `0 0 10px ${color}55` }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}
