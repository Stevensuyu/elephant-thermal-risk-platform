'use client'

import { useCallback, useEffect, useState } from 'react'
import { Save, Loader2, Workflow, ShieldCheck, FileText, Plus, Trash2, RotateCcw, Radar, BrainCircuit, Users, ShieldAlert, Archive, ChevronDown, ChevronRight, Activity, ArrowRight } from 'lucide-react'
import type { RoleId } from '@/lib/auth/auth-role-permissions'

/**
 * 处置流程「后台可配置」面板（设置 → 处置流程配置）。
 * 满足"让我可以自己去搞"：管理员自助定义
 *   - 是否要求成员逐条"确认完成"（关闭则跳过确认门控）；
 *   - 每个处置步骤类型默认指派给哪个角色（覆盖引擎默认）；
 *   - 处警报告自定义字段（增删改）；
 *   - 是否允许人工修改 AI 生成的处置流程。
 * 全部经 /api/disposal-config 读写 storage/disposal-config.json。
 *
 * 注意：本组件刻意不引入带 fs 的 disposalConfig.ts，常量在此内联，
 * 仅通过 HTTP 与后台打交道，避免误拽服务端存储进客户端打包。
 */

type StepType = string

const STEP_TYPES: StepType[] = [
  'receive', 'monitor', 'verify', 'broadcast', 'dispatch', 'uav', 'deter',
  'blockade', 'traffic', 'evacuate', 'rescue', 'logistics', 'publicity',
  'report', 'review', 'archive',
]

const ROLE_OPTIONS: RoleId[] = ['admin', 'center', 'street', 'police']

const ROLE_LABEL: Record<RoleId, string> = {
  admin: '系统管理员',
  center: '管理中心',
  street: '街道干部',
  police: '警员',
}

const STEP_LABEL: Record<StepType, string> = {
  receive: '接警受理',
  monitor: '监测锁定',
  verify: '核实研判',
  broadcast: '预警广播',
  dispatch: '人员调度',
  uav: '无人机介入',
  deter: '科学驱离',
  blockade: '封锁警戒',
  traffic: '交通管制',
  evacuate: '群众疏散',
  rescue: '医疗救援',
  logistics: '后勤保障',
  publicity: '舆情引导',
  report: '上报联动',
  review: '复盘留痕',
  archive: '结案归档',
}


// ── 处置预案可视化：五阶段流程定义 ──
interface WorkflowStage {
  key: string
  label: string
  icon: any
  color: string
  bgColor: string
  borderColor: string
  responsible: string
  actions: string[]
  stepTypes: string[]
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    key: 'detect',
    label: '预警发现',
    icon: Radar,
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-400/30',
    responsible: '监测中心 / 无人机巡检',
    actions: ['热成像/可见光实时监测', 'YOLO 象群识别检出', '风险阈值触发预警'],
    stepTypes: ['receive', 'monitor'],
  },
  {
    key: 'analyze',
    label: '研判分析',
    icon: BrainCircuit,
    color: 'text-violet-300',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-400/30',
    responsible: 'AI 研判引擎 / 管理中心',
    actions: ['多维度风险评估（等级/象群构成/昼夜/位置）', 'AI 生成处置方案与建议', '人工确认研判结论'],
    stepTypes: ['verify', 'broadcast'],
  },
  {
    key: 'dispatch',
    label: '力量调度',
    icon: Users,
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-400/30',
    responsible: '管理中心 / 街道干部 / 警员',
    actions: ['按区域分发处置人员', '无人机抵近跟踪锁定', '预警广播通知周边群众'],
    stepTypes: ['dispatch', 'uav', 'broadcast'],
  },
  {
    key: 'handle',
    label: '现场处置',
    icon: ShieldAlert,
    color: 'text-rose-300',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-400/30',
    responsible: '现场警员 / 街道干部 / 后勤保障',
    actions: ['科学驱离象群（声光/食物引导）', '封锁警戒区域 + 交通管制', '群众疏散 + 医疗救援 + 后勤保障', '舆情引导 + 上报联动'],
    stepTypes: ['deter', 'blockade', 'traffic', 'evacuate', 'rescue', 'logistics', 'publicity', 'report'],
  },
  {
    key: 'archive',
    label: '结案归档',
    icon: Archive,
    color: 'text-emerald-300',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-400/30',
    responsible: '管理中心 / 系统管理员',
    actions: ['处置结果复盘留痕', '生成结案报告（文字+视频）', '归档存档并更新警情状态'],
    stepTypes: ['review', 'archive'],
  },
]

