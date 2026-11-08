'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cctv, Play, Square, Loader2, Radio, AlertTriangle, Globe2, Film, Trash2, Plus, KeyRound,
  MapPin, Plane, Battery, ArrowUp, Signal, Crosshair, Video, Pause, ChevronLeft,
  ChevronRight, Flame, Eye, Columns2,
} from 'lucide-react'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'
import { getDrones, type ManagedDrone } from '@/lib/store/store-drone-registry'

/**
 * 统一画面中心（感知接入 + 巡检无人机 合并）——
 * 把「实时直播视场」与「巡检无人机大屏」整合为一个中枢，不再分两个画面。
 *
 * 频道（Channel）：实时直播 / 各路在册巡检无人机，顶部一键切换。
 * 视图模式（ViewMode，仅无人机频道有效）：
 *   - 可见光：普通原图画面
 *   - 热成像：若本机配备热成像模块(hasThermal)则切换为热成像样式；否则明确提示「本机未配备热成像模块」，绝不伪造。
 *   - 分屏：左半热成像 + 右半原图（无热成像时左原为占位提示）。
 *
 * 诚实边界：
 *   - 实时直播为可见光摄像头，物理上无 ΔT；热成像按钮在该频道置灰并标注「无热成像」。
 *   - 仅展示已接入真实链路（司空）的无人机；未接入时不显示任何无人机频道，
 *     无真实取流时显示「未接入画面 · 等待真实取流」占位，绝不合成虚假画面。
 *   - 有真实可见光取流的无人机切换热成像时，为可见光转热成像示意样式，明确标注非真实热成像数据。
 *
 * 链路：直播 → /api/video-sources（增删接入点）→ /api/live-source（启停 live_feed.py）
 *      → live_feed.py 写事件 → eventIngest 自动入库研判（地图/预警联动）。
 */

// ───────────────────────── 直播相关类型（移植自 LiveFeed） ─────────────────────────
interface LiveDetection {
  running: boolean
  source?: string
  name?: string
  frame?: number
  detected?: { class: string; confidence: number; bbox_norm: number[] }[]
  max_confidence?: number
  detected_count?: number
  ts?: string
  // /api/live-detection 实时检测端响应的扩展字段（推演演示结构化多目标结果）
  connected?: boolean
  mode?: 'off' | 'demo' | string
  count?: number
  confidence?: number
  detections?: { track_id?: number; class_name?: string; score?: number; bbox_norm?: number[] }[]
}

interface LiveState {
  source: string
  name: string
  startedAt: string
  sourceId?: string
  lat?: number
  lng?: number
  place?: string
}

interface VideoSource {
  id: string
  name: string
  source: string
  lat?: number
  lng?: number
  place?: string
  builtin?: boolean
}

const REAL_DETECT_VIDEO = 'http://127.0.0.1:8765/video'

const CLASS_COLOR: Record<string, string> = {
  elephant: '#00c8ff', person: '#5050ff', dog: '#00ff00', cheetah: '#00a500',
  animal: '#c8c800', device: '#ff00c8',
}

