'use client'

import { Radar, Cpu, ScanSearch, ListChecks, Plus } from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { ModelStatus, TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'

const LOOP = ['感知接入', '实时监控', '态势总览', 'AI 研判', '预警处置', '处警闭环']

const DISPATCH: Record<WarningLevel, string[]> = {
  RED: ['立即疏散群众', '实施交通管制', '专业力量调派', '指挥中心留痕'],
  ORANGE: ['巡护力量前置', '村寨联络提醒', '无人机复飞跟踪', '准备交通劝导'],
  YELLOW: ['持续观察 1-2 小时', '核对历史轨迹', '村民端提醒', '保留升级规则'],
  BLUE: ['常态监测', '记录位置方向', '订阅项圈轨迹', '无需立即处警'],
}

/**
 * 态势综合研判：将原本零散的多张 Panel（实时三维立体分析 / 当前模型状态 /
 * 监测-预警-处警闭环 / 最新 AI 识别过程 / 指挥研判摘要）合并为一张精炼框图。
 * 文案精简、去除冗余解释，卡片采用统一的细边框风格。
 */
export default function SituationalDigest({
  commandTask,
  currentLevel,
  modelStatus,
  latestTask,
  onUpload,
}: {
  commandTask: TrainingTask | null
  currentLevel: WarningLevel
  modelStatus: ModelStatus
  latestTask: TrainingTask | null
  onUpload?: () => void
}) {
  const lv = levelStyle[currentLevel]
  const summary =
    commandTask?.aiSummary ||
    '接入视频源后，系统将自动识别象群位置、数量与方向，并输出入侵风险指数与处置建议。'
  const dispatch =
    commandTask?.dispatchPlan && commandTask.dispatchPlan.length
      ? commandTask.dispatchPlan
      : DISPATCH[currentLevel]
  const metrics: { label: string; value: string }[] = [
    { label: '模型版本', value: modelStatus.version || '—' },
    { label: '模型状态', value: modelStatus.status || '—' },
    { label: 'mAP50', value: (modelStatus.map50 ?? 0).toFixed(3) },
    { label: 'Precision', value: (modelStatus.precision ?? 0).toFixed(3) },
    { label: 'Recall', value: (modelStatus.recall ?? 0).toFixed(3) },
    { label: '训练图片', value: String(modelStatus.datasetImages ?? 0) },
  ]

  return (
    <div className="dv-panel overflow-hidden p-5">
      {/* 头部：标题 + 当前等级 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Radar size={20} className="text-cyan-300" />
        <h2 className="dv-title text-lg font-semibold text-slate-100">态势综合研判</h2>
        {onUpload && (
          <button
            onClick={onUpload}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/90 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
          >
            <Plus size={14} /> 上传视频训练
          </button>
        )}
        <span className={`ml-auto inline-flex items-center gap-2 rounded-full ${lv.bg} px-3 py-1 text-sm font-bold text-white shadow`}>
          <span className="h-2 w-2 rounded-full bg-white/90" />
          当前 {lv.label}
        </span>
      </div>

      {/* 研判结论（精简一行，无冗余解释） */}
      <p className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-sm leading-6 text-slate-200/90">
        {summary}
      </p>

      {/* 监测—预警—处警 闭环 */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium text-slate-400">处置闭环</div>
        <div className="flex flex-wrap items-center gap-2">
          {LOOP.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
                  i === LOOP.length - 1
                    ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-700/50 bg-slate-800/40 text-slate-200'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${lv.bg}`}>
                  {i + 1}
                </span>
                {s}
              </div>
              {i < LOOP.length - 1 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 两栏：处置预案 + 模型状态 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <ListChecks size={13} className="text-amber-300" /> 处置预案（{lv.label}）
          </div>
          <div className="grid grid-cols-2 gap-2">
            {dispatch.map((item, i) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-[12px] text-slate-200"
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${lv.bg}`}>
                  {i + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Cpu size={13} className="text-sky-300" /> 模型状态
          </div>
          <div className="grid grid-cols-3 gap-2">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                <div className="text-[10px] text-slate-500">{m.label}</div>
                <div className="mt-0.5 truncate text-sm font-bold text-slate-100">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 识别阶段（若存在真实识别记录） */}
      {latestTask?.stages && latestTask.stages.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <ScanSearch size={13} className="text-emerald-300" /> 识别阶段
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {latestTask.stages.map((st) => (
              <div key={st.name} className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="truncate font-medium text-slate-200">{st.name}</span>
                  <span className="ml-1 shrink-0 text-slate-400">{st.status}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700/50">
                  <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${st.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
