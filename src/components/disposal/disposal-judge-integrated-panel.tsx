'use client'

/**
 * 研判审判 · 警情分发 联动一体化（紧凑版）
 * ───────────────────────────────────────────────────────────
 * 将「研判审判（实时监测 + 5步研判链路）」与「警情分发流程（4步分发链路）」
 * 合并为一个紧凑面板：
 *   - 顶部一行操作：开启/关闭研判审判、推演开关、手动添加警情；
 *   - 研判链路 5 步：来源 → 检测 → 证据研判 → 警情 → 处置（实时状态驱动动画）；
 *   - 分发链路 4 步：警情来源 → 分发中间件 → 终端分发 → 处置闭环（分发记录驱动动画）；
 *   - 底部紧凑警情分发历史。
 * 整体缩小、简洁、有动画，直观体现「研判 → 分发 → 处置」完整闭环。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Workflow, Plus, BrainCircuit, Zap, Radio, Loader2, CirclePlay, CircleStop,
  CheckCircle2, History, RefreshCw, ShieldAlert, FlaskConical, MapPin, Network,
  Users, Send, FileWarning, ScanSearch, Cctv, Clock,
} from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import CommonPagination from '@/components/common/common-pagination'

interface Props {
  tasks: TrainingTask[]
  /** 打开手动添加警情 */
  onManualOpen: () => void
  /** 查看警情详情 */
  onViewTask: (task: TrainingTask) => void
  /** 当前操作人（分发确认 / 推进处置留痕） */
  currentName?: string
  /** 当前登录角色，用于控制处置流程按钮可见性 */
  currentRole?: string
  /** 待研判警情数量（实时状态展示） */
  pendingCount?: number
  /** 停止推演演示时清理模拟警情 */
  onClearSimulated?: () => void
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

const JUDGE_STEPS = [
  { n: 1, t: '来源', icon: Cctv },
  { n: 2, t: '检测', icon: ScanSearch },
  { n: 3, t: '证据研判', icon: BrainCircuit },
  { n: 4, t: '警情', icon: FileWarning },
  { n: 5, t: '处置', icon: Send },
]

const DISPATCH_STEPS = [
  { n: 1, t: '警情来源', icon: MapPin },
  { n: 2, t: '分发中间件', icon: Network },
  { n: 3, t: '终端分发', icon: Users },
  { n: 4, t: '处置闭环', icon: CheckCircle2 },
]