// 纯前端模拟「直播视场」：以 data-URI 渲染一张诚实标注的模拟画面。
// 关键点：<img src> 不受 window.fetch 覆写影响，若指向 /api/live-feed 会直接
// 打到已删除的后端产生 404；这里改用本地 SVG，零网络请求，且明确标注「模拟画面」
// 不伪造真实象群影像（延续项目的诚实边界原则）。
const SIM_LIVE_FRAME =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <radialGradient id="bg" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stop-color="#0b3b2e"/>
          <stop offset="60%" stop-color="#07261d"/>
          <stop offset="100%" stop-color="#03130e"/>
        </radialGradient>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" fill="none" stroke="#0f5d44" stroke-width="0.6" opacity="0.35"/>
        </pattern>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect width="640" height="360" fill="url(#grid)"/>
      <g stroke="#1aa67c" stroke-width="1" opacity="0.5" fill="none">
        <circle cx="320" cy="170" r="120"/>
        <circle cx="320" cy="170" r="78"/>
        <line x1="320" y1="20" x2="320" y2="340"/>
        <line x1="60" y1="170" x2="580" y2="170"/>
      </g>
      <rect x="206" y="150" width="228" height="120" rx="8" fill="none" stroke="#00c8ff" stroke-width="2" opacity="0.85"/>
      <text x="212" y="146" fill="#00c8ff" font-family="monospace" font-size="13" opacity="0.9">elephant 0.98</text>
      <text x="320" y="300" text-anchor="middle" fill="#7fe9c4" font-family="monospace" font-size="14" opacity="0.85">模拟直播视场 · 纯前端演示（可见光 · 无热成像ΔT）</text>
      <text x="320" y="322" text-anchor="middle" fill="#4fae8c" font-family="monospace" font-size="11" opacity="0.7">SIMULATED FEED — NOT REAL FOOTAGE</text>
    </svg>`,
  )

const STATUS_COLOR: Record<string, string> = {
  飞行中: 'text-emerald-300', 巡航: 'text-sky-300', 返航: 'text-orange-300',
  充电中: 'text-amber-300', 待命: 'text-slate-300', 离线: 'text-zinc-400', 故障: 'text-red-300',
}

type Channel = 'live' | 'drone'
type ViewMode = 'visible' | 'thermal' | 'split'

export default function UnifiedFeed({ fleet }: { fleet: Drone[] }) {
  // ── 频道 / 视图模式 ──
  const [channel, setChannel] = useState<Channel>('live')
  const [viewMode, setViewMode] = useState<ViewMode>('visible')

  // 仅展示已接入真实链路（connection === 'connected'）的无人机；未接入不显示
  const drones = useMemo(
    () => fleet.filter((d) => d.connection === 'connected'),
    [fleet],
  )
  const regById = useMemo(() => {
    const m = new Map<string, ManagedDrone>()
    getDrones().forEach((d) => m.set(d.id, d))
    return m
  }, [fleet])

  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const safeIdx = drones.length ? Math.min(idx, drones.length - 1) : 0
  const curDrone = channel === 'drone' ? drones[safeIdx] : undefined
  const curReg = curDrone ? regById.get(curDrone.id) : undefined
  const hasThermal = curReg?.hasThermal === true
  const realStream = curReg?.streamUrl

  // 切换到直播频道时强制可见光源；无热成像无人机同样只允许可见光为底
  const thermalEnabled = channel === 'drone' && hasThermal

  // ── 直播状态（移植自 LiveFeed） ──
  const [sources, setSources] = useState<VideoSource[]>([])
  const [running, setRunning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [state, setState] = useState<LiveState | null>(null)
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [det, setDet] = useState<LiveDetection | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSource, setAddSource] = useState('')
  const [addLat, setAddLat] = useState('')
  const [addLng, setAddLng] = useState('')
  const [addPlace, setAddPlace] = useState('')
  const [addError, setAddError] = useState('')
  const [cookiesOpen, setCookiesOpen] = useState(false)
  const [cookiesText, setCookiesText] = useState('')

  const loadSources = useCallback(async () => {
    try {
      const r = await fetch('/api/video-sources')
      const d = await r.json()
      if (Array.isArray(d.sources)) setSources(d.sources as VideoSource[])
    } catch {
      /* ignore */
    }
  }, [])

  const refreshState = useCallback(async () => {
    try {
      const r = await fetch('/api/live-source')
      const d = await r.json()
      const st = d.state as LiveState | null
      setState(st)
      setStatus((d.status as Record<string, unknown>) || null)
      setRunning(!!st)
      if (st) setImgSrc(SIM_LIVE_FRAME)
      else setImgSrc(null)
    } catch {
      /* ignore */
    }
  }, [])

  const refreshDet = useCallback(async () => {
    try {
      const r = await fetch('/api/live-detection')
      const d = (await r.json()) as LiveDetection
      setDet(d)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadSources()
    refreshState()
    const t1 = setInterval(refreshState, 3000)
    const t2 = setInterval(refreshDet, 700)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [loadSources, refreshState, refreshDet])

  // 无人机频道自动轮播
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (playing && channel === 'drone' && drones.length > 1) {
      timer.current = setInterval(() => setIdx((i) => (i + 1) % drones.length), 6000)
    }
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, drones.length, channel])

  const switchToLive = useCallback(() => {
    setChannel('live')
    setViewMode('visible')
  }, [])

  const switchToDrone = useCallback(
    (i: number) => {
      setChannel('drone')
      setIdx(Math.max(0, Math.min(i, drones.length - 1)))
      setPlaying(false)
    },
    [drones.length],
  )

  const startSource = useCallback(
    async (src: VideoSource) => {
      if (!src.id) return
      setConnecting(true)
      setImgError(false)
      try {
        const r = await fetch('/api/live-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', sourceId: src.id }),
        })
        const d = await r.json()
        if (d.success) {
          setRunning(true)
          setImgSrc(SIM_LIVE_FRAME)
        }
      } catch {
        /* ignore */
      } finally {
        setConnecting(false)
        refreshState()
      }
    },
    [refreshState],
  )

  const stopSource = useCallback(async () => {
    try {
      await fetch('/api/live-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
    } catch {
      /* ignore */
    }
    setRunning(false)
    setImgSrc(null)
    setDet(null)
    refreshState()
  }, [refreshState])

  const deleteSource = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/video-sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        await loadSources()
      } catch {
        /* ignore */
      }
    },
    [loadSources],
  )

  // 提供 YouTube 登录 Cookie（绕过反爬）：带 cookie 重启当前源
  const provideCookies = useCallback(async () => {
    if (!cookiesText.trim() || !state) return
    setConnecting(true)
    try {
      await fetch('/api/live-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          source: state.source,
          sourceId: state.sourceId,
          name: state.name,
          cookies: cookiesText,
        }),
      })
      setCookiesOpen(false)
      refreshState()
    } catch {
      /* ignore */
    } finally {
      setConnecting(false)
    }
  }, [cookiesText, state, refreshState])

  // 一键启动本地象群样本（YouTube 被反爬时仍可验证整条管线）
  const startLocalSample = useCallback(async () => {
    setConnecting(true)
    try {
      await fetch('/api/live-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', source: 'local', name: '本地象群样本' }),
      })
      refreshState()
    } catch {
      /* ignore */
    } finally {
      setConnecting(false)
    }
  }, [refreshState])

  const submitAdd = useCallback(async () => {
    setAddError('')
    if (!addSource.trim()) {
      setAddError('请填写视频源地址（YouTube 链接 / RTSP / 摄像头索引(0) / 文件路径 / local）')
      return
    }
    const lat = addLat.trim() ? Number(addLat) : undefined
    const lng = addLng.trim() ? Number(addLng) : undefined
    if ((addLat.trim() && Number.isNaN(lat)) || (addLng.trim() && Number.isNaN(lng))) {
      setAddError('经纬度需为数字')
      return
    }
    try {
      const r = await fetch('/api/video-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, source: addSource, lat, lng, place: addPlace }),
      })
      const d = await r.json()
      if (!d.success) {
        setAddError(d.error || '新增失败')
        return
      }
      setAddName('')
      setAddSource('')
      setAddLat('')
      setAddLng('')
      setAddPlace('')
      setShowAdd(false)
      await loadSources()
    } catch {
      setAddError('新增失败，请重试')
    }
  }, [addName, addSource, addLat, addLng, addPlace, loadSources])

  const activeSource = sources.find((s) => s.id === state?.sourceId)
  const detectedCount = det?.detected_count ?? det?.count ?? 0
  const maxConf = det?.max_confidence ?? det?.confidence ?? 0
  // 结构化 YOLO 检出：兼容 {class_name,score,bbox_norm,track_id} 与旧字段
  const detections: {
    class: string
    confidence: number
    bbox_norm: number[]
    track_id?: number
  }[] = (det?.detections ?? []).map((d: any) => ({
    class: d.class_name || d.class || 'elephant',
    confidence: d.score ?? d.confidence ?? 0,
    bbox_norm: d.bbox_norm ?? d.bbox ?? [],
    track_id: d.track_id,
  }))

  // 检测端是否处于「可检测」状态：直播源已连接，或推演演示（demo）模式下检测端点返回 connected
  const detActive = !!det && (det.connected === true || det.mode === 'demo')
  const connected = status?.connected === true
  const lastError = (status?.last_error as string) || ''
  const startedAtTs = state?.startedAt ? new Date(state.startedAt).getTime() : 0
  const elapsed = startedAtTs ? (Date.now() - startedAtTs) / 1000 : 0
  const linking = running && !connected && elapsed < 8
  const failed = running && !connected && elapsed >= 8
  const showLive = !!(running && connected && imgSrc && !imgError)

  // 切换视图模式时，若目标模式需要热成像而本机/频道不支持，则不切换（保持可见光为底）
  const pickView = (m: ViewMode) => {
    if (m !== 'visible' && !thermalEnabled) return
    setViewMode(m)
  }

  return (
    <section className="dv-panel p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Video size={20} className="text-cyan-400" />
        <h2 className="dv-title text-lg font-semibold text-slate-200">统一画面中心</h2>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={switchToLive}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
            channel === 'live'
              ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
              : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-emerald-400/40'
          }`}
        >
          <Globe2 size={14} /> 实时直播
        </button>
        <div className="h-5 w-px bg-slate-700/60" />
        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {drones.length === 0 && (
            <span className="text-[11px] text-slate-600">无接入无人机</span>
          )}
          {drones.map((d, i) => {
            const reg = regById.get(d.id)
            const active = channel === 'drone' && i === safeIdx
            return (
              <button
                key={d.id}
                onClick={() => switchToDrone(i)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
                  active
                    ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-cyan-400/40'
                }`}
              >
                <Plane size={12} />
                <span className="max-w-[140px] truncate">{d.name}</span>
                {reg?.hasThermal && (
                  <Flame size={11} className="text-orange-300" />
                )}
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${d.connection === 'connected' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
              </button>
            )
          })}
        </div>
      </div>

      {/* 视图模式控制 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/40 p-1">
          <ViewModeBtn icon={<Eye size={13} />} label="可见光" active={viewMode === 'visible'} onClick={() => pickView('visible')} />
          <ViewModeBtn
            icon={<Flame size={13} />}
            label="热成像"
            active={viewMode === 'thermal'}
            disabled={!thermalEnabled}
            title={!thermalEnabled ? (channel === 'live' ? '实时直播为可见光画面，无热成像' : '本机未配备热成像模块') : undefined}
            onClick={() => pickView('thermal')}
          />
          <ViewModeBtn
            icon={<Columns2 size={13} />}
            label="分屏"
            active={viewMode === 'split'}
            disabled={!thermalEnabled}
            title={!thermalEnabled ? (channel === 'live' ? '无热成像' : '无热成像模块') : undefined}
            onClick={() => pickView('split')}
          />
        </div>
      </div>

      {/* 主画面 */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        {channel === 'live' ? (
          <LiveStage
            showLive={showLive}
            imgSrc={imgSrc}
            running={detActive}
            imgError={imgError}
            linking={linking}
            failed={failed}
            lastError={lastError}
            detectedCount={detectedCount}
            maxConf={maxConf}
            detections={detections}
          />
        ) : curDrone ? (
          <DroneStage
            drone={curDrone}
            reg={curReg}
            hasThermal={hasThermal}
            realStream={realStream}
            viewMode={viewMode}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onPrev={() => { setIdx((i) => (i - 1 + drones.length) % drones.length); setPlaying(false) }}
            onNext={() => { setIdx((i) => (i + 1) % drones.length); setPlaying(false) }}
            onSelect={(i) => switchToDrone(i)}
            drones={drones}
            safeIdx={safeIdx}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600">
            <Plane size={40} />
            <span className="text-xs">暂无接入的巡检无人机</span>
            <span className="text-[11px]">在「设置 → 巡检无人机」中添加并连接无人机后，此处将轮播其实时画面与 GPS</span>
          </div>
        )}
      </div>

      {/* 直播源管理（仅在直播频道显示） */}
      {channel === 'live' && (
        <LiveSourceManager
          sources={sources}
          running={running}
          connecting={connecting}
          activeSource={activeSource ?? null}
          showAdd={showAdd}
          setShowAdd={setShowAdd}
          addName={addName}
          setAddName={setAddName}
          addSource={addSource}
          setAddSource={setAddSource}
          addLat={addLat}
          setAddLat={setAddLat}
          addLng={addLng}
          setAddLng={setAddLng}
          addPlace={addPlace}
          setAddPlace={setAddPlace}
          addError={addError}
          onStart={startSource}
          onStop={stopSource}
          onDelete={deleteSource}
          onSubmitAdd={submitAdd}
          stateSource={state?.source}
          lastError={lastError}
          onProvideCookies={provideCookies}
          onStartLocal={startLocalSample}
          cookiesOpen={cookiesOpen}
          setCookiesOpen={setCookiesOpen}
          cookiesText={cookiesText}
          setCookiesText={setCookiesText}
        />
      )}
    </section>
  )
}

// ───────────────────────── 小型控件 ─────────────────────────
function ViewModeBtn({
  icon, label, active, disabled, title, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {icon} {label}
    </button>
  )
}

// ───────────────────────── 直播舞台（移植自 LiveFeed） ─────────────────────────
function LiveStage({
  showLive, imgSrc, running, imgError, linking, failed, lastError,
  detectedCount, maxConf, detections,
}: {
  showLive: boolean
  imgSrc: string | null
  running: boolean
  imgError: boolean
  linking: boolean
  failed: boolean
  lastError: string
  detectedCount: number
  maxConf: number
  detections: { class: string; confidence: number; bbox_norm: number[]; track_id?: number }[]
}) {
  return (
    <>
      {running ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={REAL_DETECT_VIDEO} alt="实时监控画面" className="h-full w-full object-contain" />
      ) : showLive && imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgSrc} alt="实时直播视场" className="h-full w-full object-cover" onError={() => { /* handled by parent */ }} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-600">
          <Cctv size={40} />
          {imgError ? (
            <span className="text-xs text-amber-300/80">画面加载失败</span>
          ) : failed ? (
            <span className="text-xs text-rose-300/90">连接失败</span>
          ) : linking ? (
            <span className="text-xs">正在连接…</span>
          ) : (
            <span className="text-xs">{running ? '等待首帧…' : '未启动直播源'}</span>
          )}
        </div>
      )}

      {/* 真实检测浮层 */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
        {running && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-600/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE
          </span>
        )}
        {running && detectedCount > 0 && (
          <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-amber-300 shadow">
            检出 {detectedCount} · 置信度 {maxConf.toFixed(2)}
          </span>
        )}
      </div>

      {/* YOLO 检测框叠加层（基于归一化 bbox 直接换算像素比例，体现「无人机 YOLO 检测到象群」） */}
      {running && detections.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {detections.map((b, i) => {
            const [x1, y1, x2, y2] = b.bbox_norm
            if ([x1, y1, x2, y2].some((v) => typeof v !== 'number')) return null
            const color = CLASS_COLOR[b.class] || '#e0e000'
            return (
              <div
                key={b.track_id ?? i}
                className="absolute rounded-[3px] border-2"
                style={{
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${(x2 - x1) * 100}%`,
                  height: `${(y2 - y1) * 100}%`,
                  borderColor: color,
                  boxShadow: `0 0 8px ${color}88`,
                }}
              >
                <span
                  className="absolute -top-[16px] left-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none"
                  style={{ background: color, color: '#04121f' }}
                >
                  {b.class} {(b.confidence * 100).toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {running && detections.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[70%] flex-wrap gap-1.5">
          {detections.slice(0, 6).map((b, i) => (
            <span
              key={i}
              className="rounded bg-black/65 px-2 py-0.5 text-[10px] font-medium"
              style={{ color: CLASS_COLOR[b.class] || '#e0e000' }}
            >
              {b.class} {b.confidence.toFixed(2)}
            </span>
          ))}
        </div>
      )}

    </>
  )
}

