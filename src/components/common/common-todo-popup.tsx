'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, CheckCircle2, Clock, ArrowRight, Bell, ClipboardList, Loader2, Check } from 'lucide-react'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { RoleId } from '@/lib/auth/auth-role-permissions'
import { publishWorkflowStepConfirmed } from '@/lib/utils/util-workflow-sync'

interface Props {
  open: boolean
  onClose: () => void
  tasks: TrainingTask[]
  currentRole: RoleId | string
  currentName: string
  onViewTask: (t: TrainingTask) => void
}

const LEVEL_STYLE: Record<string, { label: string; cls: string }> = {
  red: { label: '红色', cls: 'bg-red-500/15 text-red-200 ring-red-400/30' },
  orange: { label: '橙色', cls: 'bg-orange-500/15 text-orange-200 ring-orange-400/30' },
  yellow: { label: '黄色', cls: 'bg-yellow-500/15 text-yellow-200 ring-yellow-400/30' },
  blue: { label: '蓝色', cls: 'bg-blue-500/15 text-blue-200 ring-blue-400/30' },
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  center: '管理中心',
  street: '街道干部',
  police: '警员',
}

interface MyStep {
  taskId: string
  task: TrainingTask | null
  step: { id: string; title: string; type: string; assignedRole: string; status: string; description?: string }
}

