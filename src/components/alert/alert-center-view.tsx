'use client'

/**
 * 警情中心（事件级，与态势/研判页共用同一份 tasks 真相源，计数与列表完全一致）
 * ───────────────────────────────────────────────────────────────────────────
 *  - 统计卡：警情总数 / 红橙重点 / 正在处置 / 已闭环；
 *  - 实时警情动态（最新更新在前）；
 *  - 复盘分析：四级占比 / 类型占比 / 处置状态分类；
 *  - 全部警情流程（事件级卡片，与研判页「警情分发历史」同源同步，不重复）。
 *
 * 注：原 useAlerts(alert-messages) 子系统在纯前端 mock 下无后端支撑（GET 返回形状不符、
 *     写入无 handler），会导致警情中心恒空、与研判页列表“不同步”。本组件改为直接消费
 *     page.tsx 统一的 tasks（来自 /api/tasks），彻底消除双源不一致。
 */

import { useMemo, useState } from 'react'
import {
  Trash2, Eye, Inbox, AlertTriangle, Loader2, CheckCircle2,
  BarChart3, Activity, ShieldCheck, ClipboardList, XCircle, Search,
} from 'lucide-react'
import { alertEmoji } from '@/lib/utils/util-alert-level-icons'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import CommonPagination from '@/components/common/common-pagination'

const LEVEL_DOT: Record<string, string> = {
  RED: 'bg-red-500',
  ORANGE: 'bg-orange-500',
  YELLOW: 'bg-yellow-400',
  BLUE: 'bg-cyan-400',
}
const LEVEL_LABEL: Record<string, string> = {
  RED: '红色预警',
  ORANGE: '橙色预警',
  YELLOW: '黄色预警',
  BLUE: '蓝色预警',
}
const LEVEL_BAR: Record<string, string> = {
  RED: 'bg-red-500',
  ORANGE: 'bg-orange-500',
  YELLOW: 'bg-amber-400',
  BLUE: 'bg-cyan-400',
}


/** 将 ISO 时间字符串格式化为 "YYYY-MM-DD HH:mm:ss" */
function formatTimestamp(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch { return '' }
}

