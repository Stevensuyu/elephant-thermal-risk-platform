'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Radio, XCircle, Loader2 } from 'lucide-react'

/**
 * 实时监控 · 本机摄像头检测画面（真实链路）。
 * 展示本地检测服务的 MJPEG 实时流与最新检测结果；未启动时引导去设置页。
 */
const VIDEO_URL = 'http://127.0.0.1:8765/video'

interface LiveDet {
  connected?: boolean
  running?: boolean
  engine?: string
  source?: string
  detected?: boolean
  count?: number
  detected_count?: number
  confidence?: number
  max_confidence?: number
  fps?: number
  detections?: Array<{ track_id?: number; class_name?: string; score?: number; engine?: string }>
  note?: string
}

export default function RealCameraMonitorPanel() {
  const [live, setLive] = useState<LiveDet | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const tick = useCallback(async () => {
    try {
      const r = await fetch('/api/live-detection', { cache: 'no-store' })
      const d = await r.json()
      setLive(d)
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [tick])

  const running = live?.running === true

  return (
    <section className="dv-panel dv-border-corners overflow-hidden">
      <div className="dv-section-header mb-3">
        <div className="dv-section-accent" />
        <Camera size={18} className="text-emerald-400" />
        <h2 className="dv-section-title">实时监控画面</h2>
        {online === false && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-rose-300">
            <XCircle size={11} /> 检测服务未启动
          </span>
        )}
        {online === true && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
            {running ? '真实检测中' : '未运行'}
          </span>
        )}
      </div>

      <div className="relative aspect-video overflow-hidden rounded-lg border border-emerald-400/20 bg-black/85">
        {running ? (
          <img src={VIDEO_URL} alt="本机摄像头实时检测" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
            {loading ? (
              <Loader2 size={26} className="animate-spin text-slate-500" />
            ) : online === false ? (
              <>
                <XCircle size={28} strokeWidth={1} />
                <span className="text-[12px]">本地检测服务未启动</span>
                <span className="text-[10.5px] text-slate-600">运行 start-detect.bat 后刷新本页</span>
              </>
            ) : (
              <>
                <Camera size={28} strokeWidth={1} />
                <span className="text-[12px]">检测未运行</span>
                <span className="text-[10.5px] text-slate-600">请前往 设置 → 设备与通道 启动检测</span>
              </>
            )}
          </div>
        )}

        {running && (
          <>
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> LIVE · {live?.engine}
            </div>
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-emerald-300/90">
              {live?.fps ? `${live.fps.toFixed(1)} FPS` : ''} {live?.source ? `· ${live.source}` : ''}
            </div>
          </>
        )}

        {/* 检测结果叠加信息 */}
        {running && live?.detections && live.detections.length > 0 && (
          <div className="absolute bottom-2 left-2 max-w-[70%] space-y-1">
            {live.detections.slice(0, 4).map((d) => (
              <div key={d.track_id ?? d.class_name} className="flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-[11px] text-slate-200">
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{d.class_name}</span>
                <span className="text-slate-400">{(d.score ?? 0).toFixed(3)}</span>
                <span className="text-[10px] text-slate-500">{d.engine}</span>
              </div>
            ))}
          </div>
        )}
        {running && live?.detected === false && (
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[11px] text-slate-400">
            画面中未检出目标
          </div>
        )}
      </div>
    </section>
  )
}