const PLAN_TEMPLATES = [
  { key: 'standard', label: '标准预案', desc: '常规象群入侵处置流程，五阶段完整执行' },
  { key: 'emergency', label: '紧急预案', desc: '红色预警/人象冲突时加速处置，合并研判与调度' },
  { key: 'minimal', label: '最小化预案', desc: '蓝色预警/远距离监测，仅监测+研判+上报' },
] as const

interface ReportField {
  key: string
  label: string
  required: boolean
  placeholder?: string
}

interface DisposalConfig {
  requireMemberConfirm: boolean
  roleForStepType: Partial<Record<StepType, RoleId>>
  reportFields: ReportField[]
  allowManualEdit: boolean
}

const DEFAULT_CONFIG: DisposalConfig = {
  requireMemberConfirm: true,
  roleForStepType: {},
  reportFields: [
    { key: 'commander', label: '现场指挥', required: true, placeholder: '现场指挥员姓名' },
    { key: 'result', label: '处置结果', required: true, placeholder: '象群是否已撤离/稳控' },
    { key: 'casualty', label: '人员伤亡/财产损失', required: false, placeholder: '无 / 简述' },
    { key: 'leftover', label: '遗留问题', required: false, placeholder: '需后续跟进的事项' },
  ],
  allowManualEdit: true,
}