/** 处置阶段（由真实状态推导） */
function stageOf(a: TrainingTask): { label: string; cls: string } {
  if (a.status === 'COMPLETED' || a.aggregatedAt) return { label: '已闭环', cls: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/30' }
  return { label: '正在处置', cls: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30' }
}

/** 警情类型（无 alertType 时按来源归类） */
function typeOf(a: TrainingTask): string {
  if (a.alertType) return a.alertType
  if (a.manual) return '人工上报'
  return '实时检测'
}

function locationOf(a: TrainingTask): string {
  const parts = [a.province, a.city, a.county, a.township].filter(Boolean)
  const text = parts.join(' / ')
  if (a.lat != null && a.lng != null) return text ? `${text} · ${a.lat}, ${a.lng}` : `${a.lat}, ${a.lng}`
  return text
}

export default function AlertCenterView({
  tasks,
  currentName = 'admin',
  onViewTask,
  onDeleteTask,
}: {
  tasks: TrainingTask[]
  currentName?: string
  onViewTask?: (t: TrainingTask) => void
  onDeleteTask?: (id: string) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const total = tasks.length
  const redCount = tasks.filter((a) => a.warningLevel === 'RED' || a.warningLevel === 'ORANGE').length
  const activeCount = tasks.filter((a) => a.status !== 'COMPLETED' && !a.aggregatedAt).length
  const closedCount = total - activeCount

  // 复盘分析
  const stats = useMemo(() => {
    const byLevel: Record<string, number> = { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }
    const byType: Record<string, number> = {}
    for (const a of tasks) {
      byLevel[a.warningLevel] = (byLevel[a.warningLevel] || 0) + 1
      const t = typeOf(a)
      byType[t] = (byType[t] || 0) + 1
    }
    return { byLevel, byType }
  }, [tasks])

  // 实时动态：最新更新在前
  const dynamics = useMemo(() => {
    return [...tasks]
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
      .slice(0, 8)
  }, [tasks])

  // 搜索过滤：按编号 / 标题 / 地点匹配，并按创建时间倒序
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let result = tasks
    if (q) {
      result = tasks.filter((a) => {
        if (a.id.toLowerCase().includes(q)) return true
        if (a.name.toLowerCase().includes(q)) return true
        const loc = locationOf(a).toLowerCase()
        if (loc && loc.includes(q)) return true
        if (a.alertType && a.alertType.toLowerCase().includes(q)) return true
        return false
      })
    }
    const unfinished = result.filter((a) => a.status !== 'COMPLETED' && !a.aggregatedAt && !a.closedAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const completed = result.filter((a) => a.status === 'COMPLETED' || a.aggregatedAt || a.closedAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return [...unfinished, ...completed]
  }, [tasks, searchQuery])

  const handleDelete = async (id: string) => {
    if (!onDeleteTask || deleting) return
    setDeleting(id)
    try { await onDeleteTask(id) } finally { setDeleting(null) }
  }

  return (
    <div className="space-y-4">
      {/* ══ 顶部搜索栏 ══ */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索警情编号、标题、地点..."
          className="w-full rounded-lg border border-slate-700/60 bg-slate-800/50 py-2.5 pl-11 pr-4 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-blue-400/60 focus:bg-slate-800/70 focus:ring-2 focus:ring-blue-500/15"
        />
        {searchQuery && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">
            {filteredTasks.length} 条结果
          </span>
        )}
      </div>

      {/* ══ 统计卡 ══ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="dv-panel flex items-center gap-3 px-4 py-3">
          <Inbox size={18} className="text-cyan-300" />
          <div>
            <div className="text-xs text-slate-400">警情总数</div>
            <div className="text-xl font-bold text-white">{total}</div>
          </div>
        </div>
        <div className="dv-panel flex items-center gap-3 px-4 py-3">
          <AlertTriangle size={18} className="text-rose-300" />
          <div>
            <div className="text-xs text-slate-400">红/橙重点</div>
            <div className="text-xl font-bold text-white">{redCount}</div>
          </div>
        </div>
        <div className="dv-panel flex items-center gap-3 px-4 py-3">
          <ShieldCheck size={18} className="text-amber-300" />
          <div>
            <div className="text-xs text-slate-400">正在处置</div>
            <div className="text-xl font-bold text-white">{activeCount}</div>
          </div>
        </div>
        <div className="dv-panel flex items-center gap-3 px-4 py-3">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <div>
            <div className="text-xs text-slate-400">已闭环</div>
            <div className="text-xl font-bold text-white">{closedCount}</div>
          </div>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setConfirmClear(true)}
            disabled={!total}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-40"
          >
            <Trash2 size={14} /> 清空全部
          </button>
        </div>
      </div>

      {/* ══ 实时警情动态 ══ */}
      {dynamics.length > 0 && (
        <section className="dv-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <Activity size={15} className="text-cyan-300" />
            <h3 className="text-sm font-semibold text-slate-100">实时警情动态</h3>
            <span className="ml-auto text-[10.5px] text-slate-500">按最近更新排序</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {dynamics.map((a) => {
              const st = stageOf(a)
              return (
                <button
                  key={a.id}
                  onClick={() => onViewTask?.(a)}
                  className="flex items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900/30 px-2.5 py-1.5 text-left transition hover:bg-slate-800/50"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[a.warningLevel] || 'bg-slate-500'}`} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-300">{a.name}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium ${st.cls}`}>{st.label}</span>
                  <span className="shrink-0 text-[9.5px] text-slate-500">
                    {formatTimestamp(a.updatedAt || a.createdAt)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ══ 复盘分析：占比与分类 ══ */}
      <section className="dv-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 size={15} className="text-violet-300" />
          <h3 className="text-sm font-semibold text-slate-100">复盘分析</h3>
          <span className="ml-auto text-[10.5px] text-slate-500">全量警情占比与分类</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {/* 级别占比 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
            <div className="mb-2 text-[11px] font-medium text-slate-400">预警级别占比</div>
            {(['RED', 'ORANGE', 'YELLOW', 'BLUE'] as const).map((lv) => {
              const n = stats.byLevel[lv] || 0
              const pct = total ? Math.round((n / total) * 100) : 0
              return (
                <div key={lv} className="mb-1.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-300">{LEVEL_LABEL[lv]} · {n}</span>
                    <span className="text-slate-500">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
                    <div className={`h-full rounded-full ${LEVEL_BAR[lv]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          {/* 类型占比 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
            <div className="mb-2 text-[11px] font-medium text-slate-400">警情类型占比</div>
            {Object.entries(stats.byType).length === 0 ? (
              <p className="text-[11px] text-slate-500">暂无数据</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => {
                  const pct = total ? Math.round((n / total) * 100) : 0
                  return (
                    <div key={t} className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/40 px-2 py-1 text-[11px]">
                      <span className="truncate text-slate-200">{alertEmoji(t)} {t}</span>
                      <span className="ml-2 shrink-0 text-slate-500">{n} · {pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* 处置状态分类 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
            <div className="mb-2 text-[11px] font-medium text-slate-400">处置状态分类</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px]">
                <span className="text-amber-200">正在处置</span>
                <span className="font-bold text-amber-200">{activeCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-[11px]">
                <span className="text-emerald-200">已闭环</span>
                <span className="font-bold text-emerald-200">{closedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 全部警情流程（事件级卡片，与研判页「警情分发历史」同源同步）══ */}
      <section className="dv-panel p-0">
        <div className="flex items-center gap-2 border-b border-slate-800/60 px-4 py-3">
          <ClipboardList size={15} className="text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100">全部警情流程（{searchQuery ? filteredTasks.length : total}）</h3>
          <span className="ml-auto text-[10.5px] text-slate-500">与研判页同源，单一真相源</span>
        </div>
        <CommonPagination
          items={filteredTasks}
          searchKeys={['id', 'name', 'alertType', 'township', 'county']}
          showSearch={false}
          pageSize={10}
          emptyText={searchQuery ? `未找到与「${searchQuery}」匹配的警情` : '暂无警情。真实检测事件或手动上报警情后，会按预警级别自动生成事件级警情。'}
        >
          {(pageItems) => (
            <ul className="divide-y divide-slate-800/60">
              {pageItems.map((a) => {
                const st = stageOf(a)
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3 transition hover:bg-white/[0.02]">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[a.warningLevel] || 'bg-slate-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base">{alertEmoji(a.alertType)}</span>
                        <span className="text-sm font-semibold text-slate-100">{a.name}</span>
                        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{LEVEL_LABEL[a.warningLevel] || a.warningLevel}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                        {a.manual && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200">人工上报</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{a.aiSummary}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                        {a.intrusionRisk != null && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-300">风险 {a.intrusionRisk}</span>}
                        {locationOf(a) && <span>{locationOf(a)}</span>}
                        <span>{formatTimestamp(a.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        onClick={() => onViewTask?.(a)}
                        className="inline-flex items-center justify-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-500/20"
                      >
                        <Eye size={11} /> 查看
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={deleting === a.id}
                        title="删除该警情（同步态势/研判页）"
                        className="inline-flex items-center justify-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        {deleting === a.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />} 删除
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CommonPagination>
      </section>

      {confirmClear && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmClear(false)}>
          <div className="w-full max-w-sm rounded-lg bg-slate-900 p-6 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 text-rose-400">
              <AlertTriangle size={20} />
              <h3 className="text-base font-semibold text-slate-100">清空全部警情</h3>
            </div>
            <p className="text-sm leading-6 text-slate-300">
              确定要删除全部 {total} 条警情吗？将同步清空态势中心与研判页记录。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                取消
              </button>
              <button
                onClick={() => { if (onDeleteTask) { tasks.forEach((t) => onDeleteTask!(t.id)) } setConfirmClear(false) }}
                className="rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
