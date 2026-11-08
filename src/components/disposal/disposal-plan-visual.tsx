'use client'

import { useState, useEffect } from 'react'
import {
  Radar, BrainCircuit, Users, ShieldAlert, Archive,
  Plane, Users as UsersIcon, OctagonAlert, Megaphone,
  Stethoscope, Truck, Newspaper, FileText, RotateCcw,
  ChevronRight, CheckCircle2, Clock, AlertTriangle,
  Activity, TrendingUp, Zap, Eye, ShieldCheck,
  MapPin, Navigation, Siren, X,
} from 'lucide-react'

/* ──────────────────────────────────────────────
   处置预案图文可视化组件
   - 五阶段渐变卡片 + 步骤连接线
   - 每阶段配 Lucide 图标 + 关键动作视觉化
   - 进入动画 / hover 放大 / 进度条动画
   - 深蓝渐变主题，背景不过深
   ────────────────────────────────────────────── */

interface WorkflowStep {
  id?: string
  title: string
  description?: string
  assignedRole?: string
  status?: string
}

interface WorkflowData {
  steps: WorkflowStep[]
  aiSummary?: string
  scenario?: string
  aiModel?: string
}

interface Props {
  workflow: WorkflowData
  currentStageIdx?: number
}

/* 五阶段定义 */
interface StageDef {
  key: string
  label: string
  icon: any
  gradient: string
  iconBg: string
  border: string
  text: string
  responsible: string
  desc: string
  matchKeywords: string[]
  visualActions: { icon: any; label: string; color: string }[]
}

const STAGES: StageDef[] = [
  {
    key: 'detect',
    label: '预警发现',
    icon: Radar,
    gradient: 'from-cyan-500/20 to-cyan-600/5',
    iconBg: 'bg-cyan-500/20 text-cyan-300',
    border: 'border-cyan-400/30',
    text: 'text-cyan-300',
    responsible: '监测中心 / 无人机巡检',
    desc: '无人机热成像与地面监测设备实时扫描，AI自动识别象群位置与数量，触发阈值后立即生成预警信息并推送至指挥中心。',
    matchKeywords: ['监测', '识别', '预警', '发现', '检测', '热成像', '巡检', '接警', '受理'],
    visualActions: [
      { icon: Eye, label: '实时监测', color: 'text-cyan-300' },
      { icon: Radar, label: '目标锁定', color: 'text-cyan-400' },
      { icon: AlertTriangle, label: '阈值触发', color: 'text-amber-300' },
    ],
  },
  {
    key: 'analyze',
    label: '研判分析',
    icon: BrainCircuit,
    gradient: 'from-violet-500/20 to-violet-600/5',
    iconBg: 'bg-violet-500/20 text-violet-300',
    border: 'border-violet-400/30',
    text: 'text-violet-300',
    responsible: 'AI 研判引擎 / 管理中心',
    desc: 'AI大模型综合象群规模、移动方向、周边村寨分布与气象数据，评估风险等级，生成处置预案与力量调度建议，供管理员审核确认。',
    matchKeywords: ['研判', '分析', '评估', '核实', '方案', '建议', 'AI', '风险', '等级'],
    visualActions: [
      { icon: BrainCircuit, label: 'AI 研判', color: 'text-violet-300' },
      { icon: Activity, label: '风险评估', color: 'text-violet-400' },
      { icon: TrendingUp, label: '趋势分析', color: 'text-rose-300' },
    ],
  },
  {
    key: 'dispatch',
    label: '力量调度',
    icon: Users,
    gradient: 'from-amber-500/20 to-amber-600/5',
    iconBg: 'bg-amber-500/20 text-amber-300',
    border: 'border-amber-400/30',
    text: 'text-amber-300',
    responsible: '管理中心 / 街道干部 / 警员',
    desc: '管理员确认处置预案后，系统自动将任务分发至对应终端：公安GIS大屏、护林员APP、村广播高音号、无人机航线网关与应急短信，各终端签收确认。',
    matchKeywords: ['调度', '分发', '指派', '人员', '无人机', '广播', '通知', '派遣', '出动'],
    visualActions: [
      { icon: Plane, label: '无人机巡查', color: 'text-amber-300' },
      { icon: Megaphone, label: '预警广播', color: 'text-amber-400' },
      { icon: UsersIcon, label: '人员调度', color: 'text-orange-300' },
    ],
  },
  {
    key: 'handle',
    label: '现场处置',
    icon: ShieldAlert,
    gradient: 'from-rose-500/20 to-rose-600/5',
    iconBg: 'bg-rose-500/20 text-rose-300',
    border: 'border-rose-400/30',
    text: 'text-rose-300',
    responsible: '现场警员 / 街道干部 / 后勤保障',
    desc: '现场力量按预案执行：设卡拦截象群通道、疏散周边村寨群众、无人机持续追踪象群动向、医疗与后勤保障待命，每步操作实时回传指挥中心。',
    matchKeywords: ['驱离', '封锁', '警戒', '交通', '管制', '疏散', '救援', '后勤', '舆情', '上报', '拦截', '设卡'],
    visualActions: [
      { icon: OctagonAlert, label: '设卡拦截', color: 'text-rose-300' },
      { icon: UsersIcon, label: '人员疏散', color: 'text-rose-400' },
      { icon: Stethoscope, label: '医疗救援', color: 'text-pink-300' },
      { icon: Truck, label: '后勤保障', color: 'text-orange-300' },
    ],
  },
  {
    key: 'archive',
    label: '结案归档',
    icon: Archive,
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
    border: 'border-emerald-400/30',
    text: 'text-emerald-300',
    responsible: '管理中心 / 系统管理员',
    desc: '象群驱离至安全区域后，系统自动生成1.5小时风险推演与AI评估报告，管理员确认结案归档，全流程数据永久留痕，案件进入结案状态不可修改。',
    matchKeywords: ['复盘', '留痕', '结案', '归档', '报告', '存档', '总结'],
    visualActions: [
      { icon: FileText, label: '生成报告', color: 'text-emerald-300' },
      { icon: RotateCcw, label: '复盘留痕', color: 'text-emerald-400' },
      { icon: Archive, label: '归档存档', color: 'text-teal-300' },
    ],
  },
]

