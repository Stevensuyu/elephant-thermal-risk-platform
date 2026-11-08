'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Bell, BellRing, Eye, EyeOff, Trash2 } from 'lucide-react'
import { alertEmoji } from '@/lib/utils/util-alert-level-icons'
import { useAlerts } from '@/lib/utils/util-use-alerts-hook'

/**
 * 警情通知铃（按当前登录角色读取「下发到本层级」的警情）。
 * 复用 useAlerts 共享钩子 —— 与「警情中心」共用同一份 alert-messages 真相源，
 * 任一端「标记已读 / 标记未读 / 删除」操作都会即时双向联动，彻底解决不联动问题。
 */

const AlertDetailCard = dynamic(() => import('@/components/alert/alert-detail-card-modal'), { ssr: false })

const LEVEL_DOT: Record<string, string> = {
  RED: 'bg-red-500',
  ORANGE: 'bg-orange-500',
  YELLOW: 'bg-yellow-400',
  BLUE: 'bg-cyan-400',
}

export default function AlertBell({ role }: { role: string }) {
  const { alerts, unread, setRead, remove } = useAlerts(role)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<{ id: string; type?: string } | null>(null)
  const bellRef = useRef<HTMLDivElement | null>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
        title="警情通知"
      >
        {unread > 0 ? <BellRing size={15} className="text-amber-300" /> : <Bell size={15} className="text-slate-300" />}
        <span>警情</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-slate-100">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-purple-500/25 bg-gradient-to-b from-slate-900 to-slate-950 p-2 shadow-2xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-200">下发到本层级的警情（{alerts.length}）</span>
            <span className="text-[11px] text-slate-400">{unread} 未读</span>
          </div>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {alerts.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-slate-400">暂无下发到该层级的警情</div>
            )}
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`rounded-md border px-2.5 py-2 ${
                  a.read ? 'border-purple-500/25 bg-slate-800/50' : 'border-amber-500/40 bg-amber-500/5'
                }`}
              >
                <button
                  onClick={() => setDetail({ id: a.taskId || a.id, type: a.alertType })}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[a.level] || 'bg-slate-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[12px] font-medium text-slate-100">
                      <span>{alertEmoji(a.alertType)}</span>
                      <span className="truncate">{a.title}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-400">{a.message}</div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {new Date(a.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </button>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => setDetail({ id: a.taskId || a.id, type: a.alertType })}
                    className="flex-1 rounded bg-cyan-500/15 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/25"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={() => setRead(a.id, !a.read)}
                    className="flex-1 rounded bg-slate-600/20 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-600/30"
                  >
                    {a.read ? (
                      <span className="inline-flex items-center justify-center gap-1"><EyeOff size={12} /> 标记未读</span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1"><Eye size={12} /> 标记已读</span>
                    )}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    title="删除该警情"
                    className="inline-flex items-center justify-center rounded bg-rose-500/15 px-1.5 py-1 text-[11px] text-rose-200 transition hover:bg-rose-500/25"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-purple-500/25 px-1 pt-2 text-[10px] text-slate-400">
            与「警情中心」实时联动：已读 / 未读 / 删除任一端操作，另一端即时同步。
          </div>
        </div>
      )}
      {detail && (
        <AlertDetailCard
          alertId={detail.id}
          alertType={detail.type}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
