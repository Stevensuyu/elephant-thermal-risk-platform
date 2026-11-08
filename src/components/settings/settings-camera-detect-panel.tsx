'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, Cpu, Play, Square, Loader2, RefreshCw, CheckCircle2, XCircle,
  ScanLine, Zap, Radio, Image as ImageIcon, Plus, Trash2, Globe2, Plane,
  FileVideo, Usb, ChevronDown, ChevronUp, Settings2,
} from 'lucide-react'

/**
 * 设备接入 + 检测引擎管理（真实链路，走本地检测服务 8765）。
 *
 * 能力：
 *  - 枚举本机 USB 摄像头 / HDMI 采集卡（含 DJI Osmo Pocket 3、索尼相机）
 *  - 设备管理：预设一键添加（Pocket 3 / 索尼 / 海康 / 大华 / 大疆无人机 / 通用 RTSP / USB）
 *  - 自定义添加设备（webcam / stream-RTSP / drone / file），持久化存储
 *  - 选择设备启动、删除设备
 *  - 双引擎：YOLO 实时主引擎 + 英伟达 LocateAnything-3B 开放词汇复核
 *  - 启动/停止检测，实时预览带识别框的画面（MJPEG）
 */
const VIDEO_URL = 'http://127.0.0.1:8765/video'
const ENGINES = [
  { id: 'yolo', name: 'Ultralytics YOLO（最新版）', desc: '实时逐帧检测，低延迟，主引擎', tag: '实时' },
  { id: 'locateanything', name: '英伟达 LocateAnything-3B', desc: '开放词汇，自然语言提示词，复核引擎', tag: '开放词汇' },
]

const DEVICE_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  webcam: { label: 'USB/HDMI', icon: Usb, color: 'text-cyan-300' },
  stream: { label: '网络流', icon: Globe2, color: 'text-sky-300' },
  drone: { label: '无人机', icon: Plane, color: 'text-violet-300' },
  file: { label: '本地文件', icon: FileVideo, color: 'text-amber-300' },
}

interface CamDevice { index: number; label: string; width: number; height: number; readable: boolean; backend: string }
interface ManagedDevice { id: string; name: string; type: string; params: Record<string, any>; enabled: boolean; note: string }
interface DevicePreset { key: string; name: string; type: string; params: Record<string, any>; note: string }
interface DetectStatus {
  ok?: boolean
  service?: string
  state?: {
    running?: boolean; source_type?: string; source_label?: string
    engine_id?: string; engine_loaded?: boolean; secondary_engine_id?: string; secondary_loaded?: boolean
    frame_w?: number; frame_h?: number; fps?: number; engine_fps?: number; secondary_fps?: number
    detected?: boolean; last_error?: string
  }
  engine?: { id?: string; name?: string; loaded?: boolean; error?: string | null }
  secondary?: { id?: string; name?: string; loaded?: boolean }
  load_progress?: string
}

