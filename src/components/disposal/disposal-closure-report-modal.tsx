'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Film, Loader2, CheckCircle2, Download, Eye, AlertTriangle, X, Sparkles } from 'lucide-react'
import type { TrainingTask, CaseReport } from '@/lib/utils/util-app-types'
import type { DisposalWorkflow } from '@/lib/store/store-disposal-workflows'
import { buildClosureReport } from '@/lib/ai/ai-report-generator'
import { generateReportVideo, canGenerateVideo, videoSessionCache, type ReportVideoResult } from '@/lib/ai/ai-video-report-generator'

interface Props {
  task: TrainingTask
  wf?: DisposalWorkflow | null
  currentName?: string
  /** 已有结案报告（查看/编辑场景） */
  existingReport?: CaseReport | null
  /** 确认并存档：携带（可手动修改的）文字与视频数据 */
  onConfirm: (report: CaseReport) => void
  onClose: () => void
}

/** 视频持久化体积上限（KB）：超过则只保存元数据，dataURL 不随警情写 localStorage（配额安全） */
const VIDEO_PERSIST_LIMIT_KB = 1200

export default function ClosureReportModal({ task, wf, currentName, existingReport, onConfirm, onClose }: Props) {
  const [text, setText] = useState<string>('')
  const [video, setVideo] = useState<ReportVideoResult | null>(null)
  const [genVideo, setGenVideo] = useState(false)
  const [videoErr, setVideoErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [aiStatus, setAiStatus] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)

  // 打开时自动起草（复用已有报告文字，否则先由规则引擎起草，随后用真实 AI 报告替换）
  useEffect(() => {
    const draft = existingReport?.text || buildClosureReport(task, wf)
    setText(draft)
    // 真实 AI 评估报告：调用服务端 /api/ai-analysis/report（真实大模型生成）。
    // AI 失败时保留规则引擎起草稿并明确标注，绝不把模板冒充为 AI。
    if (!existingReport) {
      setAiStatus('AI 正在生成结案报告…')
      fetch('/api/ai-analysis/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, workflow: wf || null }),
      })
        .then((r) => (r.ok ? r.json() : Promise.resolve(null)))
        .then((d) => {
          if (d && d.ai === true && typeof d.report === 'string' && d.report.trim().length > 0) {
            setText(d.report)
            setAiStatus('')
          } else {
            setAiStatus(d?.reason ? `AI 报告生成失败（${d.reason}），已回退规则引擎起草` : 'AI 报告生成失败，已回退规则引擎起草')
          }
        })
        .catch(() => setAiStatus('AI 报告生成失败，已回退规则引擎起草'))
    }
    // 若已有报告且带视频，优先用持久化的 dataUrl，其次会话缓存
    const cached = task.id ? videoSessionCache.get(task.id) : undefined
    const existingUrl = existingReport?.videoDataUrl || cached
    if (existingUrl) {
      setVideo({
        blob: new Blob([]),
        dataUrl: existingUrl,
        name: existingReport?.videoName || `结案复盘_${task.id}.webm`,
        sizeKb: existingReport?.videoSizeKb || 0,
      })
    } else {
      setVideo(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canVideo = useMemo(() => canGenerateVideo(), [])

  const handleGenVideo = async () => {
    setGenVideo(true)
    setVideoErr(null)
    try {
      const res = await generateReportVideo(task, wf, text)
      setVideo(res)
    } catch (e: any) {
      setVideoErr(e?.message || '视频生成失败')
    } finally {
      setGenVideo(false)
    }
  }

  const handleConfirm = () => {
    if (submitting) return
    setSubmitting(true)
    // 配额安全：视频过大则不随警情持久化（只存元数据），dataURL 留在会话缓存供本次预览/下载
    let videoDataUrl: string | undefined = video?.dataUrl
    let videoPersisted = !!video
    if (video && video.sizeKb >= VIDEO_PERSIST_LIMIT_KB) {
      videoDataUrl = undefined
      videoPersisted = false
    }
    const report: CaseReport = {
      text: text.trim(),
      videoName: video?.name,
      videoDataUrl,
      videoSizeKb: video?.sizeKb,
      videoPersisted,
      generatedAt: existingReport?.generatedAt || new Date().toISOString(),
      editedBy: currentName || '管理员',
      archivedAt: existingReport?.archivedAt,
    }
    onConfirm(report)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-purple-500/25 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-purple-500/25 bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5">
          <FileText size={18} className="text-amber-300" />
          <h3 className="text-base font-semibold text-slate-100">
            {existingReport ? '查看 / 编辑结案报告' : '生成结案报告 · 结案归档'}
          </h3>
          <span className="ml-auto rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] text-violet-200 ring-1 ring-violet-400/30">
            {task.id}
          </span>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* 内容（可滚动） */}
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-5 text-slate-400">
            系统已根据警情与处置工单自动起草结案文字总结，<span className="text-amber-300">可手动修改</span>，确认后存档到该警情。
          </p>

          {aiStatus && (
            <p className="flex items-start gap-1.5 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[12px] leading-5 text-fuchsia-100">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-fuchsia-300" /> {aiStatus}
            </p>
          )}

          {/* 文字报告（可编辑） */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
              <FileText size={13} className="text-cyan-300" /> 结案文字总结（可编辑）
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-56 w-full resize-y rounded-lg border border-purple-500/25 bg-slate-800/80 p-3 font-mono text-[12px] leading-5 text-slate-200 outline-none focus:border-cyan-400/50"
              spellCheck={false}
            />
          </div>

          {/* 视频生成 */}
          <div className="rounded-lg border border-purple-500/25 bg-slate-800/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
                <Film size={13} className="text-fuchsia-300" /> 关联复盘视频
              </span>
              {!canVideo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-400/30">
                  当前浏览器不支持录制
                </span>
              )}
              {video && (
                <span className="text-[11px] text-slate-400">
                  {video.name} · {video.sizeKb} KB
                </span>
              )}
              {canVideo && (
                <button
                  onClick={handleGenVideo}
                  disabled={genVideo}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50"
                >
                  {genVideo ? <Loader2 size={12} className="animate-spin" /> : <Film size={12} />}
                  {genVideo ? '生成中…' : video ? '重新生成视频' : '生成复盘视频'}
                </button>
              )}
            </div>

            {videoErr && (
              <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {videoErr}（仍可仅以文字报告存档）
              </p>
            )}

            {video ? (
              <div className="space-y-2">
                <video ref={videoRef} src={video.dataUrl} controls className="w-full rounded-md bg-black" />
                <a
                  href={video.dataUrl}
                  download={video.name}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/40 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800/50"
                >
                  <Download size={12} /> 下载视频
                </a>
                {videoPersistedHint(video)}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">暂无复盘视频，可点击上方按钮生成</p>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-purple-500/25 bg-slate-800/50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600/40 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800/50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-slate-100 transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {existingReport ? '保存修改' : '确认结案归档'}
          </button>
        </div>
      </div>
    </div>
  )
}

function videoPersistedHint(video: ReportVideoResult) {
  if (video.sizeKb >= VIDEO_PERSIST_LIMIT_KB) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
        <AlertTriangle size={12} /> 视频较大（{video.sizeKb}KB），本次仅存档元数据，视频文件可下载保存
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
      <Eye size={12} /> 视频将随警情一并存档，可在「查看结案报告」中回放。
    </p>
  )
}
