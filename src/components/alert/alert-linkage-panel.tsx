'use client'

/**
 * 警情分发流程 · 跨部门警情联动（研究要点④）
 * ───────────────────────────────────────────────────────────────────────────
 * 四节可视化整个警情分发流程（全部真实数据 + 真实操作，不是功能展示）：
 *   ① 警情来源 · 标准化事件   —— 当前最高级活动警情的标准字段（象群规模/位置/
 *                                  移动趋势/风险/预案），以及来源标注；
 *   ② 智能分发中间件           —— 处理链（预警信息 → 中间件 → 隔离网闸导入）
 *                                 与最近一次分发的编号/时间/标准卡片载荷；
 *   ③ 终端分发结果             —— 六类终端真实发送结果（已送达/失败/未启用、
 *                                 协议、HTTP 状态码、错误、时间）+ 送达进度；
 *   ④ 处置闭环 · 确认与评估     —— 处置工单进度、「AI后人工确认」入口、推进处置、
 *                                 重新分发、处置后多维度评估指标。
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { openSse } from '@/lib/utils/util-frontend-mode'
import {
  Network, ShieldCheck, Landmark, MonitorSmartphone, ClipboardList, ArrowRight, CheckCircle2,
  MapPin, Users, TrendingUp, AlertOctagon, FileText, RefreshCw, Loader2, BarChart3, XCircle,
  FlaskConical, PlayCircle, Send, ShieldAlert, X,
} from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import DisposalTimeline from '@/components/disposal/disposal-timeline-panel'
import type { DisposalWorkflow } from '@/lib/store/store-disposal-workflows'

/** 六类使用终端（与后端 dispatchChannels 通道 id 对应） */
const TERMINAL_ICONS: Record<string, { icon: any; via: string }> = {
  Police_Gis_Dashboard: { icon: MonitorSmartphone, via: 'SSE 站内广播' },
  Command_Dashboard: { icon: ClipboardList, via: 'SSE 站内广播' },
  Ranger_App_FCM: { icon: Users, via: 'HTTP Webhook' },
  Village_GPIO_Broadcaster: { icon: Landmark, via: 'HTTP 桥(MQTT)' },
  UAV_Autopilot_Gateway: { icon: TrendingUp, via: 'UDP / MAVLink' },
  SMS_Gateway: { icon: FileText, via: 'HTTP Webhook' },
}

interface DispatchRecord {
  dispatchId: string
  taskId: string
  taskName: string
  level: string
  risk: number
  target: string
  protocol: string
  kind?: string
  description: string
  status: 'sent' | 'failed' | 'skipped'
  statusCode?: number
  error?: string
  attempts?: number
  ts: string
}

interface EvalMetrics {
  alerts: { total: number; redOrange: number; redOrangeRatio: number; closed: number; closedRatio: number; avgResponseMin: number }
  dispatch: { total: number; sent: number; byTarget: Record<string, number>; byLevel: Record<string, number> }
  model: { mAP50: number | null; precision: number | null; recall: number | null }
}

interface WorkflowInfo {
  taskId: string
  level: string
  steps: Array<{ id: string; title: string; status: string; type?: string; assignedRole?: string }>
  requireConfirm?: boolean
}

/** 处置步骤类别短标签（弹窗/面板分发类别一致） */
const STEP_TYPE_LABEL: Record<string, string> = {
  receive: '接警受理',
  monitor: '监测锁定',
  verify: '核实研判',
  broadcast: '预警广播',
  dispatch: '人员调度',
  uav: '无人机介入',
  deter: '科学驱离',
  blockade: '封锁警戒',
  traffic: '交通管制',
  evacuate: '群众疏散',
  rescue: '医疗救援',
  logistics: '后勤保障',
  publicity: '舆情引导',
  report: '上报联动',
  review: '复盘留痕',
  archive: '结案归档',
}

interface Props {
  tasks: TrainingTask[]
  /** 当前操作人（确认分发 / 推进处置留痕） */
  operatorName?: string
  /** 当前登录角色，用于控制处置时间线按钮可见性 */
  currentRole?: string
}

