'use client'

// ───────────────────────────────────────────────────────────────────────────
// 设备管理(参照上云平台 /device 模块):机场/观察站/无人机台账 + 在线状态 + 今日预警
// 诚实原则:机队数据来自 /api/drones 后端权威链路,未接入时如实显示「未接入」
// ───────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { RadioTower, Bot, Plane, BatteryMedium, Signal, MapPin, ShieldAlert } from 'lucide-react'
import { SCREEN_SITES, haversineKm, type ScreenSite } from '@/lib/utils/util-screen-sites'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Props {
  fleet: Drone[]
  tasks: TrainingTask[]
}

const STATUS_COLOR: Record<string, string> = {
  飞行中: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  巡航: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  返航: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
  充电中: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  待命: 'text-slate-300 bg-slate-500/15 border-slate-500/30',
  离线: 'text-slate-500 bg-slate-700/20 border-slate-600/30',
  故障: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
}

function nearestSiteOf(lat: number, lng: number): ScreenSite | null {
  let best: ScreenSite | null = null
  let bestD = Infinity
  for (const s of SCREEN_SITES) {
    const d = haversineKm(lat, lng, s.lat, s.lng)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return bestD <= 60 ? best : null
}

export default function DevicesMainView({ fleet, tasks }: Props) {
  const todayKey = new Date().toLocaleDateString('zh-CN')

  // 今日预警按最近站点归组
  const siteAlerts = useMemo(() => {
    const map = new Map<string, { today: number; total: number }>()
    for (const s of SCREEN_SITES) map.set(s.id, { today: 0, total: 0 })
    for (const t of tasks) {
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number') continue
      const s = nearestSiteOf(t.lat, t.lng)
      if (!s) continue
      const st = map.get(s.id)!
      st.total += 1
      if (t.createdAt && new Date(t.createdAt).toLocaleDateString('zh-CN') === todayKey) st.today += 1
    }
    return map
  }, [tasks, todayKey])

  // 无人机按 home 坐标归到最近站点
  const dronesBySite = useMemo(() => {
    const map = new Map<string, Drone[]>()
    for (const d of fleet) {
      const s = typeof d.homeLat === 'number' && typeof d.homeLng === 'number' ? nearestSiteOf(d.homeLat, d.homeLng) : null
      const key = s?.id ?? '_unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return map
  }, [fleet])

  const online = fleet.filter((d) => d.status && !['离线', '故障'].includes(d.status)).length
  const docks = SCREEN_SITES.filter((s) => s.type === 'dock')
  const osStations = SCREEN_SITES.filter((s) => s.type === 'os')

  return (
    <div className="space-y-4">
      {/* 统计瓦片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<RadioTower size={16} />} label="无人机机场" value={`${docks.length} 座`} sub={`关联无人机 ${docks.reduce((a, s) => a + (dronesBySite.get(s.id)?.length ?? 0), 0)} 架`} />
        <StatTile icon={<ShieldAlert size={16} />} label="OS 观察站" value={`${osStations.length} 座`} sub="热成像补点" />
        <StatTile icon={<Plane size={16} />} label="在线无人机" value={fleet.length ? `${online}/${fleet.length} 架` : '未接入'} sub={fleet.length ? '司空链路在线' : '等待司空平台接入'} />
        <StatTile icon={<ShieldAlert size={16} />} label="今日站点预警" value={String(SCREEN_SITES.reduce((a, s) => a + (siteAlerts.get(s.id)?.today ?? 0), 0))} sub="按最近站点归组" />
      </div>

      {/* 站点台账 */}
      <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-cyan-100">
          <MapPin size={16} className="text-cyan-300" /> 站点台账(机场 / OS 观察站)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[12px] text-slate-500">
                <th className="py-2 pr-3 font-medium">站点</th>
                <th className="py-2 pr-3 font-medium">类型</th>
                <th className="py-2 pr-3 font-medium">坐标</th>
                <th className="py-2 pr-3 font-medium">关联设备</th>
                <th className="py-2 pr-3 font-medium">在线</th>
                <th className="py-2 pr-3 font-medium">今日预警</th>
                <th className="py-2 font-medium">累计预警</th>
              </tr>
            </thead>
            <tbody>
              {SCREEN_SITES.map((s) => {
                const ds = dronesBySite.get(s.id) ?? []
                const dsOnline = ds.filter((d) => d.status && !['离线', '故障'].includes(d.status)).length
                const st = siteAlerts.get(s.id) ?? { today: 0, total: 0 }
                return (
                  <tr key={s.id} className="border-b border-slate-800/40 text-slate-200 transition-colors hover:bg-slate-800/30">
                    <td className="py-2.5 pr-3 font-medium">{s.name}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.type === 'dock' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-violet-500/15 text-violet-300'}`}>
                        {s.type === 'dock' ? '无人机机场' : 'OS 观察站'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[12px] text-slate-400">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</td>
                    <td className="py-2.5 pr-3">{ds.length ? `${ds.length} 架` : <span className="text-slate-500">未分配</span>}</td>
                    <td className="py-2.5 pr-3">{ds.length ? <span className={dsOnline ? 'text-emerald-300' : 'text-slate-500'}>{dsOnline}/{ds.length}</span> : '—'}</td>
                    <td className="py-2.5 pr-3 font-mono">{st.today}</td>
                    <td className="py-2.5 font-mono">{st.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 无人机机队 */}
      <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-cyan-100">
          <Bot size={16} className="text-cyan-300" /> 无人机机队
          {!fleet.length && <span className="ml-2 text-[12px] font-normal text-slate-500">后端未返回在线机队(需接入 DJI 司空/上云链路)</span>}
        </h2>
        {fleet.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700/60 py-10 text-center text-sm text-slate-500">
            机队为空 —— 平台诚实原则:未接入真实链路不显示模拟设备
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fleet.map((d) => {
              const sc = STATUS_COLOR[d.status] ?? STATUS_COLOR.待命
              return (
                <div key={d.id} className="rounded-lg border border-slate-800/60 bg-slate-800/30 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Plane size={15} className="shrink-0 text-cyan-300" />
                      <span className="truncate text-[14px] font-semibold text-slate-100">{d.name}</span>
                    </div>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] ${sc}`}>{d.status}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-slate-400">
                    <span className="flex items-center gap-1"><BatteryMedium size={13} /> 电量 {d.battery ?? '-'}%</span>
                    <span className="flex items-center gap-1"><Signal size={13} /> 信号 {d.signal ?? '-'}%</span>
                    <span>高度 {d.altitude ?? 0} m</span>
                    <span>速度 {d.speed ?? 0} m/s</span>
                    <span className="col-span-2 truncate">任务:{d.task || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 text-[12px] text-slate-400">
        <span className="text-cyan-300">{icon}</span> {label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  )
}