export default function JudgeIntegratedPanel({
  tasks,
  onManualOpen,
  currentName,
  currentRole,
  pendingCount = 0,
  onClearSimulated,
}: Props) {
  // ── 研判审判状态 ─────────────────────────────
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [det, setDet] = useState<LiveDetection | null>(null)

  // ── 最新警情 + 分发记录 ──────────────────────
  const latest = useMemo(() => {
    const arr = [...tasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return arr[0] || null
  }, [tasks])
  const [records, setRecords] = useState<any[]>([])

  // ── 动画阶段 ────────────────────────────────
  const [animJudge, setAnimJudge] = useState(0)
  const [animDispatch, setAnimDispatch] = useState(0)
  const animRef = useRef<Set<number>>(new Set())

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/realtime-judge-settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/live-detection', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, d]) => {
      const settings = (s && typeof s.enabled === 'boolean' ? s : s?.settings)
      if (settings) setEnabled(settings.enabled !== false)
      if (d) setDet(d as LiveDetection)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  // 加载最新警情分发记录
  useEffect(() => {
    if (!latest) { setRecords([]); return }
    fetch(`/api/dispatch?taskId=${encodeURIComponent(latest.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.records)) setRecords(d.records) })
      .catch(() => {})
  }, [latest?.id])

  const connected = det?.mode === 'demo'
  const detCount = det?.detected_count ?? det?.count ?? 0
  const detConf = det?.max_confidence ?? det?.confidence ?? 0

  // 研判阶段推导（0-5）
  const judgeStage = enabled
    ? connected
      ? detCount > 0
        ? 4 // 已检出 → 证据研判/警情
        : 3 // 已接入 → 检测
      : 1 // 未接入 → 来源
    : 0

  // 分发阶段推导（0-4）
  const sentCount = records.filter((r: any) => r.status === 'sent').length
  const dispatchStage = latest
    ? records.length
      ? sentCount > 0
        ? 3
        : 2
      : 1
    : 0

  // 动画逐段推进
  useEffect(() => {
    if (animJudge < judgeStage) {
      const t = setTimeout(() => setAnimJudge((v) => Math.min(v + 1, judgeStage)), 450)
      return () => clearTimeout(t)
    }
  }, [animJudge, judgeStage])

  useEffect(() => {
    if (animDispatch < dispatchStage) {
      const t = setTimeout(() => setAnimDispatch((v) => Math.min(v + 1, dispatchStage)), 550)
      return () => clearTimeout(t)
    }
  }, [animDispatch, dispatchStage])

  // ── 操作 ─────────────────────────────────────
  const toggleEnabled = () => {
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    fetch('/api/realtime-judge-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next, mode: next ? 'ai-llm-client' : 'off' }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const s = (d && typeof d.enabled === 'boolean' ? d : d?.settings)
      if (s) setEnabled(s.enabled !== false)
    }).catch(() => {}).finally(() => setBusy(false))
  }

  const setDemo = (next: 'off' | 'demo') => {
    setBusy(true)
    fetch('/api/live-detection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.mode) {
        setDet(d as LiveDetection)
        if (next === 'off' && onClearSimulated) onClearSimulated()
      }
    }).catch(() => {}).finally(() => setBusy(false))
  }

  // ── 渲染 ─────────────────────────────────────
  return (
    <section className="dv-panel space-y-3 p-4">
      {/* 标题行 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/40 pb-2.5">
        <Workflow size={16} className="text-violet-300" />
        <h2 className="dv-title text-sm font-bold text-slate-100">研判审判 · 警情分发 联动一体化</h2>
        {enabled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
            <Radio size={9} className="animate-pulse" /> 实时监测中
          </span>
        )}
      </div>


      {/* 研判链路 5 步 */}
      <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.04] p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-violet-300">
          <BrainCircuit size={11} /> 研判链路
          <span className="ml-auto font-normal normal-case text-slate-500">
            {!enabled ? '未开启' : connected ? (detCount > 0 ? `检出 ${detCount} 头 · 置信 ${((detConf * 100) | 0)}%` : '检测运行中') : '等待视频源'}
          </span>
        </div>
        <div className="relative flex items-center gap-1">
          <div className="pointer-events-none absolute left-[6%] right-[6%] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-slate-700/50" />
          <div
            className="pointer-events-none absolute left-[6%] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-400 via-cyan-300 to-emerald-400 transition-all duration-700"
            style={{ width: `${Math.max(0, ((animJudge - 1) / 4) * 88)}%` }}
          />
          {JUDGE_STEPS.map((st) => {
            const Icon = st.icon
            const done = animJudge > st.n
            const current = animJudge === st.n
            return (
              <div key={st.n} className="relative z-10 flex flex-1 flex-col items-center gap-0.5">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition ${
                  done ? 'bg-emerald-500 text-white' : current ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                }`}>
                  {done ? <CheckCircle2 size={12} /> : <Icon size={11} />}
                </span>
                <span className={`text-[9.5px] font-medium ${current ? 'text-slate-100' : done ? 'text-slate-300' : 'text-slate-500'}`}>{st.t}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 分发链路 4 步 */}
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-cyan-300">
          <Network size={11} /> 警情分发流程 · 跨部门联动
          <span className="ml-auto font-normal normal-case text-slate-500">
            {!latest ? '暂无警情' : sentCount > 0 ? `${sentCount} 个终端已送达` : records.length ? '分发处理中' : '待分发'}
          </span>
        </div>
        <div className="relative flex items-center gap-1">
          <div className="pointer-events-none absolute left-[8%] right-[8%] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-slate-700/50" />
          <div
            className="pointer-events-none absolute left-[8%] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400 transition-all duration-700"
            style={{ width: `${Math.max(0, ((animDispatch - 1) / 3) * 84)}%` }}
          />
          {DISPATCH_STEPS.map((st) => {
            const Icon = st.icon
            const done = animDispatch > st.n
            const current = animDispatch === st.n
            return (
              <div key={st.n} className="relative z-10 flex flex-1 flex-col items-center gap-0.5">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition ${
                  done ? 'bg-emerald-500 text-white' : current ? 'bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-800 text-slate-500 ring-1 ring-slate-700'
                }`}>
                  {done ? <CheckCircle2 size={12} /> : <Icon size={11} />}
                </span>
                <span className={`text-[9.5px] font-medium ${current ? 'text-slate-100' : done ? 'text-slate-300' : 'text-slate-500'}`}>{st.t}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 紧凑警情分发历史 */}
      <CompactHistory tasks={tasks} />
    </section>
  )
}

/** 紧凑警情分发历史：分页列表 */
function CompactHistory({ tasks }: { tasks: TrainingTask[] }) {
  const router = useRouter()
  const active = useMemo(() => tasks.filter((t) => t.status !== 'COMPLETED' && !t.aggregatedAt && !t.closedAt), [tasks])
  const history = useMemo(() => tasks.filter((t) => t.status === 'COMPLETED' || t.aggregatedAt || t.closedAt), [tasks])
  const sortedTasks = useMemo(() => {
    // 未完成在前，已完成在后；两组内部均按创建时间倒序
    const unfinished = tasks.filter((t) => t.status !== 'COMPLETED' && !t.aggregatedAt && !t.closedAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const completed = tasks.filter((t) => t.status === 'COMPLETED' || t.aggregatedAt || t.closedAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return [...unfinished, ...completed]
  }, [tasks])

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900/30 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
          <History size={12} className="text-slate-400" /> 警情分发历史
        </span>
        <span className="text-[10px] text-slate-500">活动 {active.length} · 已闭环 {history.length} · 总计 {tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-slate-500">暂无警情分发记录</p>
      ) : (
        <CommonPagination
          items={sortedTasks}
          searchKeys={['name', 'id', 'deviceName', 'warningLevel', 'location']}
          pageSize={10}
          searchPlaceholder="搜索警情名称/ID/设备/等级..."
          emptyText="暂无匹配的警情"
          compact
        >
          {(pageTasks) => (
            <div className="space-y-1">
              {pageTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => router.push(`/alert/${task.id}`)}
                  className="group cursor-pointer rounded-md border border-slate-700/40 bg-slate-800/20 px-3 py-2.5 transition hover:border-cyan-500/40 hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white ${levelStyle[task.warningLevel].bg}`}>
                      {task.warningLevel?.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-200">{task.name}</span>
                    {(task.simulated === true || task.triggeredBy === 'realtime-demo') && (
                      <FlaskConical size={9} className="shrink-0 text-amber-400/70" />
                    )}
                    <span className={`shrink-0 text-[9.5px] ${task.status === 'COMPLETED' || task.aggregatedAt ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {task.status === 'COMPLETED' || task.aggregatedAt ? '已闭环' : '处置中'}
                    </span>
                    <span className="shrink-0 text-[9px] text-slate-600 opacity-0 transition group-hover:opacity-100">→</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[9.5px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock size={9} />{task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    {task.deviceName && <span className="inline-flex items-center gap-1"><Cctv size={9} />{task.deviceName}</span>}
                    {task.detectedCount && <span className="inline-flex items-center gap-1"><Users size={9} />{task.detectedCount}头</span>}
                    {task.completedAt && <span className="ml-auto inline-flex items-center gap-1 text-emerald-400/70">闭环 {new Date(task.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CommonPagination>
      )}
    </div>
  )
}