export default function CameraDetectPanel() {
  const [devices, setDevices] = useState<CamDevice[]>([])
  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>([])
  const [presets, setPresets] = useState<DevicePreset[]>([])
  const [status, setStatus] = useState<DetectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [engineId, setEngineId] = useState('yolo')
  const [prompt, setPrompt] = useState('person, animal, vehicle, elephant')
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [detections, setDetections] = useState<any[]>([])
  const [previewOn, setPreviewOn] = useState(true)
  const [lastError, setLastError] = useState('')
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState('webcam')
  const [addUrl, setAddUrl] = useState('')
  const [addIndex, setAddIndex] = useState('0')
  const [addPath, setAddPath] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addError, setAddError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 用 ref 跟踪 started，避免 useEffect 依赖 started 导致每次启动/停止都重启整个轮询
  const startedRef = useRef(false)
  useEffect(() => { startedRef.current = started }, [started])

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/detect/status', { cache: 'no-store' })
      const d = await r.json()
      setStatus(d)
      setServiceOnline(d?.ok === true)
      setEngineId(d?.engine?.id || d?.state?.engine_id || engineId)
      if (d?.state?.running !== undefined) setStarted(!!d.state.running)
    } catch {
      setServiceOnline(false)
    }
  }, [])

  const loadCameras = useCallback(async (retry = 3, forceRefresh = false) => {
    for (let i = 0; i < retry; i++) {
      try {
        const url = forceRefresh ? '/api/detect/cameras?refresh=1' : '/api/detect/cameras'
        const r = await fetch(url, { cache: 'no-store' })
        const d = await r.json()
        if (d?.ok && Array.isArray(d.devices)) {
          setDevices(d.devices)
          return
        }
      } catch { /* ignore */ }
      if (i < retry - 1) await new Promise((r) => setTimeout(r, 1000))
    }
  }, [])

  const loadManagedDevices = useCallback(async () => {
    try {
      const r = await fetch('/api/detect/devices', { cache: 'no-store' })
      const d = await r.json()
      if (Array.isArray(d?.devices)) setManagedDevices(d.devices)
    } catch { /* ignore */ }
  }, [])

  const loadPresets = useCallback(async () => {
    try {
      const r = await fetch('/api/detect/devices/presets', { cache: 'no-store' })
      const d = await r.json()
      if (Array.isArray(d?.presets)) setPresets(d.presets)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const boot = async () => {
      setLoading(true)
      await Promise.all([loadStatus(), loadCameras(), loadManagedDevices(), loadPresets()])
      setLoading(false)
    }
    void boot()
    // 轮询：只查状态 + 检测结果，每秒一次；started 通过 ref 读取，避免依赖变化重启整个 effect
    timerRef.current = setInterval(() => {
      void loadStatus()
      if (startedRef.current) {
        void fetch('/api/detect/live-detection', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setDetections(d?.detections ?? []))
          .catch(() => {})
      }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async () => {
    setLoading(true)
    // refresh 时强制后端重新枚举摄像头（清掉 30s 缓存），用户插拔 Pocket 后立即生效
    await Promise.all([loadStatus(), loadCameras(3, true), loadManagedDevices(), loadPresets()])
    setLoading(false)
  }

  const api = async (path: string, body?: any) => {
    setBusy(true)
    setLastError('')
    try {
      const r = await fetch(`/api/detect/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const d = await r.json()
      if (d?.ok === false) setLastError(d.error || '操作失败')
      return d
    } catch (e: any) {
      setLastError(String(e?.message || e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const selectCamera = async (index: number) => {
    setSelectedIndex(index)
    const d = await api('source/select', { type: 'webcam', index })
    if (d?.ok) await loadStatus()
  }

  const selectManagedDevice = async (dev: ManagedDevice) => {
    const d = await api('devices/select', { id: dev.id })
    if (d?.ok) {
      setLastError('')
      await loadStatus()
    }
  }

  const addPreset = async (preset: DevicePreset) => {
    const d = await api('devices/preset', { preset_key: preset.key })
    if (d?.ok) {
      await loadManagedDevices()
      setLastError('')
    }
  }

  const submitAddDevice = async () => {
    setAddError('')
    let params: Record<string, any> = {}
    if (addType === 'webcam') {
      const idx = parseInt(addIndex, 10)
      if (isNaN(idx) || idx < 0) {
        setAddError('摄像头索引必须是数字（如 0、1）')
        return
      }
      // 不写死 backend，让后端自动探测 DSHOW / MSMF（Pocket 3 在 Win11 上常需 MSMF）
      params = { index: idx, width: 640, height: 480 }
    } else if (addType === 'stream' || addType === 'drone') {
      const url = addUrl.trim()
      if (!url) {
        setAddError('请输入视频流地址（RTMP/RTSP/HLS）')
        return
      }
      const protocol = url.toLowerCase().startsWith('rtmp://') ? 'RTMP' : url.toLowerCase().startsWith('rtsp://') ? 'RTSP' : url.toLowerCase().startsWith('http') ? 'HLS/HTTP' : 'AUTO'
      params = addType === 'drone' ? { url, protocol, model: 'dji_generic' } : { url, protocol }
    } else if (addType === 'file') {
      const path = addPath.trim()
      if (!path) {
        setAddError('请输入本地视频/图片路径')
        return
      }
      params = { path }
    }
    const d = await api('devices/add', { name: addName || `${addType}-设备`, type: addType, params, note: addNote })
    if (d?.ok) {
      setAddName(''); setAddUrl(''); setAddIndex('0'); setAddPath(''); setAddNote(''); setShowAddDevice(false)
      await loadManagedDevices()
    }
  }

  const removeDevice = async (id: string) => {
    await api('devices/remove', { id })
    await loadManagedDevices()
  }

  const selectEngine = async (id: string) => {
    setEngineId(id)
    const params: any = { engine: id }
    if (id === 'locateanything') {
      params.prompt = prompt || 'elephant'
      params.precision = 'auto'
    }
    await api('engine/select', params)
    await loadStatus()
  }

  const toggleStart = async () => {
    if (!started) {
      // 启动检测前，强制选择引擎确保后端状态同步
      const eng = engineId || 'yolo'
      await selectEngine(eng)
      await loadStatus()
    }
    const d = started ? await api('detection/stop', {}) : await api('detection/start', {})
    if (d?.ok) {
      setStarted(!started)
      if (!started) {
        setPreviewOn(true)
      }
      if (prompt.trim()) {
        await api('detection/config', { prompt: prompt.trim() })
      }
    } else {
      setLastError(d?.error || '启动检测失败，请检查设备和引擎选择')
    }
    await loadStatus()
  }

  const applyPrompt = async () => {
    await api('detection/config', { prompt: prompt.trim() || 'elephant' })
    setLastError('')
  }

  const running = status?.state?.running ?? started
  const engineName = ENGINES.find((e) => e.id === engineId)?.name ?? engineId
  const activeSourceLabel = status?.state?.source_label || status?.state?.source_type || ''

  if (loading && serviceOnline === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" /> 连接本地检测服务…
      </div>
    )
  }

  if (serviceOnline === false) {
    return (
      <div className="dv-panel p-5">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-rose-300" />
          <h3 className="text-base font-semibold text-slate-100">设备接入与实时检测</h3>
        </div>
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-[12.5px] text-rose-200">
          本地检测服务未启动。请先运行项目根目录的 <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11.5px]">start-detect.bat</code>，再回到本页刷新。
        </div>
        <button onClick={refresh} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/20">
          <RefreshCw size={13} /> 刷新连接
        </button>
      </div>
    )
  }

  return (
    <div className="dv-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-emerald-300" />
          <h3 className="text-base font-semibold text-slate-100">设备接入与实时检测</h3>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${serviceOnline ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${serviceOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {serviceOnline ? '检测服务在线' : '服务离线'}
          </span>
          {activeSourceLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-400/20">
              <Radio size={9} /> 当前源：{activeSourceLabel}
            </span>
          )}
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 px-2 py-1 text-[11.5px] text-slate-300 hover:bg-slate-700/40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左：设备与引擎 */}
        <div className="space-y-4">
          {/* 本机摄像头 */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
              <Usb size={12} className="text-cyan-300" /> 本机 USB 摄像头 / HDMI 采集卡
            </div>
            <div className="max-h-32 space-y-1.5 overflow-auto pr-1">
              {devices.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-3 text-center text-[11.5px] text-slate-500">
                  未发现可用摄像头。请确认笔记本摄像头或 USB 相机（如 Osmo Pocket 3）已连接。
                </div>
              )}
              {devices.map((dev) => {
                const active = running && status?.state?.source_type === 'webcam' && selectedIndex === dev.index
                return (
                  <button
                    key={dev.index}
                    onClick={() => selectCamera(dev.index)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                      active ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60'
                    }`}
                  >
                    <Camera size={14} className={active ? 'text-emerald-300' : 'text-slate-500'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-slate-200">{dev.label}</span>
                      <span className="block text-[10.5px] text-slate-500">
                        {dev.width > 0 ? `${dev.width}×${dev.height}` : '探测中'} · {dev.backend}
                      </span>
                    </span>
                    {active && <span className="shrink-0 text-[10px] font-semibold text-emerald-300">使用中</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 已接入设备管理 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
                <Settings2 size={12} className="text-violet-300" /> 已接入设备（网络流 / 无人机 / 文件）
                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[9.5px] text-slate-400">{managedDevices.length}</span>
              </div>
              <button
                onClick={() => setShowAddDevice((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20"
              >
                {showAddDevice ? <ChevronUp size={11} /> : <Plus size={11} />} {showAddDevice ? '收起' : '添加设备'}
              </button>
            </div>

            {/* 预设一键添加 */}
            {showAddDevice && (
              <div className="mb-2 rounded-md border border-slate-700/50 bg-slate-800/30 p-2.5">
                <div className="mb-1.5 text-[10.5px] font-medium text-slate-400">预设一键添加（点击即添加到设备列表）</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => {
                    const meta = DEVICE_TYPE_META[p.type] || DEVICE_TYPE_META.webcam
                    const Icon = meta.icon
                    return (
                      <button
                        key={p.key}
                        onClick={() => addPreset(p)}
                        disabled={busy}
                        title={p.note}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 bg-slate-800/50 px-2 py-1 text-[10.5px] text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"
                      >
                        <Icon size={10} className={meta.color} /> {p.name}
                      </button>
                    )
                  })}
                </div>

                {/* 自定义添加 */}
                <div className="mt-2.5 border-t border-slate-700/40 pt-2">
                  <div className="mb-1.5 text-[10.5px] font-medium text-slate-400">自定义添加</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="设备名称（如：勐养保护区01）"
                      className="dv-input col-span-2 text-[11.5px]"
                    />
                    <select
                      value={addType}
                      onChange={(e) => setAddType(e.target.value)}
                      className="dv-input text-[11.5px]"
                    >
                      <option value="webcam">USB/HDMI 摄像头</option>
                      <option value="stream">网络流（RTSP/RTMP/HLS）</option>
                      <option value="drone">无人机图传</option>
                      <option value="file">本地视频/图片</option>
                    </select>
                    {addType === 'webcam' && (
                      <input
                        value={addIndex}
                        onChange={(e) => setAddIndex(e.target.value)}
                        placeholder="摄像头索引（如 0、1）"
                        className="dv-input text-[11.5px]"
                      />
                    )}
                    {(addType === 'stream' || addType === 'drone') && (
                      <input
                        value={addUrl}
                        onChange={(e) => setAddUrl(e.target.value)}
                        placeholder={addType === 'drone' ? '大疆 RTMP 推流地址（如 rtmp://push-hz.fh-live.djigate.com/live-xxx/stream-xxx?ts=...&secret=...）' : '视频流地址（RTMP/RTSP/HLS）'}
                        className="dv-input col-span-2 text-[11px]"
                      />
                    )}
                    {addType === 'file' && (
                      <input
                        value={addPath}
                        onChange={(e) => setAddPath(e.target.value)}
                        placeholder="本地视频/图片路径（如 C:\\video.mp4）"
                        className="dv-input text-[11.5px]"
                      />
                    )}
                    <input
                      value={addNote}
                      onChange={(e) => setAddNote(e.target.value)}
                      placeholder="备注（可选）"
                      className="dv-input col-span-2 text-[11.5px]"
                    />
                  </div>
                  {addError && <div className="mt-1 text-[10.5px] text-rose-300">{addError}</div>}
                  <button
                    onClick={submitAddDevice}
                    disabled={busy}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Plus size={10} /> 保存设备
                  </button>
                </div>
              </div>
            )}

            {/* 设备列表 */}
            <div className="max-h-40 space-y-1.5 overflow-auto pr-1">
              {managedDevices.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-3 text-center text-[11.5px] text-slate-500">
                  暂无已接入设备。点击「添加设备」使用预设或自定义添加。
                </div>
              )}
              {managedDevices.map((dev) => {
                const meta = DEVICE_TYPE_META[dev.type] || DEVICE_TYPE_META.webcam
                const Icon = meta.icon
                const active = running && status?.state?.source_label === dev.name
                const paramStr = Object.entries(dev.params).map(([k, v]) => `${k}=${v}`).join(', ')
                return (
                  <div
                    key={dev.id}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-2 transition ${
                      active ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-800/30'
                    }`}
                  >
                    <Icon size={14} className={`shrink-0 ${active ? 'text-emerald-300' : meta.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-slate-200">{dev.name}</span>
                        <span className={`rounded px-1 py-px text-[9px] font-medium ${meta.color} bg-slate-700/40`}>{meta.label}</span>
                        {active && <span className="text-[10px] font-semibold text-emerald-300">使用中</span>}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{paramStr || '无参数'}</div>
                    </div>
                    <button
                      onClick={() => selectManagedDevice(dev)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      选择
                    </button>
                    <button
                      onClick={() => removeDevice(dev.id)}
                      disabled={busy}
                      title="删除设备"
                      className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 p-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 引擎选择 */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
              <Cpu size={12} className="text-violet-300" /> 检测引擎（主引擎）
              {status?.secondary?.loaded && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-300">+ LA 复核已启用</span>
              )}
            </div>
            <div className="space-y-1.5">
              {ENGINES.map((eng) => {
                const active = engineId === eng.id
                return (
                  <button
                    key={eng.id}
                    onClick={() => selectEngine(eng.id)}
                    className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                      active ? 'border-violet-400/50 bg-violet-500/10' : 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60'
                    }`}
                  >
                    <Zap size={14} className={`mt-0.5 shrink-0 ${active ? 'text-violet-300' : 'text-slate-500'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-slate-200">{eng.name}</span>
                        <span className={`rounded px-1 py-px text-[9.5px] font-medium ${eng.tag === '实时' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{eng.tag}</span>
                      </span>
                      <span className="block text-[10.5px] text-slate-500">{eng.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="LA 提示词（逗号分隔），如 person, animal, vehicle, elephant"
                className="dv-input flex-1 text-[12px]"
              />
              <button onClick={applyPrompt} className="shrink-0 rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-200 hover:bg-amber-500/20">
                应用
              </button>
            </div>
          </div>

          {/* 启动控制 */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
            <button
              onClick={toggleStart}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 ${
                running ? 'bg-rose-500/90 hover:bg-rose-500' : 'bg-emerald-500/90 hover:bg-emerald-500'
              }`}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : running ? <Square size={13} /> : <Play size={13} />}
              {running ? '停止检测' : '启动检测'}
            </button>
            <button
              onClick={() => setPreviewOn(!previewOn)}
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-2 text-[12px] ${previewOn ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-600/50 text-slate-300 hover:bg-slate-700/40'}`}
            >
              <ScanLine size={13} /> {previewOn ? '隐藏预览' : '显示预览'}
            </button>
            <div className="ml-auto text-right text-[11px] text-slate-500">
              {running ? (
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> 检测中 · {engineName}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1"><XCircle size={11} /> 未运行</span>
              )}
              {status?.state?.fps ? <div>推流 {status.state.fps.toFixed(1)} FPS</div> : null}
              {status?.state?.engine_fps ? <div>主引擎 {status.state.engine_fps.toFixed(1)} FPS</div> : null}
              {status?.state?.secondary_fps ? <div className="text-amber-300/80">LA 复核 {status.state.secondary_fps.toFixed(2)} FPS</div> : null}
            </div>
          </div>

          {status?.engine?.error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200">{status.engine.error}</div>
          )}
          {lastError && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200">{lastError}</div>}

          {detections.length > 0 && (
            <div className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.06] p-2.5">
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 size={11} /> 当前检出 {detections.length} 个目标
              </div>
              <div className="space-y-1">
                {detections.slice(0, 8).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-black/25 px-2 py-1 text-[11px] text-slate-300">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${d.engine === 'yolo' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{d.class_name}</span>
                    <span className="text-slate-400">{d.score?.toFixed(3)}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{d.engine}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：实时预览 */}
        <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700/50 bg-black/80">
          {previewOn && running ? (
            <img
              key={`video-${previewOn}`}
              src={VIDEO_URL}
              alt="实时检测画面"
              className="h-full w-full object-contain"
              onError={(e) => {
                console.error('MJPEG流加载失败', e)
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
              <ImageIcon size={36} strokeWidth={1} />
              <span className="text-[11.5px]">启动检测并开启预览后，这里显示带识别框的实时画面</span>
              {!running && <span className="text-[10.5px] text-slate-700">MJPEG: {VIDEO_URL}</span>}
            </div>
          )}
          {running && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> DETECT
            </div>
          )}
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9.5px] text-emerald-300/90">
            {status?.state?.frame_w && status?.state?.frame_h ? `${status.state.frame_w}×${status.state.frame_h}` : ''}
            {status?.state?.fps ? ` · ${status.state.fps.toFixed(1)} FPS` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
