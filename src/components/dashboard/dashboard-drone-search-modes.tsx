'use client'

import { useMemo } from 'react'
import { Compass, Radio, Eye, Activity, Thermometer, Route, Plane } from 'lucide-react'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

interface Props {
  fleet: Drone[]
}

export default function DroneSearchModes({ fleet }: Props) {
  const online = useMemo(() => fleet.filter((d) => d.status !== '离线' && d.status !== '故障'), [fleet])
  const lead = online.find((d) => d.status === '飞行中') || online.find((d) => d.status === '巡航') || online[0]

  if (!fleet.length) {
    return (
      <section className="dv-panel p-5">
        <div className="flex items-center gap-2">
          <Plane size={20} className="text-cyan-300" />
          <h2 className="dv-title text-lg font-semibold text-slate-100">无人机机队载荷状态</h2>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-slate-700/50 py-10 text-center text-sm text-slate-500">
          未接入无人机
        </div>
      </section>
    )
  }

  const gimbalStable = lead?.gimbalStable ?? false
  const trackingTargets = lead?.trackingTargets ?? 0
  const trackingFrames = lead?.trackingFrames ?? 0
  const occlusionRecovery = lead?.occlusionRecovery ?? 0

  return (
    <section className="dv-panel p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Plane size={20} className="text-cyan-300" />
        <h2 className="dv-title text-lg font-semibold text-slate-100">无人机机队载荷状态</h2>
        <span className="ml-auto text-xs text-slate-400">
          {online.length} / {fleet.length} 在线
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_.7fr]">
        <div className="space-y-2">
          {online.map((d) => {
            const active = lead?.id === d.id
            return (
              <div
                key={d.id}
                className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition ${
                  active
                    ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                    : 'border-slate-700/50 bg-slate-800/30'
                }`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-800/60 text-slate-500'}`}>
                  <Plane size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
                    {d.name}
                    {active && <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-200">主侦察</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {d.model} · {d.status} · 电量 {d.battery}% · 高度 {d.altitude}m · 信号 {d.signal}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Compass size={13} className="text-emerald-300" /> 主侦察机
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-100">{lead ? lead.name : '无在线无人机'}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {lead ? `${lead.model} · ${lead.status}` : '—'}
                </div>
              </div>
              <div className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                {lead ? lead.status : '离线'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl border p-3.5 ${gimbalStable ? 'border-emerald-400/40 bg-emerald-500/[0.07]' : 'border-slate-700/50 bg-slate-800/30'}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Eye size={13} className={gimbalStable ? 'text-emerald-300' : 'text-slate-500'} />
                云台稳定
              </div>
              <div className="mt-1.5 text-lg font-black text-white">
                {gimbalStable ? '稳定' : '待机'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Activity size={13} className="text-violet-300" /> 跟踪目标
              </div>
              <div className="mt-1.5 text-lg font-black text-white">{trackingTargets} 头</div>
              <div className="mt-1 text-[10.5px] leading-4 text-slate-400">{trackingFrames} 帧 · 恢复 {occlusionRecovery}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10.5px]">
            <span className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-slate-300">
              <Thermometer size={11} className="text-orange-300" /> 热成像
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-slate-300">
              <Route size={11} className="text-cyan-300" /> 航线优化
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-slate-300">
              <Radio size={11} className="text-emerald-300" /> 图传 {lead?.signal ?? 0}%
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