export default function DisposalConfigPanel() {
  const [cfg, setCfg] = useState<DisposalConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // 可视化预案状态
  const [planTemplate, setPlanTemplate] = useState<typeof PLAN_TEMPLATES[number]['key']>('standard')
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const [currentStageIdx, setCurrentStageIdx] = useState(1) // 模拟当前执行到第2阶段（研判分析）

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/disposal-config', { cache: 'no-store' })
      const d = await r.json()
      if (d.config) setCfg({ ...DEFAULT_CONFIG, ...d.config })
    } catch {
      /* ignore */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      const r = await fetch('/api/disposal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      })
      const d = await r.json()
      if (d.success) {
        setCfg(d.config)
        setSaved(true)
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const setRole = (type: StepType, role: RoleId | '') => {
    setCfg((c) => {
      const next = { ...c.roleForStepType }
      if (role === '') delete next[type]
      else next[type] = role as RoleId
      return { ...c, roleForStepType: next }
    })
  }

  const setField = (idx: number, patch: Partial<ReportField>) => {
    setCfg((c) => ({
      ...c,
      reportFields: c.reportFields.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }))
  }

  const addField = () => {
    setCfg((c) => ({
      ...c,
      reportFields: [...c.reportFields, { key: `field_${Date.now()}`, label: '新字段', required: false, placeholder: '' }],
    }))
  }

  const removeField = (idx: number) => {
    setCfg((c) => ({ ...c, reportFields: c.reportFields.filter((_, i) => i !== idx) }))
  }

  if (!loaded) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">处置流程配置加载中…</div>
  }

  return (
    <div className="space-y-6">
      {/* 顶部说明 + 保存 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3">
        <Workflow size={18} className="text-cyan-300" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-100">处置流程配置（后台可自助定义）</div>
          <div className="text-[11px] text-slate-400">定义「成员确认闭环」规则与处警报告字段，保存后立即对所有新生成工单生效。</div>
        </div>
        {saved && <span className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200">已保存</span>}
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存配置
        </button>
      </div>


      {/* ══ 处置预案可视化流程图 ══ */}
      <section className="dv-panel overflow-hidden p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Activity size={16} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">处置预案可视化流程</h3>
          <span className="text-[10.5px] text-slate-500">五阶段闭环处置模型 · 点击节点展开详情</span>
          {/* 预案模板切换 */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-800/40 p-0.5">
            {PLAN_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => setPlanTemplate(t.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  planTemplate === t.key
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 模板说明 */}
        <div className="mb-3 rounded-md border border-slate-700/40 bg-slate-800/20 px-3 py-1.5 text-[11px] text-slate-400">
          {PLAN_TEMPLATES.find((t) => t.key === planTemplate)?.desc}
        </div>

        {/* 流程图：横向五阶段节点 + 连接线 */}
        <div className="relative">
          {/* 背景连接线（桌面端横向） */}
          <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-cyan-500/30 via-violet-500/30 via-amber-500/30 via-rose-500/30 to-emerald-500/30 md:block" />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:gap-2">
            {WORKFLOW_STAGES.map((stage, idx) => {
              const StageIcon = stage.icon
              const isActive = idx === currentStageIdx
              const isPast = idx < currentStageIdx
              const isExpanded = expandedStage === stage.key
              return (
                <div key={stage.key} className="relative">
                  {/* 节点卡片 */}
                  <div
                    onClick={() => setExpandedStage(isExpanded ? null : stage.key)}
                    className={`relative z-10 cursor-pointer rounded-lg border p-3 transition-all duration-200 hover:shadow-lg ${
                      isActive
                        ? `${stage.borderColor} ${stage.bgColor} ring-2 ring-offset-1 ring-offset-slate-900`
                        : isPast
                        ? 'border-slate-600/40 bg-slate-800/30 opacity-70'
                        : 'border-slate-700/50 bg-slate-800/20 hover:border-slate-600/60'
                    }`}
                    style={isActive ? { boxShadow: `0 0 20px ${stage.color.replace('text-', '').includes('cyan') ? 'rgba(34,211,238,0.15)' : 'rgba(139,92,246,0.15)'}` } : {}}
                  >
                    {/* 阶段序号 + 图标 */}
                    <div className="flex items-center gap-2">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isActive ? stage.bgColor : 'bg-slate-700/40'} ${stage.color}`}>
                        <StageIcon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] font-semibold ${isActive ? stage.color : 'text-slate-200'}`}>
                          {idx + 1}. {stage.label}
                        </div>
                        <div className="text-[10px] text-slate-500">{stage.responsible}</div>
                      </div>
                      {isActive && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          执行中
                        </span>
                      )}
                      {isPast && (
                        <span className="rounded-full bg-slate-600/30 px-1.5 py-0.5 text-[9px] text-slate-400">已完成</span>
                      )}
                      <ChevronDown size={12} className={`shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* 关键动作摘要（非展开时显示前2条） */}
                    {!isExpanded && (
                      <ul className="mt-2 space-y-0.5">
                        {stage.actions.slice(0, 2).map((a, i) => (
                          <li key={i} className="flex items-start gap-1 text-[10.5px] leading-4 text-slate-400">
                            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${isActive ? stage.color.replace('text-', 'bg-') : 'bg-slate-600'}`} />
                            {a}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* 展开详情 */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2 border-t border-slate-700/40 pt-2">
                        <div>
                          <div className="mb-1 text-[10px] font-medium text-slate-500">关键动作</div>
                          <ul className="space-y-1">
                            {stage.actions.map((a, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-300">
                                <ChevronRight size={10} className={`mt-0.5 shrink-0 ${stage.color}`} />
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] font-medium text-slate-500">关联处置步骤</div>
                          <div className="flex flex-wrap gap-1">
                            {stage.stepTypes.map((st) => (
                              <span key={st} className={`rounded px-1.5 py-0.5 text-[9.5px] ${stage.bgColor} ${stage.color}`}>
                                {STEP_LABEL[st] || st}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] font-medium text-slate-500">默认指派角色</div>
                          <div className="text-[11px] text-slate-300">
                            {stage.stepTypes.map((st) => {
                              const role = cfg.roleForStepType[st]
                              return role ? (
                                <span key={st} className="mr-2">
                                  {STEP_LABEL[st] || st} → <span className="text-cyan-300">{ROLE_LABEL[role] || role}</span>
                                </span>
                              ) : null
                            })}
                            {!stage.stepTypes.some((st) => cfg.roleForStepType[st]) && (
                              <span className="text-slate-500">使用引擎默认指派</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 移动端阶段间箭头 */}
                  {idx < WORKFLOW_STAGES.length - 1 && (
                    <div className="flex justify-center py-1 md:hidden">
                      <ArrowRight size={14} className="text-slate-600" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 进度指示条 */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[10.5px] text-slate-500">当前进度</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${((currentStageIdx + 1) / WORKFLOW_STAGES.length) * 100}%` }}
            />
          </div>
          <span className="text-[10.5px] text-slate-400">
            {currentStageIdx + 1}/{WORKFLOW_STAGES.length} 阶段
          </span>
        </div>
      </section>

      {/* 1. 全局开关 */}
      <section className="dv-panel space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <ShieldCheck size={15} className="text-emerald-300" /> 确认门控
        </h3>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={cfg.requireMemberConfirm}
            onChange={(e) => setCfg((c) => ({ ...c, requireMemberConfirm: e.target.checked }))}
            className="h-4 w-4 accent-cyan-500"
          />
          要求指派成员逐条「确认完成」后方可推进（关闭则跳过确认门控，管理员可直接结案）
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={cfg.allowManualEdit}
            onChange={(e) => setCfg((c) => ({ ...c, allowManualEdit: e.target.checked }))}
            className="h-4 w-4 accent-cyan-500"
          />
          允许人工修改 AI 生成的处置流程（增删步骤 / 改描述 / 改指派角色）
        </label>
      </section>

      {/* 2. 步骤角色映射 */}
      <section className="dv-panel space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Workflow size={15} className="text-violet-300" /> 步骤类型 → 指派角色（覆盖引擎默认）
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STEP_TYPES.map((t) => (
            <div key={t} className="flex items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              <span className="flex-1 text-[13px] text-slate-200">{STEP_LABEL[t] || t}</span>
              <select
                value={cfg.roleForStepType[t] || ''}
                onChange={(e) => setRole(t, e.target.value as RoleId | '')}
                className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="">引擎默认</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 报告自定义字段 */}
      <section className="dv-panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileText size={15} className="text-amber-300" /> 处警报告自定义字段
          </h3>
          <button
            onClick={addField}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[12px] text-cyan-200 transition hover:bg-cyan-500/20"
          >
            <Plus size={12} /> 新增字段
          </button>
        </div>
        <div className="space-y-2">
          {cfg.reportFields.map((f, i) => (
            <div key={f.key + i} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              <input
                value={f.label}
                onChange={(e) => setField(i, { label: e.target.value })}
                placeholder="字段名称"
                className="w-36 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-cyan-400"
              />
              <input
                value={f.placeholder || ''}
                onChange={(e) => setField(i, { placeholder: e.target.value })}
                placeholder="填写提示（可选）"
                className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[12px] text-slate-300 outline-none focus:border-cyan-400"
              />
              <label className="flex items-center gap-1 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
                必填
              </label>
              <button
                onClick={() => removeField(i)}
                className="inline-flex items-center justify-center rounded bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 transition hover:bg-rose-500/25"
                title="删除字段"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {cfg.reportFields.length === 0 && (
            <div className="px-2 py-4 text-center text-[12px] text-slate-500">暂无自定义字段，点击「新增字段」添加。</div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <RotateCcw size={12} /> 配置保存后对所有新生成的处置工单生效；已生成工单沿用生成时的快照。
      </div>
    </div>
  )
}
