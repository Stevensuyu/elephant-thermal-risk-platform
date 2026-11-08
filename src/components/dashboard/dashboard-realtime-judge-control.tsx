'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Zap, Loader2, Radio, BrainCircuit, ShieldCheck, FlaskConical,
  Cctv, ScanSearch, FileWarning, Send, CircleStop, CirclePlay,
  Activity, Clock, ListChecks, Plus,
} from 'lucide-react'
import { judgeFromDetection } from '@/lib/utils/util-live-judge-engine'

const DEMO_BADGE = '推演演示'

interface SettingsResp {
  enabled?: boolean
}
interface LiveDetection {
  mode?: 'off' | 'demo'
  connected?: boolean
  running?: boolean
  detected?: boolean
  detected_count?: number
  count?: number
  max_confidence?: number
  confidence?: number
  note?: string
}

interface Props {
  compact?: boolean
  /** 主页面使用：隐藏「开启推演演示」按钮（模拟视频源仅在「设置 → 模拟测试」提供，符合指令） */
  hideDemoButton?: boolean
  /** 待研判警情数量，用于实时状态展示 */
  pendingCount?: number
  /** 停止推演演示时调用，用于清理地图上由推演生成的模拟警情 */
  onClearSimulated?: () => void
  /** 手动添加警情按钮回调 */
  onManualOpen?: () => void
}