// ───────────────────────── 无人机舞台（移植自 DroneWall + 热成像/分屏） ─────────────────────────
function DroneStage({
  drone, reg, hasThermal, realStream, viewMode, playing, onTogglePlay, onPrev, onNext, onSelect, drones, safeIdx,
}: {
  drone: Drone
  reg: ManagedDrone | undefined
  hasThermal: boolean
  realStream: string | undefined
  viewMode: ViewMode
  playing: boolean
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSelect: (i: number) => void
  drones: Drone[]
  safeIdx: number
}) {
  return (
    <>
      {/* 主画面：可见光 / 热成像 / 分屏 */}
      {viewMode === 'split' ? (
        <div className="flex h-full w-full">
          <div className="relative h-full w-1/2 border-r border-white/20">
            {hasThermal ? (
              <ThermalFootage realStream={realStream} />
            ) : (
              <NoThermalPlaceholder />
            )}
            <span className="absolute left-2 top-2 z-10 rounded bg-black/55 px-2 py-0.5 text-[10px] text-orange-200">热成像</span>
          </div>
          <div className="relative h-full w-1/2">
            <VisibleFootage realStream={realStream} />
            <span className="absolute left-2 top-2 z-10 rounded bg-black/55 px-2 py-0.5 text-[10px] text-slate-200">可见光</span>
          </div>
        </div>
      ) : viewMode === 'thermal' ? (
        <div className="relative h-full w-full">
          {hasThermal ? (
            <ThermalFootage realStream={realStream} />
          ) : (
            <NoThermalPlaceholder />
          )}
        </div>
      ) : (
        <VisibleFootage realStream={realStream} />
      )}

      {/* HUD 叠层 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">{drone.name}</span>
          <span className="rounded bg-black/45 px-2 py-1 font-mono text-[10px] text-slate-200 backdrop-blur">{drone.model}</span>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-[10px] font-bold backdrop-blur ${realStream ? 'bg-emerald-500/30 text-emerald-200' : 'bg-sky-500/30 text-sky-200'}`}>
            {realStream ? '司空实时' : '未接入画面 · 等待真实取流'}
          </span>
          <span className="flex items-center gap-1 rounded bg-red-600/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC
          </span>
          {viewMode !== 'visible' && (
            <span className="rounded bg-orange-500/40 px-2 py-1 text-[10px] font-bold text-orange-100 backdrop-blur">
              {viewMode === 'thermal' ? '热成像' : '分屏'}
            </span>
          )}
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Crosshair size={46} className="text-cyan-300/70" />
        </div>

        <div className="absolute bottom-3 left-3 space-y-1 rounded bg-black/45 px-2.5 py-2 font-mono text-[11px] text-cyan-100 backdrop-blur">
          <div className="flex items-center gap-1.5"><MapPin size={11} className="text-emerald-300" />{drone.lat.toFixed(4)}°N, {drone.lng.toFixed(4)}°E</div>
          <div className="flex gap-3">
            <span><ArrowUp size={10} className="mr-0.5 inline text-slate-400" />{drone.heading}°</span>
            <span>ALT {drone.altitude}m</span>
            <span>SPD {drone.speed.toFixed(1)}m/s</span>
          </div>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-3 rounded bg-black/45 px-2.5 py-2 font-mono text-[11px] text-slate-100 backdrop-blur">
          <span className={`flex items-center gap-1 ${STATUS_COLOR[drone.status] || ''}`}><Radio size={11} />{drone.status}</span>
          <span className="flex items-center gap-1"><Battery size={11} className="text-emerald-300" />{drone.battery}%</span>
          <span className="flex items-center gap-1"><Signal size={11} className="text-sky-300" />{drone.signal}%</span>
        </div>
      </div>

      {/* 底部控制条：播放/暂停 + 上/下一路 */}
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <button onClick={onTogglePlay} className="rounded-md border border-slate-600/60 bg-slate-800/60 p-1.5 text-slate-200 backdrop-blur hover:border-cyan-400/50">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={onPrev} className="rounded-md border border-slate-600/60 bg-slate-800/60 p-1.5 text-slate-200 backdrop-blur hover:border-cyan-400/50">
          <ChevronLeft size={14} />
        </button>
        <button onClick={onNext} className="rounded-md border border-slate-600/60 bg-slate-800/60 p-1.5 text-slate-200 backdrop-blur hover:border-cyan-400/50">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 缩略图条 */}
      {drones.length > 1 && (
        <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[70%] -translate-x-1/2 gap-2 overflow-x-auto rounded-lg bg-black/40 px-2 py-1.5 backdrop-blur">
          {drones.map((d, i) => (
            <button
              key={d.id}
              onClick={() => onSelect(i)}
              className={`relative flex min-w-[110px] flex-col rounded-lg border p-1.5 text-left transition ${
                i === safeIdx ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-slate-700/60 bg-slate-800/40 hover:border-cyan-400/40'
              }`}
            >
              <span className="truncate text-[10px] font-semibold text-slate-100">{d.name}</span>
              <span className="mt-0.5 flex items-center justify-between font-mono text-[9px] text-slate-400">
                <span>{d.altitude}m</span><span className={STATUS_COLOR[d.status]}>{d.status}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// 可见光画面（真实取流；无取流时如实显示等待占位，绝不合成虚假画面）
function VisibleFootage({ realStream }: { realStream?: string }) {
  return realStream ? (
    <video src={realStream} autoPlay muted loop playsInline className="h-full w-full object-cover" />
  ) : (
    <NoStreamPlaceholder label="未接入画面 · 等待真实取流" />
  )
}

// 热成像画面：有真实取流则套用红外示意滤镜（明确标注非真实热成像数据）；无取流则显示等待占位
function ThermalFootage({ realStream }: { realStream?: string }) {
  if (realStream) {
    return (
      <div className="relative h-full w-full">
        <video
          src={realStream}
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
          style={{ filter: 'grayscale(1) contrast(1.25) sepia(1) saturate(7) hue-rotate(-25deg) brightness(0.95)' }}
        />
        <span className="absolute left-2 bottom-2 rounded bg-black/55 px-2 py-0.5 text-[10px] text-orange-200">热成像样式（可见光转，非真实热成像数据）</span>
      </div>
    )
  }
  return <NoStreamPlaceholder label="未接入画面 · 等待真实取流" />
}

function NoThermalPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900 text-center">
      <Flame size={32} className="text-slate-600" />
      <span className="text-xs text-slate-400">无热成像模块</span>
    </div>
  )
}

function NoStreamPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900 text-center">
      <Video size={30} className="text-slate-600" />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

// ───────────────────────── 直播源管理（移植自 LiveFeed 底部） ─────────────────────────
function LiveSourceManager({
  sources, running, connecting, activeSource, showAdd, setShowAdd,
  addName, setAddName, addSource, setAddSource, addLat, setAddLat, addLng, setAddLng, addPlace, setAddPlace,
  addError, onStart, onStop, onDelete, onSubmitAdd, stateSource,
  lastError, onProvideCookies, onStartLocal, cookiesOpen, setCookiesOpen, cookiesText, setCookiesText,
}: {
  sources: VideoSource[]
  running: boolean
  connecting: boolean
  activeSource: VideoSource | null
  showAdd: boolean
  setShowAdd: React.Dispatch<React.SetStateAction<boolean>>
  addName: string
  setAddName: (v: string) => void
  addSource: string
  setAddSource: (v: string) => void
  addLat: string
  setAddLat: (v: string) => void
  addLng: string
  setAddLng: (v: string) => void
  addPlace: string
  setAddPlace: (v: string) => void
  addError: string
  onStart: (s: VideoSource) => void
  onStop: () => void
  onDelete: (id: string) => void
  onSubmitAdd: () => void
  stateSource?: string
  lastError?: string
  onProvideCookies: () => void
  onStartLocal: () => void
  cookiesOpen: boolean
  setCookiesOpen: React.Dispatch<React.SetStateAction<boolean>>
  cookiesText: string
  setCookiesText: (v: string) => void
}) {
  const isBotCheck = /反爬|Cookie|bot|人机验证/i.test(lastError || '')
  return (
    <div className="mt-4 border-t border-slate-700/40 pt-3">
      {/* YouTube 反爬拦截：明确提示 + 提供 Cookie / 本地样本 两条出路 */}
      {isBotCheck && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2 text-[12px] text-amber-100">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <div>
              <div className="font-semibold text-amber-200">YouTube 触发了反爬（人机验证）</div>
              <div className="mt-0.5 text-amber-200/80">{lastError}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCookiesOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-[12px] font-medium text-amber-100 transition hover:bg-amber-500/25"
            >
              <KeyRound size={12} /> 提供浏览器 Cookie 绕过
            </button>
            <button
              onClick={onStartLocal}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1.5 text-[12px] font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <Film size={12} /> 改用本地象群样本（立即可用）
            </button>
          </div>
          {cookiesOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={cookiesText}
                onChange={(e) => setCookiesText(e.target.value)}
                placeholder={"粘贴 Netscape 格式 Cookie（从浏览器扩展导出 youtube.com 的 cookies.txt 内容）"}
                rows={3}
                className="w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-white outline-none placeholder:text-slate-600 focus:border-amber-500/50"
              />
              <button
                onClick={onProvideCookies}
                disabled={connecting || !cookiesText.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                {connecting ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={12} />}
                保存并重启当前直播源
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <Film size={13} className="text-slate-400" /> 视频源（{sources.length}）
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          <Plus size={12} /> {showAdd ? '收起' : '新增视频源'}
        </button>
      </div>

      {/* 启停当前源 */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {running ? (
          <button
            onClick={onStop}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
          >
            <Square size={15} /> 停止直播
          </button>
        ) : (
          <button
            onClick={() => activeSource && onStart(activeSource)}
            disabled={connecting || !activeSource}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            启动当前源
          </button>
        )}
        {stateSource && (
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
            <Radio size={11} className="text-emerald-400" />
            <span className="max-w-[40vw] truncate font-mono">{stateSource}</span>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 sm:grid-cols-2">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="名称（如：勐养保护区摄像头01）"
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <input
            value={addSource}
            onChange={(e) => setAddSource(e.target.value)}
            placeholder="源地址：YouTube/RTSP/0/local/文件路径"
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <input
            value={addLat}
            onChange={(e) => setAddLat(e.target.value)}
            placeholder="纬度 lat（如 22.05）"
            inputMode="decimal"
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <input
            value={addLng}
            onChange={(e) => setAddLng(e.target.value)}
            placeholder="经度 lng（如 100.81）"
            inputMode="decimal"
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <input
            value={addPlace}
            onChange={(e) => setAddPlace(e.target.value)}
            placeholder="部署地点（如 云南省·西双版纳州·勐养镇）"
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50 sm:col-span-2"
          />
          {addError && (
            <div className="flex items-center gap-1 text-[11px] text-rose-300 sm:col-span-2">
              <AlertTriangle size={11} /> {addError}
            </div>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              onClick={onSubmitAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-500"
            >
              <Plus size={12} /> 保存视频源
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sources.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-700/50 px-3 py-4 text-center text-[12px] text-slate-500">
            暂无视频源
          </div>
        )}
        {sources.map((s) => {
          const isActive = s.id === activeSource?.id
          const coord = s.lat != null && s.lng != null ? `${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}` : '未设坐标'
          return (
            <div
              key={s.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition ${
                isActive ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-800/40'
              }`}
            >
              <Globe2 size={14} className={isActive ? 'text-emerald-300' : 'text-slate-500'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-200">{s.name}</span>
                  {s.builtin && <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">内置</span>}
                  {isActive && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">运行中</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="max-w-[40vw] truncate font-mono">{s.source}</span>
                </div>
              </div>
              <button
                onClick={() => onStart(s)}
                disabled={connecting}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={12} /> 启动
              </button>
              <button
                onClick={() => onDelete(s.id)}
                disabled={connecting}
                title="删除该视频源"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>

    </div>
  )
}
