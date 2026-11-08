'use client'

import { AlertTriangle, ArrowRight, Radio } from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'

/**
 * 活动预警横幅：直播/实时流产生预警时，在「态势总览」与「实时监控」双屏顶部联动展示，
 * 点击可跳转到「预警研判」查看详情与处置。与研判、地图共用同一 tasks 数据源，状态实时同步。
 */
export default function ActiveWarningBanner({
  task,
  onJump,
}: {
  task: TrainingTask
  onJump?: () => void
}) {
  const s = levelStyle[(task.warningLevel || 'BLUE') as WarningLevel]
  return (
    <div className={`mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-r ${s.bg} px-4 py-3 text-white shadow-lg`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
        <AlertTriangle size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-bold">
          {s.label}活动预警
          {task.triggeredBy === 'realtime-stream' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium">
              <Radio size={11} /> 实时流触发
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-white/90">
          {task.name} · 入侵风险指数 {task.intrusionRisk} · 预测窗口 {task.predictionWindow}
        </div>
      </div>
      {onJump && (
        <button
          onClick={onJump}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/30"
        >
          前往研判 <ArrowRight size={13} />
        </button>
      )}
    </div>
  )
}
