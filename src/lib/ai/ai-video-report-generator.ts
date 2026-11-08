/**
 * @/lib/ai-llm-client/reportVideo.ts
 * 结案复盘视频生成（纯前端，浏览器内）。
 *
 * 采用 Canvas.captureStream() + MediaRecorder 录制一段约 6 秒的
 * 结案复盘动画（标题 + 滚动文字），输出 WebM（优先）或 MP4。
 * 不支持的浏览器抛清晰错误，由调用方优雅降级（只保留文字报告）。
 *
 * 配额安全：视频 base64 可能较大，持久化前由调用方判断是否随警情写入。
 * 本模块维护一个「会话内」缓存 videoSessionCache，即使因体积未持久化，
 * 当前会话内仍可在「查看/编辑结案报告」中预览与下载。
 */
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { DisposalWorkflow } from '@/lib/store/store-disposal-workflows'

export interface ReportVideoResult {
  blob: Blob
  dataUrl: string
  name: string
  sizeKb: number
}

/** 会话内视频缓存：taskId -> dataURL（未持久化时也能当次会话预览/下载） */
export const videoSessionCache = new Map<string, string>()

/** 当前环境是否支持浏览器内视频录制 */
export function canGenerateVideo(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as any
  return (
    typeof w.MediaRecorder !== 'undefined' &&
    typeof w.HTMLCanvasElement !== 'undefined' &&
    typeof w.HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  const cands = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ]
  for (const c of cands) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      /* ignore */
    }
  }
  return ''
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error || new Error('读取视频失败'))
    r.readAsDataURL(blob)
  })
}

/** 将一段文字绘制为一帧（深色大屏风格 + 顶部标题 + 滚动正文） */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  lines: string[],
  progress: number,
) {
  // 背景渐变
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#0b1220')
  g.addColorStop(1, '#0f1f3a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // 顶部标题条
  ctx.fillStyle = 'rgba(245,158,11,0.92)'
  ctx.fillRect(0, 0, w, 54)
  ctx.fillStyle = '#0a0a0a'
  ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 20, 28)

  // 边框
  ctx.strokeStyle = 'rgba(148,163,184,0.35)'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 62, w - 16, h - 70)

  // 正文：随 progress 向上滚动，逐行淡入
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '18px "PingFang SC","Microsoft YaHei",sans-serif'
  const lineH = 26
  const x = 24
  const top = 86
  const visible = Math.floor((h - top - 16) / lineH)
  const startIdx = Math.max(0, Math.floor(progress * Math.max(0, lines.length - visible)))
  const shown = lines.slice(startIdx, startIdx + visible + 1)
  shown.forEach((ln, i) => {
    const y = top + i * lineH
    ctx.globalAlpha = i === shown.length - 1 ? 1 - (progress % 0.06) * 6 : 1
    ctx.fillText(ln, x, y)
  })
  ctx.globalAlpha = 1

  // 进度条
  ctx.fillStyle = 'rgba(16,185,129,0.85)'
  ctx.fillRect(8, h - 12, (w - 16) * Math.min(1, progress), 4)
}

/**
 * 生成结案复盘视频。
 * @throws 当浏览器不支持录制时抛 Error（调用方据此降级）
 */
export async function generateReportVideo(
  task: TrainingTask | undefined,
  wf: DisposalWorkflow | null | undefined,
  reportText: string,
): Promise<ReportVideoResult> {
  if (!canGenerateVideo()) {
    throw new Error('当前浏览器不支持视频录制（缺少 MediaRecorder / canvas.captureStream）')
  }
  const width = 640
  const height = 360
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文')

  const stream = (canvas as any).captureStream(30) as MediaStream
  const mime = pickMime()
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: BlobPart[] = []
  const stopped = new Promise<void>((resolve) => {
    recorder.ondataavailable = (e: any) => {
      if (e.data && e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => resolve()
  })

  recorder.start()
  const durationMs = 6000
  const start = performance.now()
  const title = '天眼护象 · 警情结案复盘'
  const lines = reportText.split('\n').filter(Boolean)
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = (now - start) / durationMs
      drawFrame(ctx!, width, height, title, lines, Math.min(1, t))
      if (now - start >= durationMs) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  recorder.stop()
  await stopped

  const blob = new Blob(chunks, { type: mime || 'video/webm' })
  const dataUrl = await blobToDataUrl(blob)
  const sizeKb = Math.round(blob.size / 1024)
  const ext = mime && mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm'
  const name = `结案复盘_${task?.id || 'case'}_${Date.now()}.${ext}`

  // 会话内缓存（即使未持久化也可预览/下载）
  if (task?.id) videoSessionCache.set(task.id, dataUrl)

  return { blob, dataUrl, name, sizeKb }
}
