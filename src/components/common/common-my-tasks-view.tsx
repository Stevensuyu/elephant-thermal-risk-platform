'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ListChecks, Loader2, Check, RefreshCw, CheckCircle2, ArrowRight, Bell,
  AlertTriangle, UserCheck
} from 'lucide-react'
import { ROLES, type RoleId } from '@/lib/auth/auth-role-permissions'
import { publishWorkflowStepConfirmed } from '@/lib/utils/util-workflow-sync'

interface TaskStep {
  id: string
  title: string
  description?: string
  assignedRole: string
}

interface TaskGroup {
  taskId: string
  taskName: string
  warningLevel: string
  steps: TaskStep[]
}

interface Props {
  currentRole: string
  currentName: string
  tasks: any[]
}

const LEVEL_STYLE: Record<string, { bg: string; text: string; dot: string; label: string; border: string }> = {
  RED:    { bg: 'bg-rose-500/15', text: 'text-rose-300', dot: 'bg-rose-400', label: '红色', border: 'border-rose-500/30' },
  ORANGE: { bg: 'bg-orange-500/15', text: 'text-orange-300', dot: 'bg-orange-400', label: '橙色', border: 'border-orange-500/30' },
  YELLOW: { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-400', label: '黄色', border: 'border-amber-500/30' },
  BLUE:   { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-400', label: '蓝色', border: 'border-sky-500/30' },
}

const roleName = (r: string) => ROLES[r as RoleId]?.name || r

export default function MyTasksView({ currentRole, currentName, tasks }: Props) {
  const router = useRouter()
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [justCompleted, setJustCompleted] = useState<string[]>([])
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const loadMyTasks = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // 一次性获取全部处置工单（与 TodoPopup / page.tsx 保持同一数据源）
      // 带 30 秒超时，避免长时间挂起；不使用 AbortController 取消，防止轮询导致反复取消
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
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

      // 构建警情查找表（使用 tasksRef 避免依赖 tasks 导致反复重渲染）
      const taskMap = new Map<string, any>()
      tasksRef.current.forEach((t: any) => taskMap.set(t.id, t))

      const groupMap = new Map<string, TaskGroup>()

      for (const wf of wfs) {
        // 已归档 → 跳过
        if (wf.advanced === true) continue
        // 对应警情必须存在（被删除 → 跳过）且未结案
        const task = taskMap.get(wf.taskId)
        if (!task) continue
        if (task.status === 'COMPLETED') continue

        const mySteps = (wf.steps || []).filter((s: any) => {
          // 已完成 / 已跳过 → 跳过
          if (s.status === 'done' || s.status === 'skipped') return false
          // 已确认 → 跳过
          if (s.confirmedBy) return false
          // 分配给当前角色（admin 可见所有）
          return s.assignedRole === currentRole || currentRole === 'admin'
        })

        if (mySteps.length > 0) {
          groupMap.set(wf.taskId, {
            taskId: wf.taskId,
            taskName: task.name || task.alertType || '未命名警情',
            warningLevel: task.warningLevel || 'YELLOW',
            steps: mySteps.map((s: any) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              assignedRole: s.assignedRole,
            })),
          })
        }
      }

      const validGroups = Array.from(groupMap.values())
      const levelOrder: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2, BLUE: 3 }
      validGroups.sort((a, b) => (levelOrder[a.warningLevel] ?? 9) - (levelOrder[b.warningLevel] ?? 9))
      setGroups(validGroups)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setLoadError('加载超时（30秒），请检查网络后重试')
      } else {
        setLoadError(e?.message || '加载失败，请重试')
      }
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [currentRole])

  useEffect(() => {
    loadMyTasks()
    // 只在挂载时执行一次，避免 tasks 轮询导致反复加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听弹窗中确认步骤后的同步事件，刷新我的任务列表
  useEffect(() => {
    const handler = () => loadMyTasks()
    window.addEventListener('todo:step-confirmed', handler)
    return () => window.removeEventListener('todo:step-confirmed', handler)
  }, [loadMyTasks])

  const totalMyTasks = groups.reduce((sum, g) => sum + g.steps.length, 0)

  const [confirmError, setConfirmError] = useState<string | null>(null)

  const handleConfirmStep = async (taskId: string, stepId: string) => {
    setConfirmingId(`${taskId}:${stepId}`)
    setConfirmError(null)
    try {
      const res = await fetch('/api/disposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, stepId, confirm: true, by: currentName || currentRole || '成员' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setJustCompleted((prev) => [...prev, `${taskId}:${stepId}`])
        // 立即从列表移除，确保卡片消失
        setGroups((prev) =>
          prev.map((g) =>
            g.taskId === taskId
              ? { ...g, steps: g.steps.filter((s) => s.id !== stepId) }
              : g
          ).filter((g) => g.steps.length > 0)
        )
        setTimeout(() => {
          setJustCompleted((prev) => prev.filter((id) => id !== `${taskId}:${stepId}`))
        }, 1200)
        // 同步通知弹窗、主页面等其他组件刷新
        window.dispatchEvent(new CustomEvent('todo:step-confirmed', { detail: { taskId, stepId } }))
        // 跨标签页同步
        publishWorkflowStepConfirmed(taskId, stepId)
      } else {
        setConfirmError(d?.error || '确认失败，请重试')
      }
    } catch (e: any) {
      setConfirmError(e?.message || '网络错误，确认失败')
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between rounded-xl border border-violet-500/25 bg-gradient-to-r from-violet-950/40 to-slate-900/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_0_16px_rgba(139,92,246,0.4)]">
            <ListChecks size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">我的任务</h1>
            <p className="text-[11px] text-slate-400">共 <span className="font-bold text-violet-300">{totalMyTasks}</span> 项待你确认完成</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('todo:open-popup'))}
            className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-3 py-1.5 text-xs text-blue-200 transition hover:border-blue-400/60 hover:bg-blue-600/30 hover:text-blue-100 cursor-pointer"
            title="查看待办弹窗"
          >
            <Bell size={12} />
            查看弹窗
          </button>
          <button
            onClick={loadMyTasks}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-violet-400/40 hover:text-violet-300 cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={28} className="animate-spin text-violet-400" />
          <span className="text-sm text-slate-400">加载中…</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle size={28} className="text-amber-400" />
          <h3 className="text-base font-bold text-amber-200">加载失败</h3>
          <p className="text-xs text-amber-300/70">{loadError}</p>
          <button
            onClick={loadMyTasks}
            className="flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-xs text-violet-200 transition hover:bg-violet-500/25"
          >
            <RefreshCw size={12} /> 重新加载
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-slate-800/40 bg-slate-900/30">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h3 className="text-base font-bold text-slate-200">全部完成</h3>
          <p className="text-xs text-slate-500">没有需要你确认的处置步骤</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const lv = LEVEL_STYLE[group.warningLevel] || LEVEL_STYLE.YELLOW
            return (
              <div key={group.taskId} className={`overflow-hidden rounded-xl border ${lv.border} bg-slate-900/40`}>
                {/* 警情标题 */}
                <div className={`flex items-center justify-between border-b ${lv.border} bg-slate-900/60 px-4 py-2.5`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${lv.dot} shadow-[0_0_6px_currentColor]`} />
                    <span className="truncate text-sm font-bold text-slate-100">{group.taskName}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${lv.bg} ${lv.text}`}>
                      {lv.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">· {group.steps.length} 项待办</span>
                  </div>
                  <button
                    onClick={() => router.push(`/alert/${group.taskId}`)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 transition hover:text-violet-300"
                  >
                    详情
                    <ArrowRight size={10} />
                  </button>
                </div>

                {/* 待办步骤 */}
                <div className="divide-y divide-slate-800/40">
                  {group.steps.map((step, idx) => {
                    const isDone = justCompleted.includes(`${group.taskId}:${step.id}`)
                    const isLoading = confirmingId === `${group.taskId}:${step.id}`
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 px-4 py-2.5 transition ${
                          isDone ? 'bg-emerald-500/10' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                          isDone ? 'bg-emerald-500/20 text-emerald-300' : 'bg-violet-500/15 text-violet-300'
                        }`}>
                          {isDone ? <Check size={12} /> : idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${
                            isDone ? 'text-emerald-300 line-through' : 'text-slate-200'
                          }`}>
                            {step.title}
                          </span>
                          {step.description && (
                            <span className={`mt-0.5 block truncate text-[10px] ${
                              isDone ? 'text-emerald-500/60' : 'text-slate-500'
                            }`}>
                              {step.description}
                            </span>
                          )}
                        </div>
                        <span className="hidden sm:inline shrink-0 rounded bg-slate-700/40 px-1.5 py-0.5 text-[9px] text-slate-400">
                          {roleName(step.assignedRole)}
                        </span>
                        <button
                          onClick={() => handleConfirmStep(group.taskId, step.id)}
                          disabled={isLoading || isDone}
                          className={`shrink-0 flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition ${
                            isDone
                              ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
                              : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.3)] hover:shadow-[0_0_14px_rgba(139,92,246,0.5)] hover:from-violet-500 hover:to-purple-500 disabled:opacity-50'
                          }`}
                        >
                          {isDone ? (
                            <><Check size={12} /> 已完成</>
                          ) : isLoading ? (
                            <><Loader2 size={11} className="animate-spin" /> 确认中</>
                          ) : (
                            <><UserCheck size={11} /> 确认完成</>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