const STAGES = [
  { key: 'source', title: '来源', icon: Cctv },
  { key: 'detect', title: '检测', icon: ScanSearch },
  { key: 'judge', title: '证据研判', icon: BrainCircuit },
  { key: 'alert', title: '警情', icon: FileWarning },
  { key: 'disposal', title: '处置', icon: Send },
]

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${s.toString().padStart(2, '0')}秒`
}

export default function RealtimeJudgeControl({
  compact = false,
  hideDemoButton = false,
  pendingCount = 0,
  onClearSimulated,
  onManualOpen,
}: Props) {
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<'off' | 'demo'>('off')
  const [det, setDet] = useState<LiveDetection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/realtime-judge-settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/live-detection', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, d]) => {
      const settings = (s && typeof s.enabled === 'boolean' ? s : s?.settings) as SettingsResp | undefined
      if (settings) setEnabled(settings.enabled !== false)
      if (d) {
        setMode(d.mode === 'demo' ? 'demo' : 'off')
        setDet(d)
      }
    }).finally(() => setLoading(false))
  }, [])

  // 实时时钟：驱动监测时长计时器
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  // 监测时长：研判审判开启的那一刻起持续计时（实时监测中）
  const monitorStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (enabled && monitorStartRef.current == null) monitorStartRef.current = Date.now()
    if (!enabled) monitorStartRef.current = null
  }, [enabled])
  const elapsedSec = enabled && monitorStartRef.current ? Math.max(0, Math.floor((now - monitorStartRef.current) / 1000)) : 0

  const connected = mode === 'demo'
  const detCount = det?.detected_count ?? det?.count ?? 0
  const detConf = det?.max_confidence ?? det?.confidence ?? 0
  const qualifying = connected && detCount > 0 && detConf >= 0.5
  const judge = qualifying
    ? judgeFromDetection({ running: true, detected_count: detCount, max_confidence: detConf })
    : null
  const willGenerate = enabled && qualifying

  const setDemo = (next: 'off' | 'demo') => {
    setBusy(true)
    fetch('/api/live-detection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.mode) {
          setMode(d.mode)
          setDet(d)
          // 停止推演演示时，自动清理由推演生成的模拟警情，避免用户误以为真实警情残留
          if (next === 'off' && onClearSimulated) onClearSimulated()
        }
      })
      .catch(() => { /* 忽略 */ })
      .finally(() => setBusy(false))
  }

  const toggleEnabled = () => {
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    fetch('/api/realtime-judge-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next, mode: next ? 'ai-llm-client' : 'off' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const s = (d && typeof d.enabled === 'boolean' ? d : d?.settings) as SettingsResp | undefined; if (s) setEnabled(s.enabled !== false) })
      .catch(() => { /* 保持本地 */ })
      .finally(() => setBusy(false))
  }

  // 紧凑模式（主研判页使用）：严格研判审判开关 + 明确标注「非真实」的一键接入推演源按钮
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={toggleEnabled}
          disabled={busy || loading}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition disabled:opacity-50 ${
            enabled
              ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-400 ring-1 ring-slate-600/60'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : enabled ? <BrainCircuit size={14} /> : <Zap size={14} />}
          {enabled ? '研判审判进行中' : '开启研判审判'}
        </button>

        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Radio size={12} className={connected ? 'animate-pulse text-amber-400' : 'text-slate-500'} />
          {connected ? `推演中 · ${detCount} 头` : '未接入视频流'}
        </span>



        {onManualOpen && (
          <button
            onClick={onManualOpen}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
          >
            <Plus size={12} /> 手动添加警情
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.05] p-4">
      {/* 顶部：研判审判开关 + 实时监测时长 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className={enabled ? 'text-violet-300' : 'text-slate-500'} />
          <span className="text-sm font-bold text-slate-100">研判审判</span>
          {enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
              <Activity size={11} className="animate-pulse" /> 实时监测中 · {fmtDuration(elapsedSec)}
            </span>
          )}
        </div>

        <button
          onClick={toggleEnabled}
          disabled={busy || loading}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
            enabled
              ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-400 ring-1 ring-slate-600/60'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : enabled ? <ShieldCheck size={15} /> : <Zap size={15} />}
          {enabled ? '研判审判进行中' : '开启研判审判'}
        </button>

        {!hideDemoButton && (
          !connected ? (
            <button
              onClick={() => setDemo('demo')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3.5 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <CirclePlay size={15} /> 开启推演演示（非真实视频）
            </button>
          ) : (
            <button
              onClick={() => setDemo('off')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/50 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/40 disabled:opacity-50"
            >
              <CircleStop size={15} /> 停止推演演示
            </button>
          )
        )}

        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
          <Radio size={12} className={connected ? 'animate-pulse text-amber-400' : 'text-slate-500'} />
          {connected ? '推演演示视频源' : '未接入视频流'}
        </span>
      </div>

      {/* 推演演示标注 */}
      {connected && (
        <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200 ring-1 ring-amber-400/30">
          <FlaskConical size={13} className="mr-1.5 inline" />
          推演演示 · 非真实视频源
        </div>
      )}

      {/* 实时研判状态条：监测状态 / 检测引擎 / 实时识别 / 待研判 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCard
          icon={Radio}
          label="监测状态"
          value={enabled ? '实时监测中' : '已停止'}
          tone={enabled ? 'emerald' : 'slate'}
          sub={enabled ? `已持续 ${fmtDuration(elapsedSec)}` : '未开启'}
        />
        <StatusCard
          icon={Cctv}
          label="检测引擎"
          value="YOLOv8 目标检测"
          tone="cyan"
          sub="运行中"
        />
        <StatusCard
          icon={ScanSearch}
          label="实时识别"
          value={connected && detCount > 0 ? `检出 ${detCount} 头` : '无目标'}
          tone={connected && detCount > 0 ? 'amber' : 'slate'}
          sub={connected && detCount > 0 ? `置信度 ${((detConf * 100) | 0)}%` : '等待视频流'}
        />
        <StatusCard
          icon={ListChecks}
          label="待研判"
          value={`${pendingCount} 条`}
          tone={pendingCount > 0 ? 'rose' : 'slate'}
          sub={pendingCount > 0 ? '需人工确认' : '队列清空'}
        />
      </div>

      {/* 未接入视频流时的诚实提示：模拟视频源仅在设置 → 模拟测试 提供 */}
      {!connected && (
        <div className="mt-3 rounded-lg border border-slate-600/40 bg-slate-800/40 px-3 py-2 text-[12px] leading-5 text-slate-400">
          <Clock size={13} className="mr-1.5 inline text-slate-500" />
          当前未接入实时视频流（真实司空链路）。研判审判已在实时监测中，YOLO 检测引擎待命；
          前往 <span className="text-cyan-300">「系统设置 → 模拟测试」</span> 开启「推演演示」即可实时观察
          <span className="text-amber-200"> 检测 → 预警 → AI 研判 → 人工确认 </span>
          全链路（推演演示 · 非真实视频）。
        </div>
      )}

      {/* 五段流水线：实时反映当前研判状态 */}
      <ol className="mt-4 space-y-0">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon
          const active =
            stage.key === 'source' ? connected :
            stage.key === 'detect' ? connected && detCount > 0 :
            stage.key === 'judge' ? qualifying :
            stage.key === 'alert' ? willGenerate :
            stage.key === 'disposal' ? willGenerate : false
          const isDemoStage = connected && active
          return (
            <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < STAGES.length - 1 && (
                <span className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px bg-slate-700/60" aria-hidden />
              )}
              <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition ${
                active
                  ? isDemoStage
                    ? 'bg-amber-500 shadow-lg shadow-amber-500/30'
                    : 'bg-gradient-to-br from-violet-600 to-cyan-600 shadow-lg shadow-violet-500/30'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                <Icon size={15} />
              </span>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${active ? 'text-slate-100' : 'text-slate-500'}`}>
                    {i + 1}. {stage.title}
                  </span>
                  {isDemoStage && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200 ring-1 ring-amber-400/30">
                      {DEMO_BADGE}
                    </span>
                  )}
                </div>
                <StageValue
                  stage={stage.key}
                  connected={connected}
                  det={det}
                  detCount={detCount}
                  detConf={detConf}
                  qualifying={qualifying}
                  judge={judge}
                  willGenerate={willGenerate}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StatusCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Radio
  label: string
  value: string
  sub?: string
  tone: 'emerald' | 'cyan' | 'amber' | 'rose' | 'slate'
}) {
  const toneCls: Record<string, string> = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    slate: 'text-slate-400',
  }
  const dotCls: Record<string, string> = {
    emerald: 'bg-emerald-400',
    cyan: 'bg-cyan-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    slate: 'bg-slate-500',
  }
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <Icon size={12} className={toneCls[tone]} />
        {label}
      </div>
      <div className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${toneCls[tone]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotCls[tone]} ${tone === 'emerald' || tone === 'amber' ? 'animate-pulse' : ''}`} />
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

function StageValue({
  stage,
  connected,
  det,
  detCount,
  detConf,
  qualifying,
  judge,
  willGenerate,
}: {
  stage: string
  connected: boolean
  det: LiveDetection | null
  detCount: number
  detConf: number
  qualifying: boolean
  judge: ReturnType<typeof judgeFromDetection> | null
  willGenerate: boolean
}) {
  let text = ''
  if (stage === 'source') text = connected ? '推演演示视频源' : '未接入'
  else if (stage === 'detect') text = connected && detCount > 0 ? `${detCount} 头 · 置信度 ${((detConf * 100) | 0)}%` : '无目标'
  else if (stage === 'judge') text = qualifying && judge ? `${judge.warningLevel === 'RED' ? '红色' : judge.warningLevel === 'ORANGE' ? '橙色' : judge.warningLevel === 'YELLOW' ? '黄色' : '蓝色'} · 风险 ${judge.intrusionRisk}` : '等待证据'
  else if (stage === 'alert') text = willGenerate ? '已生成推演警情' : '无警情'
  else if (stage === 'disposal') text = willGenerate ? '已生成工单' : '—'

  return <p className="mt-0.5 text-[12px] text-slate-400">{text}</p>
}