export default function AlarmLinkagePanel({ tasks, operatorName = 'admin', currentRole = 'admin' }: Props) {
  const [displayTaskId, setDisplayTaskId] = useState<string | null>(null)

  // 取当前最高级活动警情作为分发对象
  const activeTarget =
    tasks.find((t) => t.warningLevel === 'RED' && t.status !== 'COMPLETED') ||
    tasks.find((t) => t.warningLevel === 'ORANGE' && t.status !== 'COMPLETED') ||
    tasks.find((t) => t.warningLevel === 'YELLOW' && t.status !== 'COMPLETED') ||
    tasks.find((t) => t.warningLevel === 'BLUE' && t.status !== 'COMPLETED') ||
    null

  // 案件归档后仍保留展示：displayTask 跟随 activeTarget，但 activeTarget 消失时保留最后一个警情
  useEffect(() => {
    if (activeTarget?.id && activeTarget.id !== displayTaskId) setDisplayTaskId(activeTarget.id)
  }, [activeTarget?.id])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (displayTaskId && !tasks.some((t) => t.id === displayTaskId)) setDisplayTaskId(null)
  }, [displayTaskId, tasks])

  const target = activeTarget || tasks.find((t) => t.id === displayTaskId) || null
  const isArchived = target?.status === 'COMPLETED'

  const lv = levelStyle[target?.warningLevel || 'BLUE']
  const [records, setRecords] = useState<DispatchRecord[]>([])
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowInfo | null>(null)
  const [busy, setBusy] = useState<'dispatch' | 'confirm' | 'advance' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0)
  // ═══ 分发动画演示 ═══
  const [animating, setAnimating] = useState(false)
  const [animStage, setAnimStage] = useState(0) // 0=未开始, 1-4=当前阶段
  const [animTerminals, setAnimTerminals] = useState<Set<string>>(new Set())
  const [animComplete, setAnimComplete] = useState(false)
  const animTimersRef = useRef<number[]>([])
  const panelRef = useRef<HTMLElement>(null)

  // 终端送达回执动画：跟踪新变为“已送达”的终端，给其一次性脉冲
  const prevSentRef = useRef<Set<string>>(new Set())
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const nowSent = new Set(records.filter((r) => r.status === 'sent').map((r) => r.target))
    const newly = [...nowSent].filter((t) => !prevSentRef.current.has(t))
    prevSentRef.current = nowSent
    if (newly.length) {
      setPulseIds(new Set(newly))
      const t = setTimeout(() => setPulseIds(new Set()), 1200)
      return () => clearTimeout(t)
    }
  }, [records])

  const loadDispatch = (taskId?: string) => {
    if (!taskId) {
      setRecords([])
      return
    }
    const q = `?taskId=${encodeURIComponent(taskId)}`
    fetch(`/api/dispatch${q}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { records?: DispatchRecord[] }) => {
        if (Array.isArray(d.records)) setRecords(d.records)
      })
      .catch(() => { /* ignore */ })
  }
  const loadWorkflow = (taskId?: string) => {
    if (!taskId) {
      setWorkflow(null)
      return
    }
    fetch(`/api/disposal?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { workflow?: WorkflowInfo }) => {
        if (d?.workflow) setWorkflow(d.workflow)
      })
      .catch(() => { /* 尚无工单 */ })
  }

  useEffect(() => {
    loadDispatch(target?.id)
    loadWorkflow(target?.id)
    fetch('/api/evaluation-metrics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: EvalMetrics) => setMetrics(d))
      .catch(() => { /* ignore */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  // 站内实时推送（SSE）：分发完成即刷新
  // 纯前端模式下 openSse 返回 no-op，不会向已删除的 /api/dispatch-sse 发起连接。
  useEffect(() => {
    if (!target) return
    const es = openSse('/api/dispatch-sse')
    es.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data)
        if (m?.type === 'dispatch' && m.taskId === target.id) loadDispatch(target.id)
      } catch { /* ignore */ }
    }
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  // 监听「新警情弹窗确认」事件 → 重新拉取分发记录与处置工单，驱动流程阶段推进
  useEffect(() => {
    const onConfirmed = () => {
      if (target?.id) {
        loadDispatch(target.id)
        loadWorkflow(target.id)
      }
    }
    window.addEventListener('alarm:confirmed', onConfirmed)
    return () => window.removeEventListener('alarm:confirmed', onConfirmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  // AI 研判后人工确认 → 确认并真实分发
  const confirmAndDispatch = async () => {
    if (!target || busy) return
    setBusy('confirm')
    setMsg(null)
    try {
      const r = await fetch('/api/dispatch/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: target.id, by: operatorName }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setMsg({ ok: true, text: `已确认（${operatorName}）并分发 ${d.summary?.sent ?? 0}/${d.summary?.total ?? 6} 个通道` })
        loadDispatch(target.id)
        loadWorkflow(target.id)
      } else {
        setMsg({ ok: false, text: d.error || '确认失败' })
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '确认失败' })
    } finally {
      setBusy(null)
    }
  }

  const runDispatch = async () => {
    if (!target || busy) return
    setBusy('dispatch')
    setMsg(null)
    try {
      await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: target.id }),
      })
      loadDispatch(target.id)
    } catch { /* ignore */ } finally {
      setBusy(null)
    }
  }

  // ═══ 分发动画演示：4阶段流程条 + 6终端逐个点亮 ═══
  const clearAnimTimers = () => {
    animTimersRef.current.forEach((t) => clearTimeout(t))
    animTimersRef.current = []
  }

  const playDispatchAnimation = () => {
    clearAnimTimers()
    setAnimating(true)
    setAnimComplete(false)
    setAnimStage(1) // 阶段1：警情来源 立即点亮
    setAnimTerminals(new Set())

    const terminalOrder = Object.keys(TERMINAL_ICONS)
    let delay = 600

    // 阶段2：分发中间件
    animTimersRef.current.push(window.setTimeout(() => setAnimStage(2), delay))
    delay += 500

    // 6个终端逐个点亮（每个间隔0.7秒）
    terminalOrder.forEach((term, idx) => {
      animTimersRef.current.push(window.setTimeout(() => {
        setAnimTerminals((prev) => new Set([...prev, term]))
      }, delay))
      delay += 700
    })

    // 阶段3：终端分发（所有终端点亮后）
    animTimersRef.current.push(window.setTimeout(() => setAnimStage(3), delay))
    delay += 500

    // 阶段4：处置闭环
    animTimersRef.current.push(window.setTimeout(() => {
      setAnimStage(4)
      setAnimating(false)
      setAnimComplete(true)
    }, delay))
  }

  const replayAnimation = () => {
    playDispatchAnimation()
  }

  // 监听「新警情确认分发」事件 → 自动播放分发动画 + 滚动到面板
  useEffect(() => {
    const onConfirmed = () => {
      // 延迟播放，等数据加载完成
      const t = window.setTimeout(() => {
        playDispatchAnimation()
        // 滚动到联动面板
        if (panelRef.current) {
          panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 300)
      return () => clearTimeout(t)
    }
    window.addEventListener('alarm:confirmed', onConfirmed)
    return () => {
      window.removeEventListener('alarm:confirmed', onConfirmed)
      clearAnimTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  const advanceWorkflow = async () => {
    if (!target || busy) return
    setBusy('advance')
    setMsg(null)
    try {
      // 先尝试拉取当前工单；无工单则生成 AI 处置流程
      const getR = await fetch(`/api/disposal?taskId=${encodeURIComponent(target.id)}`, { cache: 'no-store' })
      const getD = await getR.json().catch(() => ({}))
      let wf = getD.workflow || null
      let justGenerated = false

      if (!wf) {
        const genR = await fetch('/api/disposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: target.id }),
        })
        const genD = await genR.json().catch(() => ({}))
        if (!genR.ok) {
          setMsg({ ok: false, text: genD.error || '生成 AI 处置流程失败' })
          setBusy(null)
          return
        }
        wf = genD.workflow || null
        justGenerated = true
        setMsg({ ok: true, text: 'AI 处置流程已生成' })
      }

      // 若本次是首次生成，则仅展示 AI 处置流程，不自动推进（后续点击再逐步推进）
      const runningIdx = wf?.steps?.findIndex((s: any) => s.status === 'executing')
      const firstPendingIdx = wf?.steps?.findIndex((s: any) => s.status === 'pending')
      const stepIdx = justGenerated ? -1 : runningIdx >= 0 ? runningIdx : firstPendingIdx

      if (stepIdx >= 0) {
        const patchR = await fetch('/api/disposal', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: target.id, stepId: wf.steps[stepIdx].id, status: 'done', by: operatorName }),
        })
        const patchD = await patchR.json().catch(() => ({}))
        if (patchR.ok) {
          wf = patchD.workflow || wf
          setMsg({ ok: true, text: `已推进：${wf.steps[stepIdx].title}` })
        } else {
          setMsg({ ok: false, text: patchD.error || '推进失败' })
        }
      } else if (wf?.steps?.every((s: any) => s.status === 'done' || s.status === 'skipped')) {
        // 全部完成则结案
        const closeR = await fetch('/api/disposal', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: target.id, advance: true, by: operatorName }),
        })
        const closeD = await closeR.json().catch(() => ({}))
        if (closeR.ok) {
          wf = closeD.workflow || wf
          setMsg({ ok: true, text: '处置流程已闭环结案' })
        } else {
          setMsg({ ok: false, text: closeD.error || '结案失败' })
        }
      }

      setWorkflow(wf)
      setTimelineRefreshKey((k) => k + 1)
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '推进失败' })
    } finally {
      setBusy(null)
    }
  }

  const pendingConfirm = (target as any)?.pendingConfirm === true
  const isSimulated = (target as any)?.simulated === true
  const latestDispatch = records.length ? records[0] : null
  const sentCount = records.filter((r) => r.status === 'sent').length
  const failedCount = records.filter((r) => r.status === 'failed').length
  const skippedCount = records.filter((r) => r.status === 'skipped').length
  const totalChannels = 6

  // 演示推理处警流程：严格按「警情 → 人工确认 → 终端送达 → 处置完成」推进（0~4）
  // 无警情时全部待处理；有警情后仅「警情来源」完成；必须人工确认并生成分发记录后，
  // 「分发中间件」才完成；终端有真实送达记录后「终端分发」才完成；处置工单全部步骤
  // 执行完毕后「处置闭环」才完成。绝不预绿、绝不伪造进度。
  let stageReached = 0
  const confirmed = target && !pendingConfirm
  if (target) stageReached = 1
  if (confirmed && (latestDispatch || records.length > 0)) stageReached = Math.max(stageReached, 2)
  if (confirmed && sentCount > 0) stageReached = Math.max(stageReached, 3)
  if (confirmed && workflow && workflow.steps.every((s) => s.status === 'done')) stageReached = Math.max(stageReached, 4)
  // 动画期间使用动画阶段（覆盖真实阶段，实现逐个点亮效果）
  const displayStage = animating || animComplete ? Math.max(animStage, stageReached) : stageReached

  // 标准化警情卡片字段（与后端 buildAlertCard 同构，即真正下发给设备的载荷）
  const alertCard = target
    ? [
        { label: '事件类型', value: 'ELEPHANT_ALERT · 亚洲象警情' },
        { label: '预警级别', value: `${lv.label} · 风险指数 ${target.intrusionRisk ?? '—'}` },
        { label: '象群规模', value: `${target.detectedCount ?? '—'} 头` },
        { label: '预测窗口', value: target.predictionWindow || '—' },
        { label: '位置', value: [target.province, target.city, target.county, target.township].filter(Boolean).join('/') || (target.lat != null ? `坐标 ${target.lat.toFixed(4)}, ${target.lng?.toFixed(4)}` : '—') },
        { label: '处置预案', value: target.dispatchPlan?.length ? target.dispatchPlan.join('；') : '—' },
      ]
    : []

  return (
    <section ref={panelRef} className="dv-panel p-5">
      {/* 标题 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Network size={20} className="text-amber-300" />
        <h2 className="dv-title text-lg font-semibold text-slate-100">警情分发流程 · 跨部门警情联动</h2>
        {target && !pendingConfirm && !isArchived && (
          <div className="ml-auto flex items-center gap-2">
            {(animComplete || animating) && (
              <button
                onClick={replayAnimation}
                disabled={animating}
                className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <PlayCircle size={13} />
                {animating ? '播放中…' : '重新播放动画'}
              </button>
            )}
            <button
              onClick={runDispatch}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {busy === 'dispatch' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {latestDispatch ? '重新分发' : '立即分发'}
            </button>
          </div>
        )}
      </div>

      {/* 横向流程条：演示推理处警流程可视化（流动进度 + 节点动画） */}
      <div className="relative mb-4 grid grid-cols-4 gap-2">
        {/* 进度连接线（随阶段流动） */}
        <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[30px] h-[3px] -translate-y-1/2 rounded-full bg-slate-700/60" />
        <div
          className="dv-flow-line pointer-events-none absolute left-[12.5%] top-[30px] h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-400 transition-all duration-700"
          style={{ width: `${Math.max(0, ((displayStage - 1) / 3) * 75)}%` }}
        />
        {[
          { n: 1, t: '警情来源', icon: MapPin },
          { n: 2, t: '分发中间件', icon: Network },
          { n: 3, t: '终端分发', icon: Users },
          { n: 4, t: '处置闭环', icon: CheckCircle2 },
        ].map((s) => {
          const Icon = s.icon
          const reached = displayStage >= s.n
          const current = displayStage === s.n
          const done = displayStage > s.n
          return (
            <div
              key={s.n}
              className={`relative z-10 flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition ${
                done
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : current
                  ? 'border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/40'
                  : 'border-slate-700/50 bg-slate-800/30'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${
                  done ? 'bg-emerald-500 text-white' : current ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-400'
                }`}
                style={current ? { animation: 'node-pop .4s ease' } : undefined}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={17} />}
              </span>
              <span className={`text-[12px] font-semibold ${reached ? 'text-slate-100' : 'text-slate-500'}`}>{s.t}</span>
              <span className="text-[10px] text-slate-500">{current ? '进行中' : done ? '已完成' : '待处理'}</span>
            </div>
          )
        })}
      </div>

      {msg && (
        <p className={`mb-3 rounded-lg border px-3 py-2 text-[11.5px] ${msg.ok ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/40 bg-rose-500/10 text-rose-200'}`}>
          {msg.text}
        </p>
      )}

      {/* ══ ① 警情来源 · 标准化事件 ══ */}
      <div className="mb-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-[11px] font-bold text-slate-950">1</span>
          <span className="text-xs font-semibold text-slate-200">警情来源 · 标准化事件</span>
          {isSimulated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-sky-400/30">
              <FlaskConical size={10} /> 模拟画面来源
            </span>
          )}
          {pendingConfirm && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldAlert size={10} /> AI 研判待人工确认
            </span>
          )}
        </div>
        {alertCard.length === 0 ? (
          <p className="text-[11px] leading-5 text-slate-500">暂无活动警情</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {alertCard.map((f, i) => (
              <div key={f.label} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-2.5 py-1.5 text-[12px]">
                <span className="shrink-0 text-slate-500">{f.label}</span>
                <span className="truncate text-right font-medium text-slate-200">
                  <Typewriter text={f.value} delay={i * 240} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ ② 智能分发中间件 ══ */}
      <div className="mb-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-[11px] font-bold text-slate-950">2</span>
          <span className="text-xs font-semibold text-slate-200">智能分发中间件（安全边界网关 · 隔离网闸安全导入）</span>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {([
            { key: 'src', icon: MapPin, label: target ? '边缘端/云中心预警信息' : '预警信息（待生成）', dot: lv.bg },
            { key: 'mw', icon: Network, label: '智能分发中间件', dot: null },
            { key: 'gw', icon: ShieldCheck, label: '隔离网闸安全导入', dot: null },
            { key: 'term', icon: MapPin, label: '使用终端 · 警情卡片', dot: 'bg-cyan-300' },
          ] as const).map((box, i) => {
            // 中间件四框按实际进度逐格点亮：预警信息(≥1) → 中间件(≥2) → 隔离网闸(≥3) → 使用终端(≥3)，全部闭环后转绿
            const th = [1, 2, 3, 3][i]
            const st = stageReached >= 4 ? 'done' : stageReached >= th ? 'active' : 'idle'
            const cls =
              st === 'idle'
                ? 'border-slate-700/60 bg-slate-900/40 text-slate-400'
                : st === 'active'
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                  : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
            return (
              <div key={box.key} className="flex items-center gap-2">
                <div className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-medium transition ${cls}`}>
                  {box.dot ? <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${box.dot}`} /> : <box.icon size={13} className={st === 'active' ? 'animate-pulse' : ''} />}
                  {box.label}
                </div>
                {i < 3 && <ArrowRight size={14} className="mx-auto hidden shrink-0 text-slate-600 sm:block" />}
              </div>
            )
          })}
        </div>
        {latestDispatch ? (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2 text-[11px] leading-5 text-slate-400">
            <Send size={12} className="mt-0.5 shrink-0 text-amber-300" />
            最近分发 <span className="font-mono text-slate-300">{latestDispatch.dispatchId}</span> · {new Date(latestDispatch.ts).toLocaleString('zh-CN')} · 级别 {lv.label} · 标准卡片含 {sentCount > 0 ? `${sentCount} 个通道已送达` : '待分发'}
          </p>
        ) : (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2 text-[11px] leading-5 text-slate-500">
            <AlertOctagon size={12} className="mt-0.5 shrink-0 text-amber-400/70" />
            {pendingConfirm ? '等待人工确认分发' : '尚未分发'}
          </p>
        )}
      </div>

      {/* ══ ③ 终端分发结果 ══ */}
      <div className="mb-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-[11px] font-bold text-slate-950">3</span>
          <span className="text-xs font-semibold text-slate-200">终端分发结果</span>
          <span className="ml-auto text-[11px] text-slate-400">
            已送达 {animating ? animTerminals.size : sentCount}/{totalChannels} · 失败 {failedCount} · 未启用/未达级别 {skippedCount}
          </span>
        </div>
        {/* 送达进度条 */}
        <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${((animating ? animTerminals.size : sentCount) / totalChannels) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(TERMINAL_ICONS).map(([name, meta]) => {
            const rec = records.find((r) => r.target === name)
            const Icon = meta.icon
            const realSent = rec?.status === 'sent'
            // 动画期间：已点亮的终端显示已送达（即使真实数据还没到）
            const sent = realSent || (animating && animTerminals.has(name))
            const failed = rec?.status === 'failed'
            return (
              <div
                key={name}
                title={failed ? `${rec?.error || '发送失败'}（HTTP ${rec?.statusCode ?? '—'}）` : sent ? `已送达 ${rec ? new Date(rec.ts).toLocaleString('zh-CN') : '（动画演示）'}` : meta.via}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                  sent ? 'border-emerald-400/40 bg-emerald-500/10 receipt-in' : failed ? 'border-rose-400/50 bg-rose-500/10' : 'border-slate-800/70 bg-slate-900/40'
                } ${pulseIds.has(name) ? 'receipt-pulse' : ''}`}
              >
                <Icon size={14} className={`shrink-0 ${sent ? 'text-emerald-300' : failed ? 'text-rose-300' : 'text-cyan-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-200">
                    {name}
                    {sent && <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />}
                    {failed && <XCircle size={11} className="shrink-0 text-rose-400" />}
                  </div>
                  <div className="truncate text-[9.5px] text-slate-500">
                    {rec
                      ? rec.status === 'sent'
                        ? `已送达 ${new Date(rec.ts).toLocaleTimeString('zh-CN', { hour12: false })}`
                        : rec.status === 'failed'
                          ? `失败${rec.statusCode ? ` HTTP ${rec.statusCode}` : ''}`
                          : '未启用/未达级别'
                      : animating && animTerminals.has(name)
                        ? '已送达（动画演示）'
                        : animating
                          ? '发送中…'
                          : '待分发'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-4 text-slate-500">
          外设通道未配置时如实显示「未启用」，不假装已送达。
        </p>
      </div>

      {/* ══ ④ 处置闭环 · 确认与评估 ══ */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
        <div
          className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 transition hover:bg-slate-700/30"
          onClick={() => target && router.push(`/alert/${target.id}`)}
          title="点击查看警情详情"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-[11px] font-bold text-slate-950">4</span>
          <span className="text-xs font-semibold text-slate-200">处置闭环 · 人工确认与评估</span>
          <span className="text-[10px] text-cyan-300/70">点击展开详情 →</span>
          {isArchived && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
              <CheckCircle2 size={10} /> 已归档
            </span>
          )}
        </div>

        {/* AI 研判后人工确认入口（confirm 模式） */}
        {pendingConfirm && target && !isArchived && (
          <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5">
            <span className="text-[12px] font-medium text-emerald-200">AI 研判已完成，等待人工确认后才分发到设备</span>
            <button
              onClick={confirmAndDispatch}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'confirm' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              人工确认并分发
            </button>
            <span className="text-[10.5px] text-emerald-200/70">确认人：{operatorName}</span>
          </div>
        )}

        {/* 处置工单进度 + 推进（点击即生成 / 推进 AI 处置流程） */}
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {workflow ? (
            <span className="text-[11px] text-slate-400">处置工单：{workflow.steps.filter((s) => s.status === 'done').length}/{workflow.steps.length} 步完成</span>
          ) : (
            <span className="text-[11px] text-slate-500">处置工单尚未生成</span>
          )}

        </div>

        {/* 处置流程汇总框（点击展开详情弹窗，不在列表层面展开子任务） */}
        {target && (
          <div
            className="mb-3 cursor-pointer rounded-lg border border-slate-700/50 bg-slate-900/30 p-3 transition hover:border-cyan-400/40 hover:bg-slate-800/40"
            onClick={() => target && router.push(`/alert/${target.id}`)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-cyan-300" />
                <span className="text-[13px] font-semibold text-slate-100">处置流程 · 人工确认与评估</span>
              </div>
              {workflow ? (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700/50">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${(workflow.steps.filter(s => s.status === 'done' || s.status === 'skipped').length / Math.max(1, workflow.steps.length)) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">{workflow.steps.filter(s => s.status === 'done' || s.status === 'skipped').length}/{workflow.steps.length} 步</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                    workflow.steps.every(s => s.status === 'done' || s.status === 'skipped')
                      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
                      : workflow.steps.some(s => s.status === 'executing')
                      ? 'bg-amber-500/15 text-amber-200 ring-amber-400/30'
                      : 'bg-slate-600/30 text-slate-300 ring-slate-500/30'
                  }`}>
                    {workflow.steps.every(s => s.status === 'done' || s.status === 'skipped') ? '已完成' : workflow.steps.some(s => s.status === 'executing') ? '进行中' : '待执行'}
                  </span>
                </div>
              ) : (
                <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-500/30">尚未生成</span>
              )}
              <span className="text-[10px] text-cyan-300/70">点击查看详情 →</span>
            </div>
          </div>
        )}

        {/* 评估指标 */}
        {metrics?.alerts && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">警情总数</div>
              <div className="text-base font-black text-slate-100"><CountUp value={metrics.alerts.total ?? 0} /></div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">红橙占比</div>
              <div className="text-base font-black text-rose-300"><CountUp value={metrics.alerts.redOrangeRatio ?? 0} suffix="%" /></div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">处置闭环率</div>
              <div className="text-base font-black text-emerald-300"><CountUp value={metrics.alerts.closedRatio ?? 0} suffix="%" /></div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">平均响应</div>
              <div className="text-base font-black text-amber-300"><CountUp value={metrics.alerts.avgResponseMin ?? 0} suffix=" 分钟" /></div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">分发通道</div>
              <div className="text-base font-black text-cyan-300"><CountUp value={metrics.dispatch?.sent ?? 0} suffix=" 条" /></div>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">模型 mAP50</div>
              <div className="text-base font-black text-violet-300">{metrics.model?.mAP50 != null ? metrics.model.mAP50.toFixed(3) : '—'}</div>
            </div>
          </div>
        )}
        {!metrics && <p className="text-[11px] text-slate-500">评估指标计算中…</p>}
      </div>

        </section>
  )
}

/**
 * 打字机效果：模拟「根据现场状况自动输入填写」的字段填入（带光标闪烁）。
 * text 变化或 delay 变化时重新逐字打出；props 稳定时保持静态不重播，避免随轮询闪烁。
 */
function Typewriter({ text, delay = 0, speed = 16, className }: { text: string; delay?: number; speed?: number; className?: string }) {
  const [val, setVal] = useState(text)
  useEffect(() => {
    let cancelled = false
    setVal('')
    const t = setTimeout(() => {
      if (cancelled) return
      let i = 0
      const id = setInterval(() => {
        if (cancelled) return
        i += 1
        setVal(text.slice(0, i))
        if (i >= text.length) clearInterval(id)
      }, speed)
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [text, delay, speed])
  return (
    <span className={className}>
      {val}
      <span className="ml-px inline-block w-[1px] animate-pulse bg-current align-middle" style={{ height: '0.95em' }} />
    </span>
  )
}

/** 数字滚动动画：挂载/值变化时从 0 缓动到目标值（cubic ease-out），强化大屏“数据活起来”观感 */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const v = useCountUp(value)
  return <>{Number.isFinite(v) ? v.toFixed(decimals) : '0'}{suffix}</>
}
