'use client'

import { Activity, Zap, ChevronRight, Clock } from 'lucide-react'
import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'

const statusLabel: Record<string, string> = {
  PENDING: '等待中',
  RUNNING: '训练中',
  COMPLETED: '已完成',
  FAILED: '已失败',
}

const levelColors: Record<WarningLevel, { bg: string; text: string; short: string }> = {
  RED:    { bg: 'bg-red-600',    text: 'text-red-400',    short: '红' },
  ORANGE: { bg: 'bg-orange-500', text: 'text-orange-400', short: '橙' },
  YELLOW: { bg: 'bg-amber-400',  text: 'text-amber-400',  short: '黄' },
  BLUE:   { bg: 'bg-blue-600',   text: 'text-blue-400',   short: '蓝' },
}

interface TaskCardProps {
  task: TrainingTask
  onView: (task: TrainingTask) => void
  isLatest?: boolean
}

export default function TaskCard({ task, onView, isLatest = false }: TaskCardProps) {
  const colors = levelColors[task.warningLevel]
  const progress = task.status === 'COMPLETED' ? 100
    : task.status === 'RUNNING' ? Math.min(task.progress ?? 0, 99)
    : 0
  const timeAgo = getTimeAgo(task.createdAt)

  return (
    <button
      onClick={() => onView(task)}
      className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 hover:scale-[1.01] ${
        isLatest
          ? 'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.06] to-violet-500/[0.03] hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5'
          : 'border-slate-700/40 bg-slate-800/30 hover:border-slate-600/50 hover:bg-slate-800/50'
      }`}
    >
      {isLatest && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500" />
      )}

      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg} text-sm font-bold text-white shadow-lg`}>
          {colors.short}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
              {task.name}
            </h3>
            <ChevronRight size={14} className="shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Zap size={10} className={colors.text} />
              <span className={colors.text}>风险 {task.intrusionRisk}%</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {timeAgo}
            </span>
            <span className="flex items-center gap-1">
              <Activity size={10} className="text-slate-600" />
              {statusLabel[task.status] ?? task.status}
            </span>
          </div>

          {task.status !== 'PENDING' && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-700/40">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${colors.bg} transition-all duration-700 ease-out ${task.status === 'RUNNING' ? 'dv-progress-bar' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="mt-2 flex items-center gap-1.5">
            <span className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              目标 {task.detectedCount}
            </span>
            <span className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              窗口 {task.predictionWindow}
            </span>
            {task.metrics?.mAP50 && (
              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                mAP {task.metrics.mAP50}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function getTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}
