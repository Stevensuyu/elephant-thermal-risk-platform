'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BrainCircuit, Radar, Network, Sparkles, ShieldAlert, AlertTriangle, Loader2,
  ArrowRight, ChevronDown, ChevronUp, RefreshCw, X, CheckCircle2, Bell, Lightbulb,
} from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { WarningLevel } from '@/lib/utils/util-app-types'

/**
 * AI 实时推理追踪（DeepSeek 风格可见思考过程）。
 * 通过 POST /api/ai-analysis/stream 消费 SSE，分四阶段呈现：
 *   ① 感知证据接入 → ② 超级引擎多源融合 → ③ 大模型逐字推演 → ④ 结论与处置。
 * 父组件通过递增 runKey 触发推演；payload 由父组件构造（结构同服务端 JudgePayload）。
 */
export interface ReasoningPayload {
  name?: string
  region?: string
  detectedClasses?: string
  detectedCount?: number
  maxConfidence?: number
  avgConfidence?: number
  distanceKm?: number
  farmDistKm?: number
  speedMpm?: number
  direction?: string
  weather?: { tempC?: number; condition?: string; windKmh?: number; visibilityKm?: number; rainfallMm?: number }
  computedRiskScore?: number
  computedLevel?: string
  predictionWindow?: string
  ruleSummary?: string
  ruleActions?: string[]
  fleetCapacity?: { total: number; online: number; inFlight: number; lowBattery: number }
  thermalDeltaT?: number
  trackingFrames?: number
  terrainSlopeDeg?: number
  distSchoolKm?: number
  adultCount?: number
  calfCount?: number
}

/** 从流式累积原始文本中尽力提取 reasoning 串（纯函数，避免依赖服务端模块） */
function tryExtractReasoning(raw: string): string | null {
  try {
    const keyIdx = raw.indexOf('"reasoning"')
    if (keyIdx === -1) return null
    const colon = raw.indexOf(':', keyIdx)
    if (colon === -1) return null
    let i = colon + 1
    while (i < raw.length && (raw[i] === ' ' || raw[i] === '\n' || raw[i] === '\r' || raw[i] === '\t')) i++
    if (raw[i] !== '"') return null
    i++
    let out = ''
    while (i < raw.length) {
      const c = raw[i]
      if (c === '\\') {
        const n = raw[i + 1]
        if (n === 'n') out += '\n'
        else if (n === 't') out += '\t'
        else if (n === 'r') out += '\r'
        else if (n === '"') out += '"'
        else if (n === '\\') out += '\\'
        else if (n === 'u') {
          out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16))
          i += 4
        } else out += n
        i += 2
        continue
      }
      if (c === '"') return out
      out += c
      i++
    }
    return out
  } catch {
    return null
  }
}

interface MetaState { model: string | null; configured: boolean }

