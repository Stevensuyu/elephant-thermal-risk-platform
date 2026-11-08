'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2, Loader2, BellRing, UserCheck, Eye, Radio, Megaphone, Users, Plane,
  ShieldAlert, Ban, TrafficCone, Footprints, Send, ClipboardCheck, Inbox, SearchCheck,
  HeartPulse, Package, Newspaper, Archive,
} from 'lucide-react'
import type { RoleId } from '@/lib/auth/auth-role-permissions'

interface PendingItem {
  taskId: string
  taskName: string
  level: string
  stepId: string
  stepTitle: string
  stepType: string
  stepDesc?: string
  assignedRole: string
  taskType?: string
  taskSource?: string
}

const LEVEL_LABEL: Record<string, string> = {
  RED: '红色预警',
  ORANGE: '橙色预警',
  YELLOW: '黄色预警',
  BLUE: '蓝色预警',
}

/** 处置类别元信息（弹窗分发类别：图标 + 名称 + 配色） */
const STEP_META: Record<string, { label: string; icon: any; cls: string }> = {
  receive: { label: '接警受理', icon: Inbox, cls: 'bg-sky-500/15 text-sky-200 ring-sky-400/30' },
  monitor: { label: '监测锁定', icon: Eye, cls: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/30' },
  verify: { label: '核实研判', icon: SearchCheck, cls: 'bg-violet-500/15 text-violet-200 ring-violet-400/30' },
  broadcast: { label: '预警广播', icon: Megaphone, cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/30' },
  dispatch: { label: '人员调度', icon: Users, cls: 'bg-blue-500/15 text-blue-200 ring-blue-400/30' },
  uav: { label: '无人机介入', icon: Plane, cls: 'bg-indigo-500/15 text-indigo-200 ring-indigo-400/30' },
  deter: { label: '科学驱离', icon: ShieldAlert, cls: 'bg-orange-500/15 text-orange-200 ring-orange-400/30' },
  blockade: { label: '封锁警戒', icon: Ban, cls: 'bg-rose-500/15 text-rose-200 ring-rose-400/30' },
  traffic: { label: '交通管制', icon: TrafficCone, cls: 'bg-yellow-500/15 text-yellow-200 ring-yellow-400/30' },
  evacuate: { label: '群众疏散', icon: Footprints, cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' },
  rescue: { label: '医疗救援', icon: HeartPulse, cls: 'bg-red-500/15 text-red-200 ring-red-400/30' },
  logistics: { label: '后勤保障', icon: Package, cls: 'bg-slate-500/15 text-slate-200 ring-slate-400/30' },
  publicity: { label: '舆情引导', icon: Newspaper, cls: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30' },
  report: { label: '上报联动', icon: Send, cls: 'bg-teal-500/15 text-teal-200 ring-teal-400/30' },
  review: { label: '复盘留痕', icon: ClipboardCheck, cls: 'bg-lime-500/15 text-lime-200 ring-lime-400/30' },
  archive: { label: '结案归档', icon: Archive, cls: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
}

/**
 * 全局成员确认弹窗（弹窗分发）：登录后轮询「待当前角色确认的处置步骤」，
 * 按「处置类别」分组推送给对应成员 —— 每类显示图标/名称/描述，成员点「确认完成」留痕；
 * 全部必需确认齐备后，管理员方可在处置工单中「推进 / 结案」。
 */
export default function ConfirmPopup({ role, currentName }: { role: RoleId; currentName: string }) {
  const [items, setItems] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/disposal?role=${encodeURIComponent(role)}&pending=true`, { cache: 'no-store' })
      const d = await r.json()
      setItems(Array.isArray(d.items) ? (d.items as PendingItem[]) : [])
    } catch {
      /* ignore */
    }
  }, [role])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const confirm = async (it: PendingItem) => {
    setBusy(it.stepId)
    try {
      const r = await fetch('/api/disposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: it.taskId, stepId: it.stepId, confirm: true, by: currentName || role }),
      })
      const d = await r.json()
      if (d.success) setItems((list) => list.filter((x) => x.stepId !== it.stepId))
    } catch {
      /* ignore */
    } finally {
      setBusy(null)
    }
  }

  if (!items.length) return null

  // 按处置类别分组（保持全流程顺序），让弹窗分发类别一目了然
  const order = Object.keys(STEP_META)
  const groups: { type: string; items: PendingItem[] }[] = []
  for (const t of order) {
    const list = items.filter((it) => it.stepType === t)
    if (list.length) groups.push({ type: t, items: list })
  }
  for (const it of items) {
    if (!groups.some((g) => g.type === it.stepType)) {
      groups.push({ type: it.stepType, items: items.filter((x) => x.stepType === it.stepType) })
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] w-auto overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl ring-1 ring-purple-500/20 backdrop-blur sm:bottom-5 sm:left-auto sm:right-5 sm:w-[380px]">
      <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2.5">
        <BellRing size={16} className="text-amber-300" />
        <span className="text-sm font-semibold text-amber-100">待您确认的处置任务（{items.length}）</span>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto rounded px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[55vh] overflow-y-auto p-3">
          {groups.map((g) => {
            const meta = STEP_META[g.type] || { label: g.type, icon: Radio, cls: 'bg-slate-500/15 text-slate-200 ring-slate-400/30' }
            const Icon = meta.icon
            return (
              <div key={g.type} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${meta.cls}`}>
                    <Icon size={11} /> {meta.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{g.items.length} 项</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((it) => (
                    <div key={`${it.taskId}-${it.stepId}`} className="rounded-lg border border-purple-500/25 bg-slate-800/50 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">{LEVEL_LABEL[it.level] || it.level}</span>
                        {it.taskType && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-200">{it.taskType}</span>}
                        {it.taskSource && <span className="rounded bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-400">来源：{it.taskSource}</span>}
                      </div>
                      <p className="mt-1.5 text-[12px] font-semibold leading-5 text-slate-100">{it.taskName}</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-slate-300">任务：{it.stepTitle}</p>
                      {it.stepDesc && <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{it.stepDesc}</p>}
                      <button
                        onClick={() => confirm(it)}
                        disabled={busy === it.stepId}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {busy === it.stepId ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                        确认完成（{meta.label}）
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-purple-500/25 px-3 py-2 text-[10px] text-slate-400">
        <CheckCircle2 size={11} /> 按处置类别分发 · 确认后留痕（谁/何时确认），管理员可在处置工单推进下一步。
      </div>
    </div>
  )
}