/* 根据步骤标题匹配所属阶段 */
function matchStage(title: string): number {
  for (let i = 0; i < STAGES.length; i++) {
    if (STAGES[i].matchKeywords.some((kw) => title.includes(kw))) return i
  }
  return 1 // 默认归到研判分析
}

/* 将 workflow.steps 按阶段分组 */
function groupStepsByStage(steps: WorkflowStep[]): Record<number, WorkflowStep[]> {
  const groups: Record<number, WorkflowStep[]> = {}
  steps.forEach((s) => {
    const idx = matchStage(s.title)
    if (!groups[idx]) groups[idx] = []
    groups[idx].push(s)
  })
  return groups
}

export default function DisposalPlanVisual({ workflow, currentStageIdx = 1 }: Props) {
  const [modalStage, setModalStage] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setMounted(true)
    const t = setTimeout(() => setProgress(((currentStageIdx + 1) / STAGES.length) * 100), 200)
    return () => clearTimeout(t)
  }, [currentStageIdx])

  const grouped = groupStepsByStage(workflow.steps || [])
  const totalSteps = workflow.steps?.length || 0
  const doneSteps = workflow.steps?.filter((s) => s.status === 'done').length || 0

  const activeStage = modalStage !== null ? STAGES[modalStage] : null
  const activeStageSteps = modalStage !== null ? (grouped[modalStage] || []) : []

  return (
    <div className="space-y-4">
      {/* AI 总述条 */}
      {workflow.aiSummary && (
        <div
          className={`rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-cyan-500/5 p-4 transition-all duration-300 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20">
              <BrainCircuit size={13} className="text-violet-300" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-violet-300">AI 处置总述</div>
              <p className="mt-0.5 text-[13px] leading-6 text-slate-200">{workflow.aiSummary}</p>
            </div>
          </div>
        </div>
      )}

      {/* 进度总览条 */}
      <div
        className={`flex items-center gap-3 rounded-xl border border-slate-600/40 bg-slate-800/50 px-4 py-3 transition-all duration-300 delay-75 ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <Zap size={15} className="shrink-0 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">处置进度</span>
            <span className="text-slate-300">
              {doneSteps}/{totalSteps} 步骤完成 · 当前第 {currentStageIdx + 1} 阶段
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 五阶段横向流程（桌面端） */}
      <div className="relative hidden md:block">
        <div className="relative grid grid-cols-5 gap-2">
          {STAGES.map((stage, idx) => {
            const StageIcon = stage.icon
            const isActive = idx === currentStageIdx
            const isPast = idx < currentStageIdx
            const stageSteps = grouped[idx] || []

            return (
              <div
                key={stage.key}
                className={`transition-all duration-300 ${
                  mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: `${idx * 80}ms` }}
              >
                <div
                  onClick={() => setModalStage(idx)}
                  className={`group relative cursor-pointer rounded-xl border bg-gradient-to-b p-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${stage.gradient} ${
                    isActive
                      ? `${stage.border} ring-2 ring-offset-1 ring-offset-slate-900`
                      : isPast
                        ? 'border-slate-600/40 opacity-70'
                        : 'border-purple-500/25 hover:border-purple-500/40'
                  }`}
                  style={
                    isActive
                      ? { boxShadow: `0 0 24px rgba(34,211,238,0.12)` }
                      : {}
                  }
                >
                  {/* 阶段序号 + 图标 */}
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 ${stage.iconBg}`}
                    >
                      {isPast ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <StageIcon size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[12px] font-bold ${isActive ? stage.text : 'text-slate-200'}`}>
                        {idx + 1}. {stage.label}
                      </div>
                      <div className="truncate text-[9px] text-slate-400">{stage.responsible}</div>
                    </div>
                  </div>

                  {/* 状态标签 */}
                  <div className="mt-2 flex items-center gap-1">
                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                        执行中
                      </span>
                    )}
                    {isPast && (
                      <span className="rounded-full bg-slate-600/30 px-1.5 py-0.5 text-[9px] text-slate-400">
                        已完成
                      </span>
                    )}
                    {stageSteps.length > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${stage.iconBg}`}>
                        {stageSteps.length} 步
                      </span>
                    )}
                  </div>

                  {/* 视觉化关键动作图标 */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stage.visualActions.slice(0, 3).map((va, i) => {
                      const VaIcon = va.icon
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-1 rounded-md bg-slate-800/50 px-1.5 py-0.5"
                          title={va.label}
                        >
                          <VaIcon size={10} className={va.color} />
                          <span className="text-[8.5px] text-slate-400">{va.label}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* 阶段流程描述 */}
                  <p className={`mt-2 text-[10px] leading-4 ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                    {stage.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 移动端纵向流程 */}
      <div className="space-y-2 md:hidden">
        {STAGES.map((stage, idx) => {
          const StageIcon = stage.icon
          const isActive = idx === currentStageIdx
          const isPast = idx < currentStageIdx
          const stageSteps = grouped[idx] || []

          return (
            <div key={stage.key} className="relative">
              <div
                onClick={() => setModalStage(idx)}
                className={`group cursor-pointer rounded-xl border bg-gradient-to-b p-3 transition-all duration-200 ${stage.gradient} ${
                  isActive
                    ? `${stage.border} ring-1`
                    : isPast
                      ? 'border-slate-600/40 opacity-70'
                      : 'border-purple-500/25'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${stage.iconBg}`}>
                    {isPast ? <CheckCircle2 size={14} /> : <StageIcon size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-bold ${isActive ? stage.text : 'text-slate-200'}`}>
                      {idx + 1}. {stage.label}
                    </div>
                    <div className="text-[9px] text-slate-400">{stage.responsible}</div>
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                      执行中
                    </span>
                  )}
                </div>
              </div>
              {idx < STAGES.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ChevronRight size={12} className="rotate-90 text-purple-400" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部提示 */}
      <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
        <Clock size={11} />
        <span>点击任意阶段卡片查看详细步骤 · 共 {totalSteps} 个处置步骤</span>
        {workflow.scenario && (
          <span className="ml-auto rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">{workflow.scenario}</span>
        )}
      </div>

      {/* 阶段详情弹窗 */}
      {modalStage !== null && activeStage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModalStage(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl"
            style={{ animation: 'modalFadeIn 200ms ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className={`flex items-center gap-3 border-b border-slate-600/40 bg-gradient-to-r ${activeStage.gradient} px-5 py-4`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activeStage.iconBg}`}>
                {(() => {
                  const Icon = activeStage.icon
                  return <Icon size={18} />
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[14px] font-bold ${activeStage.text}`}>
                  {modalStage + 1}. {activeStage.label}
                </div>
                <div className="text-[11px] text-slate-400">{activeStage.responsible}</div>
              </div>
              <button
                onClick={() => setModalStage(null)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-r from-slate-800 to-slate-900 text-slate-400 transition-colors duration-150 hover:bg-slate-800/60 hover:text-slate-200"
              >
                <X size={15} />
              </button>
            </div>

            {/* 内容区 */}
            <div className="max-h-[calc(85vh-80px)] overflow-y-auto px-5 py-4">
              {/* 阶段描述 */}
              <div className="mb-4">
                <div className="mb-1.5 text-[11px] font-semibold text-slate-400">阶段描述</div>
                <p className="text-[13px] leading-6 text-slate-300">{activeStage.desc}</p>
              </div>

              {/* 关键处置动作 */}
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-semibold text-slate-400">关键处置动作</div>
                <div className="flex flex-wrap gap-2">
                  {activeStage.visualActions.map((va, i) => {
                    const VaIcon = va.icon
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2 transition-transform duration-150 hover:scale-105"
                      >
                        <VaIcon size={13} className={va.color} />
                        <span className="text-[11.5px] text-slate-300">{va.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 本阶段具体步骤 */}
              {activeStageSteps.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-semibold text-slate-400">
                    本阶段步骤（{activeStageSteps.length}）
                  </div>
                  <ul className="space-y-2">
                    {activeStageSteps.map((s, i) => (
                      <li
                        key={s.id || i}
                        className="rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-2.5 transition-colors duration-150 hover:bg-gradient-to-r from-slate-800 to-slate-900"
                      >
                        <div className="flex items-start gap-2">
                          <ChevronRight size={12} className={`mt-0.5 shrink-0 ${activeStage.text}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12.5px] font-medium text-slate-200">{s.title}</span>
                              {s.status === 'done' && (
                                <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                              )}
                            </div>
                            {s.description && (
                              <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{s.description}</p>
                            )}
                            {s.assignedRole && (
                              <div className="mt-1 text-[10px] text-slate-400">负责：{s.assignedRole}</div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
