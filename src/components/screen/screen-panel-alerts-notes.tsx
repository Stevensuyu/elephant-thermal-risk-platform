'use client'

// ───────────────────────────────────────────────────────────────────────────
// 面板①实时预警:未闭环警情自动滚动流(等级定色,点击跳详情)
// 面板②分析笔录:AI 研判笔录时间线
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from 'react'
import ScreenPanelFrame from './screen-panel-frame'
import type { TrainingTask } from '@/lib/utils/util-app-types'

const LEVEL: Record<string, { short: string; color: string }> = {
  RED: { short: '红', color: '#ff4d4f' },
  ORANGE: { short: '橙', color: '#ff9a3c' },
  YELLOW: { short: '黄', color: '#ffd666' },
  BLUE: { short: '蓝', color: '#4da3ff' },
}

function fmtTime(iso?: string) {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 未完成在上(时间倒序) */
function sortTasks(tasks: TrainingTask[]) {
  const open = tasks
    .filter((t) => t.status !== 'COMPLETED' && !t.aggregatedAt && !t.closedAt)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const done = tasks
    .filter((t) => t.status === 'COMPLETED' || t.aggregatedAt || t.closedAt)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return [...open, ...done]
}

export function ScreenAlertsPanel({ tasks, onOpenTask }: { tasks: TrainingTask[]; onOpenTask: (t: TrainingTask) => void }) {
  const sorted = useMemo(() => sortTasks(tasks), [tasks])
  const listRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  // 自动滚动:内容超出一屏时匀速循环(复制一份首尾相接)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const id = setInterval(() => {
      if (pausedRef.current) return
      const half = el.scrollHeight / 2
      if (half < 10) return
      el.scrollTop += 1
      if (el.scrollTop >= half) el.scrollTop -= half
    }, 60)
    return () => clearInterval(id)
  }, [])

  const items = sorted.length > 0 ? [...sorted, ...sorted] : []

  return (
    <ScreenPanelFrame
      title="实时预警"
      extra={<span><span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-rose-400 align-middle" />LIVE</span>}
      className="min-h-0"
      bodyClass="overflow-hidden"
    >
      <div
        ref={listRef}
        className="h-full overflow-hidden px-3 py-2"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
      >
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-500">暂无警情,全线平静</div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((t, i) => {
              const lv = LEVEL[t.warningLevel] ?? LEVEL.BLUE
              const open = t.status !== 'COMPLETED' && !t.aggregatedAt && !t.closedAt
              return (
                <li
                  key={`${t.id}-${i}`}
                  onClick={() => onOpenTask(t)}
                  className="flex cursor-pointer items-center gap-2.5 border-l-2 px-2.5 py-1.5 transition-colors hover:bg-cyan-400/10"
                  style={{ borderColor: lv.color, background: 'rgba(15,40,90,0.35)' }}
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                    style={{ background: lv.color, opacity: open ? 1 : 0.45 }}
                  >
                    {lv.short}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[14px] ${open ? 'text-slate-100' : 'text-slate-500 line-through'}`}>
                    {t.name}
                  </span>
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: lv.color }}>
                    {t.intrusionRisk ?? '-'}
                  </span>
                  <span className="w-[86px] shrink-0 text-right font-mono text-[11px] text-slate-500">{fmtTime(t.createdAt)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ScreenPanelFrame>
  )
}

export function ScreenNotesPanel({ tasks }: { tasks: TrainingTask[] }) {
  const notes = useMemo(
    () =>
      sortTasks(tasks)
        .filter((t) => (t.aiSummary || t.description || '').trim().length > 0)
        .slice(0, 30),
    [tasks],
  )
  const listRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const id = setInterval(() => {
      if (pausedRef.current) return
      const half = el.scrollHeight / 2
      if (half < 10) return
      el.scrollTop += 1
      if (el.scrollTop >= half) el.scrollTop -= half
    }, 70)
    return () => clearInterval(id)
  }, [])

  const items = notes.length > 0 ? [...notes, ...notes] : []

  return (
    <ScreenPanelFrame
      title="分析笔录"
      extra={<span>AI 研判实录</span>}
      className="min-h-0"
      bodyClass="overflow-hidden"
    >
      <div
        ref={listRef}
        className="h-full overflow-hidden px-3 py-2"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
      >
        {notes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-500">暂无分析笔录</div>
        ) : (
          <ul className="space-y-2">
            {items.map((t, i) => {
              const lv = LEVEL[t.warningLevel] ?? LEVEL.BLUE
              return (
                <li key={`${t.id}-${i}`} className="relative pl-5" style={{ background: 'rgba(15,40,90,0.25)' }}>
                  {/* 时间线竖线 + 点 */}
                  <span className="absolute left-[7px] top-[10px] h-[calc(100%-16px)] w-px bg-cyan-500/25" />
                  <span className="absolute left-[4px] top-[9px] h-[7px] w-[7px] rounded-full" style={{ background: lv.color, boxShadow: `0 0 6px ${lv.color}` }} />
                  <div className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-100">{t.name}</span>
                      <span className="rounded px-1 text-[10px] font-bold text-white" style={{ background: lv.color }}>
                        {lv.short}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-slate-500">{fmtTime(t.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-slate-400">{t.aiSummary || t.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ScreenPanelFrame>
  )
}