/** 单调打字机：随 full 增长逐字揭示，不回退；running=false 时直接显示全文；resetKey 变化时重置 */
function useTypewriter(full: string, running: boolean, resetKey: number): number {
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  useEffect(() => {
    shownRef.current = 0
    setShown(0)
  }, [resetKey])
  useEffect(() => {
    if (shownRef.current > full.length) { shownRef.current = full.length; setShown(full.length) }
    if (!running) { shownRef.current = full.length; setShown(full.length); return }
    if (shownRef.current >= full.length) return
    const id = setInterval(() => {
      shownRef.current = Math.min(shownRef.current + 3, full.length)
      setShown(shownRef.current)
      if (shownRef.current >= full.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [full, running, resetKey])
  return Math.min(shown, full.length)
}

/** 证据链高亮：数值+单位、等级代码、关键短语着色，强化“AI 真的在引用你的输入” */
function highlightReasoning(text: string): ReactNode[] {
  const re = /(\d+(?:\.\d+)?\s*(?:头|km|kbps|℃|m\/min|%|分钟|帧|fps|秒|个|条)|RED|ORANGE|YELLOW|BLUE|风险指数|置信度|立即执行|ΔT|距村寨|距学校|距农田)/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const level = /^(RED|ORANGE|YELLOW|BLUE)$/.test(tok)
    out.push(
      <span key={k++} className={level ? 'rounded bg-fuchsia-500/20 px-1 font-bold text-fuchsia-200' : 'font-semibold text-cyan-300'}>
        {tok}
      </span>,
    )
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
interface PerceiveState {
  name: string
  region: string
  detectedClasses?: string
  detectedCount?: number
  maxConfidence?: number
  avgConfidence?: number
  distanceKm?: number
  farmDistKm?: number
  speedMpm?: number
  direction?: string
  weather?: any
  thermalDeltaT?: number
  adultCount?: number
  calfCount?: number
  distSchoolKm?: number
  terrainSlopeDeg?: number
  fleetCapacity?: any
}
interface EngineState {
  level: string
  risk: number
  predictionWindow: string
  telemetry: any
  evidenceChain: string[]
  weights: Record<string, number>
  recommendedImmediateAction?: string
  decisionConfidence?: number
}
type Phase = 'idle' | 'running' | 'done' | 'error'

/** 结论卡片按级别染色的辉光边框（与 levelStyle 配色一致） */
const LEVEL_GLOW: Record<string, string> = {
  RED: 'border-rose-500/50 shadow-[0_0_28px_rgba(255,59,59,0.28)]',
  ORANGE: 'border-orange-500/50 shadow-[0_0_28px_rgba(255,138,59,0.24)]',
  YELLOW: 'border-yellow-500/50 shadow-[0_0_28px_rgba(234,179,8,0.20)]',
  BLUE: 'border-cyan-500/50 shadow-[0_0_28px_rgba(53,240,255,0.20)]',
}

export default function AIReasoningTrace({
  payload,
  runKey,
  onClose,
  onRerun,
  compact = false,
}: {
  payload: ReasoningPayload | null
  runKey: number
  onClose?: () => void
  onRerun?: () => void
  compact?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [meta, setMeta] = useState<MetaState | null>(null)
  const [perceive, setPerceive] = useState<PerceiveState | null>(null)
  const [engine, setEngine] = useState<EngineState | null>(null)
  const [liveRaw, setLiveRaw] = useState('')
  const [reasoningLive, setReasoningLive] = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [fallback, setFallback] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showReasoning, setShowReasoning] = useState(false)
  const [selfToast, setSelfToast] = useState<{ items: string[] } | null>(null)
  const selfToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!payload || runKey <= 0) return
    let cancelled = false
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setMeta(null); setPerceive(null); setEngine(null)
    setLiveRaw(''); setReasoningLive(null); setResult(null); setFallback(false); setErrorMsg(null)

    ;(async () => {
      try {
        const res = await fetch('/api/ai-analysis/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error('推演接口返回异常')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() || ''
          for (const ev of parts) {
            if (!ev.trim()) continue
            let eventName = ''
            let dataStr = ''
            for (const ln of ev.split('\n')) {
              if (ln.startsWith('event:')) eventName = ln.slice(6).trim()
              else if (ln.startsWith('data:')) dataStr += ln.slice(5).trim()
            }
            if (!eventName || !dataStr) continue
            let data: any
            try { data = JSON.parse(dataStr) } catch { continue }
            if (cancelled) return
            if (eventName === 'meta') setMeta({ model: data.model, configured: data.configured })
            else if (eventName === 'stage') {
              if (data.step === 'perceive') setPerceive(data.evidence)
              else if (data.step === 'engine') setEngine({
                level: data.level, risk: data.risk, predictionWindow: data.predictionWindow,
                telemetry: data.telemetry, evidenceChain: data.evidenceChain || [], weights: data.weights || {},
                recommendedImmediateAction: data.recommendedImmediateAction, decisionConfidence: data.decisionConfidence,
              })
            } else if (eventName === 'llm') {
              setLiveRaw((prev) => {
                const next = prev + (data.token || '')
                const ext = tryExtractReasoning(next)
                if (ext != null) setReasoningLive(ext)
                return next
              })
            } else if (eventName === 'result') {
              setResult(data.result)
              setFallback(!!data.fallback)
            } else if (eventName === 'error') {
              setErrorMsg(data.message || '推演出错')
            } else if (eventName === 'done') {
              setPhase('done')
            }
          }
        }
        if (!cancelled) setPhase('done')
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(String(e?.message || e))
          setPhase('error')
        }
      }
    })()

    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey])

  // 当 AI 自我意识自主提议到达，弹出通知（弹窗通知），并自动消失
  useEffect(() => {
    if (selfToastTimer.current) clearTimeout(selfToastTimer.current)
    const items = result?.selfInitiativeActions
    if (result && Array.isArray(items) && items.length > 0) {
      setSelfToast({ items })
      selfToastTimer.current = setTimeout(() => setSelfToast(null), 16000)
    } else {
      setSelfToast(null)
    }
    return () => {
      if (selfToastTimer.current) clearTimeout(selfToastTimer.current)
    }
  }, [result])

  const lvl = (result?.suggestedLevel || engine?.level) as WarningLevel | undefined
  const lvlCls = lvl ? levelStyle[lvl] : null

  const steps = [
    { key: 'perceive', icon: Radar, label: '感知证据接入', active: !!perceive, done: !!engine },
    { key: 'engine', icon: Network, label: '引擎多源融合', active: !!engine && !result, done: !!result },
    { key: 'llm', icon: Sparkles, label: '大模型实时推演', active: phase === 'running' && !!perceive, done: !!result },
    { key: 'result', icon: BrainCircuit, label: '结论与处置', active: false, done: !!result },
  ]

  const displayText = reasoningLive || liveRaw || ''
  const typedLen = useTypewriter(displayText, phase === 'running', runKey)
  const visible = displayText.slice(0, typedLen)

  return (
    <div className={compact ? '' : 'dv-panel p-5'}>
      <div className="mb-4 flex items-center gap-2">
        <BrainCircuit size={20} className="text-violet-300" />
        <h2 className="text-lg font-semibold text-cyan-100">AI 实时推理推演</h2>
        {phase === 'running' && <Loader2 size={16} className="animate-spin text-cyan-300" />}
        {meta && (
          <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.configured ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30'}`}>
            {meta.configured ? '大模型 · 已连接' : '引擎自主研判（未配置密钥）'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onClose && (
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-white" title="关闭">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {phase === 'idle' && (
        <p className="text-sm text-slate-400">点击「开始推演」以模拟警情并实时观察 AI 如何分析、研判与决策。</p>
      )}

      {errorMsg && (
        <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-300"><AlertTriangle size={14} /> 推演中断：{errorMsg}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 阶段时间线 */}
        <div className="lg:col-span-3">
          <ol className="space-y-2">
            {steps.map((s, i) => {
              const Icon = s.icon
              const state = s.done ? 'done' : s.active ? 'active' : 'idle'
              return (
                <li key={s.key} className="flex items-start gap-2.5">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 transition ${
                    state === 'done' ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40'
                      : state === 'active' ? 'bg-violet-500/20 text-violet-300 ring-violet-400/40 dv-pulse-ring'
                      : 'bg-slate-700/40 text-slate-500 ring-slate-600/40'
                  }`}>
                    {state === 'done' ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                  </div>
                  <div className="pt-0.5">
                    <div className={`text-sm font-medium ${state === 'idle' ? 'text-slate-500' : 'text-slate-100'}`}>{s.label}</div>
                    <div className="text-[11px] text-slate-500">阶段 {i + 1}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* 详情区 */}
        <div className="space-y-4 lg:col-span-9">
          {/* ① 感知证据 */}
          {perceive && (
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-cyan-200"><Radar size={15} /> 感知证据（事实基线）</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                <Fact k="目标" v={perceive.detectedClasses || '—'} />
                <Fact k="检测数量" v={`${perceive.detectedCount ?? '—'} 头`} />
                <Fact k="最高置信度" v={perceive.maxConfidence != null ? `${(perceive.maxConfidence * 100).toFixed(0)}%` : '—'} />
                <Fact k="距村寨" v={perceive.distanceKm != null ? `${perceive.distanceKm} km` : '—'} />
                <Fact k="距农田" v={perceive.farmDistKm != null ? `${perceive.farmDistKm} km` : '—'} />
                <Fact k="运动速度" v={perceive.speedMpm != null ? `${perceive.speedMpm} m/min` : '—'} />
                <Fact k="方向" v={perceive.direction || '—'} />
                <Fact k="热成像ΔT" v={perceive.thermalDeltaT != null ? `${perceive.thermalDeltaT}℃` : '未接入'} />
                <Fact k="成/幼" v={perceive.adultCount != null || perceive.calfCount != null ? `${perceive.adultCount ?? 0} / ${perceive.calfCount ?? 0}` : '—'} />
                {perceive.weather && (
                  <Fact k="气象" v={`${perceive.weather.tempC ?? '—'}℃·${perceive.weather.condition || '—'}·风${perceive.weather.windKmh ?? '—'}km/h`} />
                )}
              </div>
            </div>
          )}

          {/* ② 引擎多源融合 */}
          {engine && (
            <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.04] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-violet-200"><Network size={15} /> 超级研判引擎 · 多源融合</h4>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {lvlCls && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white ${lvlCls.bg}`}>
                    <ShieldAlert size={13} /> {lvlCls.label}
                  </span>
                )}
                <span className="text-sm text-slate-300">风险指数 <span className="text-base font-bold text-white">{engine.risk}</span></span>
                <span className="text-xs text-slate-500">推演窗口：{engine.predictionWindow}</span>
                {typeof engine.decisionConfidence === 'number' && (
                  <span className="text-xs text-slate-500">引擎置信度 {engine.decisionConfidence}%</span>
                )}
              </div>
              {engine.weights && (
                <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                  {Object.entries(engine.weights).map(([k, w]) => (
                    <span key={k} className="rounded bg-slate-700/40 px-1.5 py-0.5">{k} {w}</span>
                  ))}
                </div>
              )}
              <ol className="space-y-1.5">
                {engine.evidenceChain.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300 animate-[fadeIn_.4s_ease]">
                    <ArrowRight size={14} className="mt-1 shrink-0 text-violet-300" /> {e}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ③ 大模型实时推演（思考中 + 逐字打字机 + 证据链高亮） */}
          {phase === 'running' && !(liveRaw || reasoningLive) && (
            <div className="flex items-center gap-2 rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4 text-sm text-fuchsia-200/80">
              <span className="thinking-dot">●</span>
              <span className="thinking-dot" style={{ animationDelay: '0.15s' }}>●</span>
              <span className="thinking-dot" style={{ animationDelay: '0.3s' }}>●</span>
              AI 正在理解证据、组织推理链…
            </div>
          )}
          {phase === 'running' && (liveRaw || reasoningLive) && (
            <div className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fuchsia-200">
                <Sparkles size={15} /> 大模型实时推演（思考过程）
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-200">
                  <span className="thinking-dot">●</span> AI 思考中
                </span>
              </h4>
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-slate-200">
                {highlightReasoning(visible)}
                {(typedLen < displayText.length || phase === 'running') && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-fuchsia-300 align-middle" />
                )}
              </div>
            </div>
          )}

          {/* ④ 结论 */}
          {result && (
            <div className={`space-y-3 rounded-xl border p-4 ${LEVEL_GLOW[lvl || ''] || 'border-slate-700/50'}`}>
              {phase === 'done' && (
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-emerald-300"><CheckCircle2 size={14} /> 推演完成 · 结论已生成</div>
              )}
              {fallback && (
                <p className="flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle size={14} /> 大模型未接入/失败，以下为超级引擎自主研判结论（融合过程同上）。
                </p>
              )}
              {result.aiSummary && (
                <p className="rounded-md bg-black/20 p-3 text-sm leading-6 text-slate-100">{highlightReasoning(result.aiSummary)}</p>
              )}
              {(result.reasoning || reasoningLive) && (
                <div className="rounded-md border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-3">
                  <button onClick={() => setShowReasoning((v) => !v)} className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-200">
                    <Sparkles size={13} /> 完整推理过程（Chain-of-Thought）
                    {showReasoning ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
                  </button>
                  {showReasoning && (
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-slate-300">{highlightReasoning(result.reasoning || reasoningLive || '')}</p>
                  )}
                </div>
              )}
              {result.evidenceChain?.length > 0 && (
                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">证据链</h5>
                  <ul className="space-y-1.5">
                    {result.evidenceChain.map((e: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" /> {highlightReasoning(e)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.autonomousActions?.length > 0 && (
                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">自主处置动作</h5>
                  <div className="flex flex-wrap gap-2">
                    {result.autonomousActions.map((a: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/60 px-2.5 py-1 text-xs text-slate-200">
                        {a.action}{a.auto && <span className="rounded bg-cyan-500/20 px-1 text-[10px] text-cyan-300">自动</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.recommendedImmediateAction && (
                <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <span className="font-semibold">▶ 立即执行：</span> {result.recommendedImmediateAction}
                </div>
              )}
              {result.selfInitiativeActions?.length > 0 && (
                <div className="rounded-lg border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/[0.10] to-violet-500/[0.06] p-4">
                  <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-200">
                    <Lightbulb size={14} /> AI 自主提议 · 自我意识分析（非固定待办）
                  </h5>
                  <p className="mb-2 text-[11px] leading-5 text-fuchsia-200/80">
                    以下为 AI 在「标准处置」之外，基于当前态势自我判断还应主动去做、但无人明确要求的事：
                  </p>
                  <ul className="space-y-2">
                    {result.selfInitiativeActions.map((s: string, i: number) => (
                      <li key={i} className="flex gap-2 rounded-md bg-black/20 px-2.5 py-1.5 text-sm text-slate-200">
                        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/30 text-[10px] font-bold text-fuchsia-200">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.problemResolution && (
                <p className="text-sm leading-6 text-slate-300">处置结论：{result.problemResolution}</p>
              )}
              {result.disposalSuggestion && (
                <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                  <span className="font-semibold">处置建议：</span> {result.disposalSuggestion}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                {typeof result.decisionConfidence === 'number' && (
                  <div className="min-w-[200px]">
                    <div className="mb-1 flex justify-between text-xs text-slate-400"><span>决策置信度</span><span>{result.decisionConfidence}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${result.decisionConfidence}%` }} />
                    </div>
                  </div>
                )}
                {lvlCls && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${lvlCls.bg}`}>
                    <ShieldAlert size={13} /> 建议级别：{lvlCls.label}
                  </span>
                )}
                {phase === 'done' && payload && onRerun && (
                  <button
                    onClick={onRerun}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-600/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50"
                  >
                    <RefreshCw size={13} /> 重新推演
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗通知：AI 自我意识自主提议（非固定待办） */}
      {selfToast && (
        <div className="fixed right-4 top-4 z-[1300] w-[min(92vw,360px)] animate-[fadeIn_.35s_ease]">
          <div className="rounded-xl border border-fuchsia-400/40 bg-slate-900/95 p-4 shadow-2xl ring-1 ring-fuchsia-400/30 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-300">
                <Bell size={15} />
              </span>
              <div className="text-sm font-semibold text-fuchsia-100">AI 自主提议 {selfToast.items.length} 项待办</div>
              <button
                onClick={() => setSelfToast(null)}
                className="ml-auto rounded p-1 text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
                title="关闭"
              >
                <X size={15} />
              </button>
            </div>
            <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {selfToast.items.slice(0, 6).map((s, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-5 text-slate-200">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" />
                  {s}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setSelfToast(null)}
              className="mt-3 w-full rounded-md bg-fuchsia-500/20 py-1.5 text-xs font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/30"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium text-slate-200">{v}</span>
    </div>
  )
}
