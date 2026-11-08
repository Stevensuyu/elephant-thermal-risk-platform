'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, AlertTriangle, MapPinned, ExternalLink, Loader2,
  ShieldAlert, Thermometer, Route, ScanSearch, Cpu, Users, Share2, ClipboardList,
  FlaskConical, FileText,
} from 'lucide-react'
import DisposalTimeline from '@/components/disposal/disposal-timeline-panel'
import ClosureReportView from '@/components/disposal/disposal-closure-report-view'
import { alertEmoji } from '@/lib/utils/util-alert-level-icons'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import { taskStatusLabel } from '@/lib/utils/util-app-types'


/** 是否为推演演示生成的警情（非真实视频） */
const isSimulated = (t: TrainingTask | null): boolean =>
  !!t && (t.simulated === true || t.triggeredBy === 'realtime-demo')

const LEVEL_META: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  RED:    { label: '红色预警', bg: 'bg-red-500',   text: 'text-red-100',   ring: 'ring-red-400/50' },
  ORANGE: { label: '橙色预警', bg: 'bg-orange-500', text: 'text-orange-100', ring: 'ring-orange-400/50' },
  YELLOW: { label: '黄色预警', bg: 'bg-yellow-400', text: 'text-yellow-900', ring: 'ring-yellow-300/50' },
  BLUE:   { label: '蓝色预警', bg: 'bg-cyan-400',  text: 'text-cyan-900',  ring: 'ring-cyan-300/50' },
}

export interface AlertDetailCardProps {
  alertId: string
  /** 警情类型（与 3D 标记一致），用于类型图标 */
  alertType?: string
  onClose: () => void
}

export default function AlertDetailCard({ alertId, alertType, onClose }: AlertDetailCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState<TrainingTask | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setTask(null)
    fetch(`/api/tasks/${alertId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) { setTask(j as TrainingTask); setLoading(false) } })
      .catch((e) => { if (alive) { setError(String(e?.message || e)); setLoading(false) } })
    return () => { alive = false }
  }, [alertId])

  const lv = task ? LEVEL_META[task.warningLevel] : null

  // 是否为真实警情：手动登记，或「实时视频识别」且具备真实摄像头部署坐标（经纬度），
  // 才允许生成处置工单。无坐标的公开直播/样本流不伪造处警流程。
  const isReal =
    !!task &&
    (task.manual === true ||
      (task.triggeredBy === 'realtime-stream' && typeof task.lat === 'number' && typeof task.lng === 'number'))

  // 警情分发层级（与后台 alertStore 逻辑一致）：按预警级别自动下发到对应管理员层级
  const ROLE_LABEL: Record<string, string> = {
    admin: '系统管理员',
    center: '管理中心',
    street: '街道干部',
    police: '警员',
  }
  const distribute = (level: string): string[] => {
    switch (level) {
      case 'RED':
      case 'ORANGE':
        return ['admin', 'center', 'street', 'police']
      case 'YELLOW':
        return ['center', 'street', 'police']
      default:
        return ['street', 'police']
    }
  }
  const distRoles = task ? distribute(task.warningLevel) : []

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dv-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-purple-500/25 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{alertEmoji(alertType)}</span>
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-cyan-100">
                <ShieldAlert size={20} className="text-cyan-300" /> 警情处置详情
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" /> 加载警情详情…
          </div>
        ) : error || !task ? (
          <p className="flex items-center gap-1.5 py-8 text-center text-sm text-rose-300"><AlertTriangle size={15} /> 警情详情加载失败：{error || '未找到'}</p>
        ) : (
          <div className="space-y-4">
            {/* 紧急程度 + 类型 */}
            <div className="flex flex-wrap items-center gap-2">
              {lv && <span className={`rounded-full px-3 py-1 text-sm font-bold ${lv.bg} ${lv.text} ring-2 ${lv.ring}`}>{lv.label}</span>}
              {alertType && (
                <span className="rounded-full bg-slate-800/60 px-3 py-1 text-sm text-slate-200">
                  {alertEmoji(alertType)} {alertType}
                </span>
              )}
              {isSimulated(task) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">
                  <FlaskConical size={13} /> 推演演示 · 非真实视频
                </span>
              )}
              <span className="rounded-full bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-1 text-xs text-slate-400">
                状态：{taskStatusLabel(task.status)}
              </span>
            </div>

            {/* 简要描述 */}
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                <AlertTriangle size={15} className="text-amber-300" /> 简要描述
              </div>
              <p className="rounded-md bg-slate-800/50 p-3 text-sm leading-6 text-slate-200">
                {task.aiSummary || task.name}
              </p>
            </div>

            {/* 关键指标 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-purple-500/25 bg-slate-800/50 p-3">
                <div className="flex items-center gap-1 text-xs text-slate-400"><Thermometer size={13} className="text-rose-300" /> 风险指数</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{task.intrusionRisk}</div>
              </div>
              <div className="rounded-md border border-purple-500/25 bg-slate-800/50 p-3">
                <div className="flex items-center gap-1 text-xs text-slate-400"><ScanSearch size={13} className="text-sky-300" /> 检测数量</div>
                <div className="mt-1 text-xl font-bold text-slate-100">{task.detectedCount}</div>
              </div>
              <div className="rounded-md border border-purple-500/25 bg-slate-800/50 p-3">
                <div className="flex items-center gap-1 text-xs text-slate-400"><Route size={13} className="text-emerald-300" /> 预测窗口</div>
                <div className="mt-1 text-sm font-bold text-slate-100">{task.predictionWindow}</div>
              </div>
              <div className="rounded-md border border-purple-500/25 bg-slate-800/50 p-3">
                <div className="flex items-center gap-1 text-xs text-slate-400"><Cpu size={13} className="text-cyan-300" /> 研判来源</div>
                <div className="mt-1 text-sm font-bold text-slate-100">AI 大模型</div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                <ClipboardList size={15} className="text-amber-300" /> AI 处置流程
              </div>
              <DisposalTimeline taskId={alertId} level={task.warningLevel} real={isReal} task={task} />
            </div>

            {task.report && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                  <FileText size={15} className="text-amber-300" /> 结案报告
                </div>
                <ClosureReportView report={task.report} taskId={task.id} />
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                <Users size={15} className="text-violet-300" /> 下发层级
              </div>
              <div className="rounded-md border border-purple-500/25 bg-slate-800/50 p-3">
                <div className="flex items-center gap-2 text-[12px] text-slate-300">
                  <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 text-rose-200">
                    <Share2 size={12} /> 本警情
                  </span>
                  <span className="text-slate-400">↓</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {distRoles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-[12px] font-medium text-violet-100"
                    >
                      <Users size={12} className="text-violet-300" />
                      {ROLE_LABEL[r] || r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 跳转按钮 */}
            <button
              onClick={() => router.push(`/alert/${alertId}`)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:from-violet-500 hover:to-cyan-500"
            >
              <ExternalLink size={16} /> 跳转警情详情页（完整信息）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
