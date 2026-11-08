'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Loader2, CheckCircle2, AlertTriangle, ChevronRight, UserCheck, Sparkles, RefreshCw } from 'lucide-react'
import { ROLES, type RoleId } from '@/lib/auth/auth-role-permissions'

const roleName = (r: string) => (ROLES[r as RoleId]?.name || r)

interface MyTaskStep {
  id: string
  title: string
  description?: string
  assignedRole: string
  status: string
  type?: string
  estimatedMinutes?: number
}

interface MyTaskGroup {
  taskId: string
  taskName: string
  warningLevel: string
  township?: string
  steps: MyTaskStep[]
}

interface Props {
  currentRole: string
  currentName: string
  onViewAll?: () => void
}

const LEVEL_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  RED:    { bg: 'bg-rose-500/15', text: 'text-rose-300', dot: 'bg-rose-400', label: '红色' },
  ORANGE: { bg: 'bg-orange-500/15', text: 'text-orange-300', dot: 'bg-orange-400', label: '橙色' },
  YELLOW: { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-400', label: '黄色' },
  BLUE:   { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-400', label: '蓝色' },
}

/** 带超时的 fetch（默认 10 秒） */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export default function MyTasksPanel({ currentRole, currentName, onViewAll }: Props) {
  const router = useRouter()
  const [groups, setGroups] = useState<MyTaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const loadTasks = useCallback(async () => {
    // 取消上一次未完成的请求
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      // 一次性批量获取全部处置工单（替代逐个请求，显著提升加载速度）
      const timer = setTimeout(() => controller.abort(), 10000)
      let res: Response
      try {
        res = await fetch('/api/disposal-workflows', { cache: 'no-store', signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        throw new Error(`服务器返回 ${res.status}`)
      }
      const data = await res.json()
      const wfs: any[] = Array.isArray(data) ? data : (data?.workflows ?? [])

      // 同时获取警情列表用于查找任务名称和等级
      const tasksRes = await fetchWithTimeout('/api/tasks', { cache: 'no-store' }, 8000)
      let tasks: any[] = []
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json()
        tasks = Array.isArray(tasksData) ? tasksData : (tasksData?.tasks ?? [])
      }
      const taskMap = new Map<string, any>()
      tasks.forEach((t: any) => taskMap.set(t.id, t))

      const groupMap = new Map<string, MyTaskGroup>()

      for (const wf of wfs) {
        // 已归档 → 跳过
        if (wf.advanced === true) continue
        // 对应警情必须存在且未结案
        const task = taskMap.get(wf.taskId)
        if (!task) continue
        if (task.status === 'COMPLETED') continue

        const mySteps = (wf.steps || []).filter((s: any) => {
          if (s.status === 'done' || s.status === 'skipped') return false
          if (s.confirmedBy) return false
          return s.assignedRole === currentRole || currentRole === 'admin'
        })

        if (mySteps.length > 0) {
          groupMap.set(wf.taskId, {
            taskId: wf.taskId,
            taskName: task.name || task.alertType || '未命名警情',
            warningLevel: task.warningLevel || 'YELLOW',
            township: task.township || '',
            steps: mySteps.map((s: any) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              assignedRole: s.assignedRole,
              status: s.status,
              type: s.type,
              estimatedMinutes: s.estimatedMinutes,
            })),
          })
        }
      }

      const validGroups = Array.from(groupMap.values())
      // 按预警等级排序（红→橙→黄→蓝）
      const levelOrder: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2, BLUE: 3 }
      validGroups.sort((a, b) => (levelOrder[a.warningLevel] ?? 9) - (levelOrder[b.warningLevel] ?? 9))

      setGroups(validGroups)
      setTotalCount(validGroups.reduce((sum, g) => sum + g.steps.length, 0))
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('加载超时，请重试')
      } else {
        setError(e?.message || '加载失败，请重试')
      }
      setGroups([])
      setTotalCount(0)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }, [currentRole])

  useEffect(() => {
    loadTasks()
    // 每 30 秒轻量刷新（不频繁）
    const timer = setInterval(loadTasks, 30000)
    return () => {
      clearInterval(timer)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [loadTasks])

  const goToTask = (taskId: string) => {
    router.push(`/alert/${taskId}`)
  }

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 via-slate-900/40 to-slate-900/30">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-violet-500/15 bg-violet-500/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_0_10px_rgba(139,92,246,0.4)]">
            <ClipboardList size={13} className="text-white" />
          </div>
          <span className="text-xs font-bold text-violet-200">我的任务</span>
        </div>
        {!loading && totalCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500/80 px-1.5 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.5)]">
              {totalCount}
            </span>
            {onViewAll && (
              <button
                onClick={(e) => { e.stopPropagation(); onViewAll() }}
                className="flex items-center gap-0.5 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-300 transition hover:bg-violet-500/25"
              >
                全部
                <ChevronRight size={9} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="max-h-[340px] overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <Loader2 size={18} className="animate-spin text-violet-400" />
            <span className="text-[10px] text-slate-500">加载我的任务…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            <span className="text-[10px] text-amber-300/80">{error}</span>
            <button
              onClick={loadTasks}
              className="flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-[9px] text-violet-300 transition hover:bg-violet-500/20"
            >
              <RefreshCw size={9} /> 重试
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <span className="text-[10px] text-slate-400">暂无待办任务</span>
            <span className="text-[9px] text-slate-600">所有处置步骤已完成</span>
          </div>
        ) : (
          groups.map((group) => {
            const lv = LEVEL_STYLE[group.warningLevel] || LEVEL_STYLE.YELLOW
            return (
              <div
                key={group.taskId}
                onClick={() => goToTask(group.taskId)}
                className="group cursor-pointer rounded-lg border border-slate-700/40 bg-slate-800/30 p-2 transition-all duration-200 hover:border-violet-400/40 hover:bg-slate-800/60 hover:shadow-[0_0_12px_rgba(139,92,246,0.15)]"
              >
                {/* 警情标题行 */}
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${lv.dot} shadow-[0_0_6px_currentColor]`} />
                    <span className="truncate text-[11px] font-semibold text-slate-200 group-hover:text-white">
                      {group.taskName}
                    </span>
                  </div>
                  <ChevronRight size={12} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-violet-400" />
                </div>
                {group.township && (
                  <div className="mb-1.5 text-[9px] text-slate-500 truncate">📍 {group.township}</div>
                )}
                {/* 步骤小格子 */}
                <div className="space-y-1">
                  {group.steps.slice(0, 4).map((step, idx) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-1.5 rounded-md border border-slate-700/30 bg-slate-900/40 px-1.5 py-1 transition group-hover:border-violet-500/20"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-500/20 text-[9px] font-bold text-violet-300">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300 group-hover:text-slate-100">
                        {step.title}
                      </span>
                      <span className="shrink-0 rounded bg-slate-700/40 px-1 py-0.5 text-[8px] text-slate-400">
                        {roleName(step.assignedRole)}
                      </span>
                    </div>
                  ))}
                  {group.steps.length > 4 && (
                    <div className="text-center text-[9px] text-violet-400/70">
                      +{group.steps.length - 4} 项更多待办
                    </div>
                  )}
                </div>
                {/* 底部状态条 */}
                <div className="mt-1.5 flex items-center justify-between border-t border-slate-700/20 pt-1">
                  <span className={`flex items-center gap-1 text-[9px] ${lv.text}`}>
                    <AlertTriangle size={9} />
                    {lv.label}预警
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                    <UserCheck size={9} />
                    {group.steps.length} 项待办
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 底部提示 */}
      {!loading && !error && groups.length > 0 && (
        <div className="flex items-center justify-center gap-1 border-t border-violet-500/10 bg-violet-500/5 px-2 py-1.5">
          <Sparkles size={9} className="text-violet-400" />
          <span className="text-[9px] text-violet-300/70">点击任务卡片进入警情详情处理</span>
        </div>
      )}
    </div>
  )
}
