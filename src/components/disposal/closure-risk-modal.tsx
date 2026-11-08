'use client'

import { useState, useEffect } from 'react'
import {
  X, Activity, BrainCircuit, Sparkles, CheckCircle2,
  Loader2, AlertTriangle, ShieldCheck, FileText, Archive,
  TrendingUp, TrendingDown, Minus, Clock, MapPin,
} from 'lucide-react'
import { RiskSimulationPanel } from './disposal-risk-simulation-panel'

/* ──────────────────────────────────────────────
   结案归档前：1.6小时风险推演与AI评估报告模态框
   流程：展示风险推演 → 生成AI评估报告 → 确认归档
   ────────────────────────────────────────────── */

interface TaskLike {
  id: string
  name?: string
  warningLevel?: string
  intrusionRisk?: number
  detectedCount?: number
  location?: string
  isNight?: boolean
  weather?: string
  lat?: number
  lng?: number
  province?: string
  city?: string
  county?: string
  township?: string
  alertType?: string
  aiSummary?: string
  status?: string
}

interface Props {
  task: TaskLike
  existingReport?: string
  existingReportModel?: string
  archiving: boolean
  archiveError?: string | null
  onClose: () => void
  onConfirmArchive: (reportText?: string, reportModel?: string) => void
}

/* AI 评估报告结构化解析（从自由文本中提取关键段落） */
function parseAiReport(text: string): {
  riskLevel: string
  trend: string
  suggestions: string[]
  archiveAdvice: string
  raw: string
} {
  const lines = text.split('\n').filter((l) => l.trim())
  const result = {
    riskLevel: '中等风险',
    trend: '风险趋稳',
    suggestions: [] as string[],
    archiveAdvice: '建议归档',
    raw: text,
  }

  // 已知风险等级关键词（按长度从长到短排列，优先匹配更精确的表述）
  const RISK_KEYWORDS = ['极高风险', '高风险', '较高风险', '中等风险', '中风险', '较低风险', '低风险', '红色预警', '橙色预警', '黄色预警', '蓝色预警', '极高', '高', '中', '低']

  /** 规范化风险等级：优先提取已知关键词，否则截取短句，过长则截断 */
  function normalizeRiskLevel(raw: string): string {
    const text = raw.trim()
    if (!text) return '中等风险'
    // 1. 优先匹配已知风险等级关键词
    for (const kw of RISK_KEYWORDS) {
      if (text.includes(kw)) return kw
    }
    // 2. 文本很短（<15字）直接使用
    if (text.length < 15) return text
    // 3. 尝试截取第一个句号/逗号/换行之前的内容
    const firstSentence = text.split(/[。，,\n]/)[0].trim()
    if (firstSentence.length > 0 && firstSentence.length <= 30) return firstSentence
    // 4. 仍超过30字符，截断到20字符并加省略号
    if (text.length > 30) return text.slice(0, 20) + '…'
    return text
  }

  for (const line of lines) {
    const l = line.trim()
    // 风险等级：严格匹配行首标签（允许前面有 **、数字序号、-、* 等前缀）
    if (/^(\*\*)?\s*(\d+[.、]\s*)?[-*]?\s*(\*\*)?\s*(风险等级|风险级别)/.test(l)) {
      const m = l.match(/[:：]\s*(.+)/)
      if (m) result.riskLevel = normalizeRiskLevel(m[1].trim())
    } else if (l.includes('趋势') || l.includes('走向')) {
      const m = l.match(/[:：]\s*(.+)/)
      if (m) {
        let t = m[1].trim()
        // 趋势字段长度保护：超过20字符截断
        if (t.length > 20) t = t.slice(0, 20) + '…'
        result.trend = t
      }
    } else if (l.includes('处置建议') || l.includes('建议') || l.match(/^\d+[.、]/)) {
      const clean = l.replace(/^\d+[.、]\s*/, '').replace(/^[-*]\s*/, '')
      if (clean.length > 4 && !clean.includes('风险等级') && !clean.includes('趋势')) {
        result.suggestions.push(clean)
      }
    } else if (l.includes('归档') || l.includes('结案')) {
      const m = l.match(/[:：]\s*(.+)/)
      if (m) {
        let a = m[1].trim()
        // 归档建议长度保护：超过100字符截取第一句
        if (a.length > 100) {
          const firstSentence = a.split(/[。！？\n]/)[0].trim()
          a = firstSentence.length > 0 ? firstSentence + '。' : a.slice(0, 100) + '…'
        }
        result.archiveAdvice = a
      }
    }
  }

  if (result.suggestions.length === 0) {
    result.suggestions = lines.slice(0, 5).map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l.length > 4)
  }

  return result
}