export default function TodoPopup({ open, onClose, tasks, currentRole, currentName, onViewTask }: Props) {
  const [activeTab, setActiveTab] = useState<'alerts' | 'steps'>('alerts')
  const [mySteps, setMySteps] = useState<MyStep[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [justCompleted, setJustCompleted] = useState<string[]>([])

  // 从服务端加载当前角色负责的待确认处置步骤
  const loadMySteps = useCallback(async () => {
    if (!currentRole) return
    try {
      const res = await fetch('/api/disposal-workflows', { cache: 'no-store' })
      const data = await res.json()
      const wfs = Array.isArray(data) ? data : (data?.workflows ?? [])
      const steps: MyStep[] = []
      for (const wf of wfs) {
        // 已归档 → 跳过
        if (wf.advanced === true) continue
        for (const s of (wf.steps || [])) {
          // 对应警情必须存在（被删除 → 跳过）且未结案
          const taskObj = tasks.find((t) => t.id === wf.taskId) || null
          const taskExistsAndOpen = taskObj !== null && taskObj.status !== 'COMPLETED'
          // 当前角色负责（admin 可见所有） 且 未完成/未跳过 且 未确认 且 警情存在且未结案
          const needsMe = (s.assignedRole === currentRole || currentRole === 'admin')
            && s.status !== 'done' && s.status !== 'skipped' && !s.confirmedBy
            && taskExistsAndOpen
          if (needsMe) {
            steps.push({ taskId: wf.taskId, task: taskObj, step: s })
          }
        }
      }
      setMySteps(steps)
    } catch {
      setMySteps([])
    }
  }, [currentRole, tasks])

  // 打开时加载
  useEffect(() => {
    if (!open) return
    loadMySteps()
  }, [open, loadMySteps])

  // 监听其他组件（如我的任务）确认步骤后的同步事件，刷新待办列表
  useEffect(() => {
    if (!open) return
    const handler = () => loadMySteps()
    window.addEventListener('todo:step-confirmed', handler)
    return () => window.removeEventListener('todo:step-confirmed', handler)
  }, [open, loadMySteps])

  // 直接确认待办步骤：调用 API 标记完成，并从列表移除 + 同步通知其他组件
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const handleConfirmStep = useCallback(async (taskId: string, stepId: string) => {
    setConfirmingId(stepId)
    setConfirmError(null)
    try {
      const res = await fetch('/api/disposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, stepId, confirm: true, by: currentName || currentRole || '成员' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setJustCompleted((prev) => [...prev, stepId])
        // 立即从列表移除（不等待 setTimeout），确保卡片消失
        setMySteps((prev) => prev.filter((s) => s.step.id !== stepId))
        setTimeout(() => {
          setJustCompleted((prev) => prev.filter((id) => id !== stepId))
        }, 800)
        // 同步通知：我的任务页面、主页面等监听此事件后刷新
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
  }, [currentName, currentRole])

  if (!open) return null

  // 待处理警情：显示所有未结案的警情（status !== 'COMPLETED'），
  // 不依赖当前用户是否有分配步骤——确保用户至少能看到存在待处理警情，可点击进入详情页处理。
  // 已结案警情天然被过滤；已归档/被删除的警情因不在 tasks 列表中而天然不显示。
  const pendingAlerts = tasks.filter((t) => t.status !== 'COMPLETED')
  // 按等级排序：红 > 橙 > 黄 > 蓝
  const levelOrder = { red: 0, orange: 1, yellow: 2, blue: 3 }
  pendingAlerts.sort((a, b) => (levelOrder[a.warningLevel as keyof typeof levelOrder] ?? 9) - (levelOrder[b.warningLevel as keyof typeof levelOrder] ?? 9))

  const handleView = (t: TrainingTask) => {
    onClose()
    onViewTask(t)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-purple-500/25 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-purple-500/25 bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5">
          <Bell size={18} className="text-amber-300" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">待办事项</h3>
            <p className="text-[11px] text-slate-400">{currentName} · {ROLE_LABEL[currentRole] || currentRole}</p>
          </div>
          <span className="ml-auto rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/30">
            {mySteps.length} 项待办
          </span>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-slate-600/40 bg-slate-800/50">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex-1 px-4 py-2.5 text-[13px] font-medium transition ${
              activeTab === 'alerts' ? 'border-b-2 border-amber-400 text-amber-200' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            待处理警情 ({pendingAlerts.length})
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`flex-1 px-4 py-2.5 text-[13px] font-medium transition ${
              activeTab === 'steps' ? 'border-b-2 border-amber-400 text-amber-200' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            我的任务 ({mySteps.length})
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'alerts' && (
            <div className="space-y-2">
              {pendingAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <CheckCircle2 size={40} className="mb-2 text-emerald-500/50" />
                  <p className="text-[13px]">暂无待处理警情</p>
                </div>
              ) : (
                pendingAlerts.map((t) => {
                  const ls = LEVEL_STYLE[t.warningLevel] || LEVEL_STYLE.blue
                  return (
                    <div
                      key={t.id}
                      className="group flex items-center gap-3 rounded-lg border border-purple-500/25 bg-slate-800/50 p-3 transition hover:border-slate-600/40 hover:bg-slate-800/70"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ls.cls} ring-1`}>
                        <AlertTriangle size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-slate-100">{t.name}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${ls.cls}`}>{ls.label}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {t.alertType || '象群入侵'} · {(t as any).location || t.dispatchRegion || t.township || '位置未标注'} · {new Date(t.createdAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleView(t)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-600/40 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200"
                      >
                        处理 <ArrowRight size={11} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'steps' && (
            <div className="space-y-2">
              {mySteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <CheckCircle2 size={40} className="mb-2 text-emerald-500/50" />
                  <p className="text-[13px]">暂无需要您确认的处置任务</p>
                </div>
              ) : (
                mySteps.map(({ taskId, task, step }) => {
                  const t = task || ({ id: '', name: `警情 ${step.id}`, warningLevel: 'blue', status: 'RUNNING', progress: 0, intrusionRisk: 0, predictionWindow: '', aiSummary: '', dispatchPlan: [], detectedCount: 0, needsModelConfirm: false, stages: [], createdAt: '', updatedAt: '' } as unknown as TrainingTask)
                  const ls = LEVEL_STYLE[t.warningLevel] || LEVEL_STYLE.blue
                  return (
                    <div
                      key={`${step.id}`}
                      className="rounded-lg border border-amber-500/30 bg-slate-800/50 p-3 transition hover:border-amber-400/50"
                    >
                      <div className="flex items-center gap-2">
                        <ClipboardList size={14} className="shrink-0 text-amber-400" />
                        <span className="truncate text-[13px] font-medium text-slate-100">{task ? task.name : `警情 ${task ? '' : step.id}`}</span>
                        <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${ls.cls}`}>{ls.label}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Clock size={12} className="shrink-0 text-cyan-400" />
                        <span className="truncate text-[12px] text-cyan-100">{step.title}</span>
                        <span className="shrink-0 rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {ROLE_LABEL[step.assignedRole] || step.assignedRole}
                        </span>
                      </div>
                      {step.description && (
                        <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{step.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleConfirmStep(taskId, step.id)}
                          disabled={confirmingId === step.id || justCompleted.includes(step.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-white transition cursor-pointer ${
                            justCompleted.includes(step.id)
                              ? 'bg-emerald-600 cursor-default'
                              : confirmingId === step.id
                                ? 'bg-blue-600/70 cursor-wait'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-[0_0_8px_rgba(37,99,235,0.3)] hover:shadow-[0_0_12px_rgba(37,99,235,0.5)]'
                          }`}
                        >
                          {justCompleted.includes(step.id) ? (
                            <><Check size={11} /> 已确认</>
                          ) : confirmingId === step.id ? (
                            <><Loader2 size={11} className="animate-spin" /> 确认中</>
                          ) : (
                            <>确认</>
                          )}
                        </button>
                        <button
                          onClick={() => { if (task) handleView(task) }}
                          disabled={!task}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-600/40 px-2 py-1 text-[11px] text-slate-300 transition hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          详情 <ArrowRight size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="border-t border-slate-600/40 bg-slate-800/50 px-4 py-2.5 text-center">
          <p className="text-[10px] text-slate-400">分配给您负责的处置步骤需您亲自确认后才能推进下一步</p>
        </div>
      </div>
    </div>
  )
}
