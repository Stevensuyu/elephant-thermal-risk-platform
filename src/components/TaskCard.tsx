import { AlertCircle, CheckCircle, Clock, Loader2, ShieldAlert } from 'lucide-react'
import type { TrainingTask, WarningLevel } from '@/lib/store'

interface TaskCardProps {
  task: TrainingTask
  onView: (task: TrainingTask) => void
}

const statusConfig = {
  PENDING: { color: 'bg-amber-100 text-amber-800', icon: Clock, label: '等待中' },
  RUNNING: { color: 'bg-blue-100 text-blue-800', icon: Loader2, label: 'AI 处理中' },
  COMPLETED: { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle, label: '已完成' },
  FAILED: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: '失败' },
}

const levelConfig: Record<WarningLevel, { label: string; color: string; bar: string }> = {
  RED: { label: '红色预警', color: 'bg-red-600 text-white', bar: 'bg-red-500' },
  ORANGE: { label: '橙色预警', color: 'bg-orange-500 text-white', bar: 'bg-orange-500' },
  YELLOW: { label: '黄色预警', color: 'bg-amber-400 text-slate-950', bar: 'bg-amber-400' },
  BLUE: { label: '蓝色预警', color: 'bg-blue-600 text-white', bar: 'bg-blue-500' },
}

export default function TaskCard({ task, onView }: TaskCardProps) {
  const config = statusConfig[task.status]
  const level = levelConfig[task.warningLevel]
  const StatusIcon = config.icon

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{task.name}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{task.videoFileName || task.videoUrl || '本地基线数据集'}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${config.color}`}>
          <StatusIcon size={14} className={task.status === 'RUNNING' ? 'animate-spin' : ''} />
          {config.label}
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-md bg-slate-50 p-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${level.color}`}>
          <ShieldAlert size={14} />
          {level.label}
        </span>
        <div className="text-right">
          <div className="text-xl font-black text-slate-900">{task.intrusionRisk}</div>
          <div className="text-[11px] text-slate-500">{task.predictionWindow}</div>
        </div>
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6 text-slate-600">{task.aiSummary}</p>

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>监测-预警-处警闭环进度</span>
          <span>{Math.round(task.progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${level.bar}`} style={{ width: `${task.progress}%` }} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-1">
        {task.stages?.map((stage) => (
          <div key={stage.key} className="rounded bg-slate-50 px-1.5 py-2 text-center">
            <div className="truncate text-[11px] font-medium text-slate-700">{stage.name}</div>
            <div className="mt-1 text-[10px] text-slate-500">{stage.status}</div>
          </div>
        ))}
      </div>

      {task.needsModelConfirm ? (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-xs font-medium text-emerald-700">结果已生成，等待确认后汇总到当前模型。</div>
      ) : null}

      <button onClick={() => onView(task)} className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">
        查看智能研判详情
      </button>
    </div>
  )
}