export default function ClosureRiskModal({
  task,
  existingReport,
  existingReportModel,
  archiving,
  archiveError,
  onClose,
  onConfirmArchive,
}: Props) {
  const [aiReport, setAiReport] = useState(existingReport || '')
  const [aiReportModel, setAiReportModel] = useState(existingReportModel || '')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [reportGenerated, setReportGenerated] = useState(!!existingReport)

  useEffect(() => {
    if (existingReport) {
      setAiReport(existingReport)
      setAiReportModel(existingReportModel || '')
      setReportGenerated(true)
    }
  }, [existingReport, existingReportModel])

  const generateAiReport = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiError(null)
    setAiReport('')

    try {
      // 拉取处置工单用于报告生成
      const wfRes = await fetch(`/api/disposal?taskId=${encodeURIComponent(task.id)}`, { cache: 'no-store' })
      const wfData = await wfRes.json().catch(() => null)
      const wf = wfData?.workflow || wfData || null

      const r = await fetch('/api/ai-analysis/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, workflow: wf }),
      })
      const d = await r.json().catch(() => ({}))

      if (r.ok && d.ai === true && typeof d.report === 'string' && d.report.trim().length > 0) {
        setAiReport(d.report)
        setAiReportModel(d.model || 'minimax/minimax-m3:free')
        setReportGenerated(true)
      } else {
        setAiError(d?.reason || 'AI 评估报告生成失败')
      }
    } catch (e: any) {
      setAiError(e?.message || 'AI 评估报告生成失败')
    } finally {
      setAiLoading(false)
    }
  }

  // 模态框打开时自动生成AI评估报告（除非已有报告）
  useEffect(() => {
    if (existingReport || reportGenerated) return
    const t = setTimeout(() => { generateAiReport() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parsed = reportGenerated && aiReport ? parseAiReport(aiReport) : null

  const trendIcon = parsed?.trend.includes('上升') || parsed?.trend.includes('升高')
    ? <TrendingUp size={14} className="text-red-400" />
    : parsed?.trend.includes('下降') || parsed?.trend.includes('趋缓')
      ? <TrendingDown size={14} className="text-green-400" />
      : <Minus size={14} className="text-yellow-400" />

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => !archiving && !aiLoading && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-purple-500/25 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/20">
              <Activity size={17} className="text-cyan-300" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-100">1.6小时风险推演与AI评估报告</h2>
              <p className="text-[10.5px] text-slate-400">结案归档前的最终风险研判与智能评估</p>
            </div>
          </div>
          <button
            onClick={() => !archiving && !aiLoading && onClose()}
            disabled={archiving || aiLoading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容区（可滚动） */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 警情摘要条 */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-600/40 bg-slate-800/50 px-3 py-2.5">
            <MapPin size={13} className="shrink-0 text-cyan-300" />
            <span className="text-[12px] font-medium text-slate-200">{task.name || task.alertType || '象群警情'}</span>
            <span className="text-[10px] text-slate-400">
              {[task.province, task.city, task.county, task.township].filter(Boolean).join(' / ') || '位置未知'}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
              <Clock size={10} />
              推演窗口 1.6 小时
            </span>
          </div>

          {/* 风险推演区域 */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity size={14} className="text-cyan-300" />
              <span className="text-[12px] font-semibold text-slate-200">风险推演</span>
            </div>
            <RiskSimulationPanel
              task={{
                id: task.id,
                name: task.name,
                warningLevel: task.warningLevel,
                intrusionRisk: task.intrusionRisk,
                detectedCount: task.detectedCount,
                location: [task.province, task.city, task.county, task.township].filter(Boolean).join('/'),
                isNight: task.isNight,
                weather: task.weather,
              }}
            />
          </div>

          {/* 分隔线 */}
          <div className="border-t border-slate-600/40" />

          {/* AI 评估报告区域 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BrainCircuit size={14} className="text-violet-300" />
                <span className="text-[12px] font-semibold text-slate-200">AI 评估报告</span>
              </div>
              {!reportGenerated && (
                <button
                  onClick={generateAiReport}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-slate-100 transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {aiLoading ? '生成中…' : 'AI评估报告生成'}
                </button>
              )}
            </div>

            {aiError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                <AlertTriangle size={13} />
                {aiError}
              </div>
            )}

            {!reportGenerated && !aiLoading && !aiError && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-600/40 bg-slate-800/50 py-8">
                <BrainCircuit size={28} className="text-purple-400" />
                <p className="text-[12px] text-slate-400">点击「AI评估报告生成」获取智能评估结论</p>
                <p className="text-[10px] text-purple-400">报告包含风险等级、象群趋势、处置建议、归档建议</p>
              </div>
            )}

            {aiLoading && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/5 py-8">
                <Loader2 size={20} className="animate-spin text-violet-300" />
                <span className="text-[12px] text-violet-200">AI 正在生成评估报告…</span>
              </div>
            )}

            {reportGenerated && parsed && (
              <div className="space-y-3 animate-[fadeIn_0.3s_ease-out]">
                {/* 结构化指标卡片 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-transparent p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-300/80">
                      <AlertTriangle size={11} /> 风险等级
                    </div>
                    <div className="mt-1 text-[15px] font-bold text-amber-200">{parsed.riskLevel}</div>
                  </div>
                  <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-transparent p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-cyan-300/80">
                      <Activity size={11} /> 象群趋势
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {trendIcon}
                      <span className="text-[13px] font-bold text-cyan-200">{parsed.trend}</span>
                    </div>
                  </div>
                </div>

                {/* 处置建议 */}
                {parsed.suggestions.length > 0 && (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-emerald-300" />
                      <span className="text-[11px] font-semibold text-emerald-200">处置建议</span>
                    </div>
                    <ul className="space-y-1.5">
                      {parsed.suggestions.slice(0, 5).map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11.5px] leading-5 text-slate-300">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-300">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 归档建议 */}
                <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Archive size={13} className="text-violet-300" />
                    <span className="text-[11px] font-semibold text-violet-200">归档建议</span>
                  </div>
                  <p className="text-[11.5px] leading-5 text-slate-300">{parsed.archiveAdvice}</p>
                </div>

                {/* 完整报告原文 */}
                <details className="rounded-xl border border-slate-600/40 bg-slate-800/50 p-3">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200">
                    <FileText size={12} /> 查看完整报告原文
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">{parsed.raw}</p>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between border-t border-purple-500/25 bg-slate-800/80 px-5 py-3">
          <div className="text-[10.5px] text-slate-400">
            {reportGenerated
              ? '评估报告已生成，确认后案件将自动归档完成'
              : '请先生成 AI 评估报告'}
            {archiveError && <span className="ml-2 text-rose-300">{archiveError}</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => !archiving && !aiLoading && onClose()}
              disabled={archiving || aiLoading}
              className="rounded-lg border border-slate-600/40 px-4 py-2 text-[12px] text-slate-300 transition hover:bg-slate-800/50 disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={() => onConfirmArchive(aiReport, aiReportModel)}
              disabled={!reportGenerated || archiving || aiLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-[12px] font-bold text-slate-100 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {archiving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              {archiving ? '归档中…' : '确认归档'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
