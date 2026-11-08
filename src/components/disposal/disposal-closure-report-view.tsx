'use client'

import { FileText, Film, Download, Eye, Clock, UserCog, Archive, AlertTriangle } from 'lucide-react'
import type { CaseReport } from '@/lib/utils/util-app-types'
import { videoSessionCache } from '@/lib/ai/ai-video-report-generator'

interface Props {
  report: CaseReport
  /** 用于会话内视频缓存回退（刷新前生成过视频但体积过大未持久化） */
  taskId?: string
}

function fmt(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

/** 只读展示一份已存档的结案报告（文字总结 + 关联复盘视频）。 */
export default function ClosureReportView({ report, taskId }: Props) {
  // 视频源：持久化 dataUrl 优先，其次会话内缓存（videoSessionCache 直接存 dataUrl 字符串）
  const cacheUrl = taskId ? videoSessionCache.get(taskId) : undefined
  const videoUrl = report.videoDataUrl || cacheUrl
  const hasVideo = !!videoUrl

  return (
    <div className="dv-panel rounded-xl p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-200">
        <FileText size={16} /> 结案报告
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200 ring-1 ring-emerald-400/30">
          <Archive size={11} /> 已存档
        </span>
      </h3>

      {/* 元数据 */}
      <div className="mb-3 grid grid-cols-1 gap-2 rounded-md border border-slate-700/40 bg-slate-800/30 p-3 text-[11px] text-slate-400 sm:grid-cols-3">
        <span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-500" /> 生成：{fmt(report.generatedAt)}</span>
        <span className="flex items-center gap-1.5"><UserCog size={12} className="text-slate-500" /> 编辑：{report.editedBy || '管理员'}</span>
        <span className="flex items-center gap-1.5"><Archive size={12} className="text-slate-500" /> 归档：{fmt(report.archivedAt)}</span>
      </div>

      {/* 文字总结 */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
          <FileText size={13} className="text-cyan-300" /> 结案文字总结
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700/50 bg-slate-950/50 p-3 text-[12px] leading-6 text-slate-200">
{report.text}
        </pre>
      </div>

      {/* 关联视频 */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
          <Film size={13} className="text-fuchsia-300" /> 关联复盘视频
        </div>
        {hasVideo ? (
          <div className="space-y-2 rounded-md border border-slate-700/50 bg-slate-800/30 p-3">
            <video src={videoUrl} controls className="w-full rounded-md bg-black" />
            <div className="flex items-center gap-2">
              <a
                href={videoUrl}
                download={report.videoName || `结案复盘_${taskId || 'task'}.webm`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/60 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700/40"
              >
                <Download size={12} /> 下载视频
              </a>
              {report.videoPersisted ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><Eye size={12} /> 已随警情存档</span>
              ) : (
                <span className="text-[11px] text-amber-300">仅当前会话内可预览/下载</span>
              )}
            </div>
          </div>
        ) : report.videoName ? (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-5 text-amber-200">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            该复盘视频体积较大，未随警情持久化（仅生成会话内可用）。如需回放，请在原处置界面重新生成。
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">本案以文字报告存档（无关联视频）。</p>
        )}
      </div>
    </div>
  )
}
