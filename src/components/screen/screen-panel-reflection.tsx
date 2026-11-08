'use client'

// ───────────────────────────────────────────────────────────────────────────
// 面板③精进反思:处置闭环 / 响应时效 / 分发触达 / 模型指标 + 改进建议
// 数据源:/api/evaluation-metrics(服务端真实计算,无 mock 兜底)
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import ScreenPanelFrame from './screen-panel-frame'

interface Metrics {
  alerts?: { total?: number; redOrange?: number; redOrangeRatio?: number; closed?: number; closedRatio?: number; avgResponseMin?: number }
  dispatch?: { total?: number; sent?: number }
  model?: { mAP50?: number; precision?: number; recall?: number }
}

interface Advice {
  level: 'good' | 'warn' | 'info'
  text: string
}

function deriveAdvice(m: Metrics): Advice[] {
  const out: Advice[] = []
  const a = m.alerts ?? {}
  const d = m.dispatch ?? {}
  const mo = m.model ?? {}
  if ((a.closedRatio ?? 100) < 80) {
    out.push({ level: 'warn', text: `闭环率 ${a.closedRatio}%,仍有 ${Math.max(0, (a.total ?? 0) - (a.closed ?? 0))} 条警情未闭环,建议复核长期未结案工单并限期处置。` })
  } else {
    out.push({ level: 'good', text: `闭环率 ${a.closedRatio}%,处置链路运转良好,保持当前巡护节奏。` })
  }
  if ((a.redOrangeRatio ?? 0) >= 40) {
    out.push({ level: 'warn', text: `红橙级警情占比 ${a.redOrangeRatio}%,偏高;建议加密重点活动区的无人机巡航与热成像复核频次。` })
  } else {
    out.push({ level: 'info', text: `红橙级占比 ${a.redOrangeRatio ?? 0}%,风险结构平稳;持续关注雨季食源变化。` })
  }
  const total = d.total ?? 0
  const sent = d.sent ?? 0
  if (total > 0 && sent < total) {
    out.push({ level: 'warn', text: `分发通道触达 ${sent}/${total},部分通道未验证,建议在「系统设置→分发通道」中做连通性测试。` })
  } else if (total > 0) {
    out.push({ level: 'good', text: `分发通道全部触达(${total}/${total}),预警链路完整。` })
  }
  out.push({
    level: 'info',
    text: `检测模型 mAP50 ${(mo.mAP50 ?? 0).toFixed(2)} / 精确率 ${(mo.precision ?? 0).toFixed(2)} / 召回率 ${(mo.recall ?? 0).toFixed(2)};建议持续收集夜间远距难例样本,精进模型再训。`,
  })
  return out
}

export default function ScreenReflectionPanel() {
  const [m, setM] = useState<Metrics>({})
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/evaluation-metrics', { cache: 'no-store' })
        if (!r.ok) throw new Error('bad')
        const d = await r.json()
        if (alive) {
          setM(d)
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const a = m.alerts ?? {}
  const mo = m.model ?? {}
  const dispatch = m.dispatch ?? {}
  const advice = deriveAdvice(m)
  const levelColor = { good: '#34d399', warn: '#ff9a3c', info: '#4da3ff' } as const

  return (
    <ScreenPanelFrame
      title="精进反思"
      extra={<span>处置复盘 · 持续精进</span>}
      className="min-h-0"
      bodyClass="overflow-hidden"
    >
      <div className="flex h-full flex-col px-3 pb-2 pt-2">
        {/* 三项核心指标 */}
        <div className="grid shrink-0 grid-cols-3 gap-2">
          <Gauge label="闭环率" value={a.closedRatio ?? 0} unit="%" color="#34d399" />
          <Gauge label="平均响应" value={a.avgResponseMin ?? 0} unit="min" color="#a78bfa" />
          <Gauge label="通道触达" value={dispatch.total ? Math.round(((dispatch.sent ?? 0) / dispatch.total) * 100) : 0} unit="%" color="#22d3ee" />
        </div>

        {/* 模型指标条 */}
        <div className="mt-2.5 shrink-0 space-y-1.5 border border-[#1d4ed8]/25 bg-[#0a1c40]/60 px-3 py-2">
          <ModelBar label="mAP50" v={mo.mAP50 ?? 0} color="#22d3ee" />
          <ModelBar label="精确率" v={mo.precision ?? 0} color="#818cf8" />
          <ModelBar label="召回率" v={mo.recall ?? 0} color="#38bdf8" />
        </div>

        {/* 改进建议 */}
        <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {failed && <div className="text-[12px] text-rose-300/80">指标服务暂不可用,显示为最后已知状态</div>}
          {advice.map((it, i) => (
            <div key={i} className="flex items-start gap-2 border-l-2 bg-[#0a1c40]/40 px-2.5 py-1.5" style={{ borderColor: levelColor[it.level] }}>
              <span
                className="mt-[3px] shrink-0 rounded px-1 text-[10px] font-bold text-black/90"
                style={{ background: levelColor[it.level] }}
              >
                {it.level === 'good' ? '优' : it.level === 'warn' ? '警' : '议'}
              </span>
              <p className="text-[12.5px] leading-snug text-slate-300">{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </ScreenPanelFrame>
  )
}

/** 环形指标 */
function Gauge({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const R = 22
  const C = 2 * Math.PI * R
  return (
    <div className="flex flex-col items-center border border-[#1d4ed8]/25 bg-[#0a1c40]/60 py-1.5">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle cx="29" cy="29" r={R} fill="none" stroke="#12305e" strokeWidth="5" />
        <circle
          cx="29" cy="29" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 29 29)"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
        <text x="29" y="33" textAnchor="middle" fill="#e0f2fe" fontSize="13" fontWeight="700">
          {value}
        </text>
      </svg>
      <div className="text-[11px] text-slate-400">
        {label} <span className="text-slate-600">{unit}</span>
      </div>
    </div>
  )
}

function ModelBar({ label, v, color }: { label: string; v: number; color: string }) {
  const pct = Math.round(v * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 text-[11px] text-slate-400">{label}</span>
      <div className="h-[7px] flex-1 overflow-hidden rounded-sm bg-[#12305e]">
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}88` }} />
      </div>
      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] text-slate-300">{pct}%</span>
    </div>
  )
}
