'use client'

// ───────────────────────────────────────────────────────────────────────────
// 大屏头部:标题 + 时钟 + KPI 指标条
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Props {
  tasks: TrainingTask[]
  closedRatio: number
  avgResponseMin: number
}

export default function ScreenHeader({ tasks, closedRatio, avgResponseMin }: Props) {
  const [now, setNow] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const d = new Date()
      setNow(d.toLocaleTimeString('zh-CN', { hour12: false }))
      setDate(d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }))
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  const total = tasks.length
  const high = tasks.filter((t) => ['RED', 'ORANGE'].includes(t.warningLevel)).length
  const running = tasks.filter((t) => t.status === 'RUNNING').length

  return (
    <header className="relative flex h-[72px] shrink-0 items-center justify-between px-8">
      {/* 背景装饰线 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[72px] w-[720px] -translate-x-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(34,211,238,0.14) 0%, transparent 85%)', clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }}
      />

      {/* 左:等级统计 */}
      <div className="flex w-[430px] items-center gap-3">
        <KpiItem label="警情总数" value={total} color="#4da3ff" />
        <KpiItem label="红橙重点" value={high} color="#ff9a3c" />
        <KpiItem label="处置中" value={running} color="#22d3ee" />
      </div>

      {/* 中:标题 */}
      <div className="relative flex flex-col items-center">
        <h1
          className="text-[34px] font-black tracking-[0.18em] text-transparent bg-clip-text"
          style={{ backgroundImage: 'linear-gradient(180deg, #e0f2fe 20%, #38bdf8 60%, #818cf8 100%)', textShadow: '0 0 30px rgba(56,189,248,0.35)' }}
        >
          天眼护象 · 智能风险研判预警大屏
        </h1>
        <div className="mt-0.5 text-[12px] tracking-[0.3em] text-cyan-200/50">ELEPHANT THERMAL RISK PLATFORM</div>
      </div>

      {/* 右:时钟 + 效率 */}
      <div className="flex w-[430px] items-center justify-end gap-4">
        <KpiItem label="平均响应" value={`${avgResponseMin}′`} color="#a78bfa" />
        <KpiItem label="闭环率" value={`${closedRatio}%`} color="#34d399" />
        <div className="text-right leading-tight">
          <div className="font-mono text-[22px] font-bold text-cyan-100" style={{ textShadow: '0 0 14px rgba(34,211,238,0.5)' }}>
            {now}
          </div>
          <div className="text-[12px] text-slate-400">{date}</div>
        </div>
      </div>
    </header>
  )
}

function KpiItem({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="min-w-[92px] border border-[#1d4ed8]/40 px-3 py-1.5 text-center" style={{ background: 'rgba(10,28,64,0.75)' }}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-mono text-[22px] font-bold leading-tight" style={{ color, textShadow: `0 0 12px ${color}66` }}>
        {value}
      </div>
    </div>
  )
}
