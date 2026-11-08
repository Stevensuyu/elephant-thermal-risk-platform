'use client'

import { useEffect, useRef, useState } from 'react'
import { Crosshair, Dice5, X, AlertTriangle, Radar, Radio, Cctv, Play, Pause, Zap, Link2, MapPin, LocateFixed } from 'lucide-react'
import type { ReasoningPayload } from '@/components/dashboard/dashboard-ai-reasoning-trace'
import { isQualifyingDetection, detectToPayload, type LiveDetection } from '@/lib/utils/util-live-judge-engine'

/** HTTP 环境 / 定位被拒时的云南边境预设位置 */
const SIM_PRESETS = [
  { name: '保山·昌宁·更戛乡', lat: 24.32, lng: 99.68, addr: '云南省保山市昌宁县更戛乡' },
  { name: '西双版纳·景洪·勐养镇', lat: 22.15, lng: 100.78, addr: '云南省西双版纳州景洪市勐养镇' },
  { name: '普洱·澜沧·糯扎渡镇', lat: 22.62, lng: 100.35, addr: '云南省普洱市澜沧县糯扎渡镇' },
]

const DIRECTIONS = ['东北向村庄', '正北向农田', '东南向学校', '西向林区', '西南向村寨', '正东向集镇']
const CONDITIONS = ['晴', '局部多云', '多云', '小雨', '中雨', '雷暴', '雾']
const LEVELS: { value: string; label: string; bg: string }[] = [
  { value: 'RED', label: '红色', bg: 'bg-red-600' },
  { value: 'ORANGE', label: '橙色', bg: 'bg-orange-500' },
  { value: 'YELLOW', label: '黄色', bg: 'bg-amber-400' },
  { value: 'BLUE', label: '蓝色', bg: 'bg-blue-600' },
]

interface SimulateAlertModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (payload: ReasoningPayload) => void
}

/** 粗略风险估计（仅用于预填展示，引擎会重新精确计算） */
function estimate(name: string, opts: {
  distanceKm: number; detectedCount: number; speedMpm: number; calfCount: number; windKmh: number; rainfallMm: number;
}): { score: number; level: string } {
  let score = 0
  score += Math.max(0, 70 - opts.distanceKm * 12) // 距离越近越高
  score += Math.min(25, opts.detectedCount * 4)
  score += Math.min(15, opts.speedMpm * 0.4)
  score += opts.calfCount > 0 ? 12 : 0
  score += opts.windKmh > 20 ? 8 : 0
  score += opts.rainfallMm > 5 ? 6 : 0
  score = Math.max(0, Math.min(100, Math.round(score)))
  const level = score >= 75 ? 'RED' : score >= 55 ? 'ORANGE' : score >= 30 ? 'YELLOW' : 'BLUE'
  return { score, level }
}

export default function SimulateAlertModal({ isOpen, onClose, onStart }: SimulateAlertModalProps) {
  const [mode, setMode] = useState<'param' | 'live'>('param')

  // ── 参数模拟模式状态 ──
  const [name, setName] = useState('模拟象群逼近村寨')
  const [detectedCount, setDetectedCount] = useState(5)
  const [distanceKm, setDistanceKm] = useState(2.2)
  const [farmDistKm, setFarmDistKm] = useState(1.4)
  const [speedMpm, setSpeedMpm] = useState(22)
  const [direction, setDirection] = useState(DIRECTIONS[0])
  const [tempC, setTempC] = useState(22)
  const [condition, setCondition] = useState('局部多云')
  const [windKmh, setWindKmh] = useState(9)
  const [rainfallMm, setRainfallMm] = useState(0)
  const [thermalDeltaT, setThermalDeltaT] = useState(4.5)
  const [trackingFrames, setTrackingFrames] = useState(35)
  const [terrainSlopeDeg, setTerrainSlopeDeg] = useState(8)
  const [distSchoolKm, setDistSchoolKm] = useState(2.8)
  const [adultCount, setAdultCount] = useState(4)
  const [calfCount, setCalfCount] = useState(1)
  const [systemState, setSystemState] = useState('ORANGE')
  const [locateErr, setLocateErr] = useState<string | null>(null)
  // ── 定位状态（模拟警情也支持自动定位）──
  const [simLat, setSimLat] = useState<number | undefined>(24.32)
  const [simLng, setSimLng] = useState<number | undefined>(99.68)
  const [simAddr, setSimAddr] = useState('云南省保山市昌宁县更戛乡')
  const [simLocating, setSimLocating] = useState(false)

  /** 打开弹窗时自动尝试定位 */
  useEffect(() => {
    if (!isOpen || mode !== 'param') return
    const t = setTimeout(() => autoLocateSim(), 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode])

  const applySimPreset = (idx: number) => {
    const p = SIM_PRESETS[idx]
    setSimLat(p.lat); setSimLng(p.lng); setSimAddr(p.addr)
    setLocateErr(null)
  }

  const autoLocateSim = () => {
    setLocateErr(null)
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setLocateErr('HTTP 环境不支持定位，已使用默认位置')
      applySimPreset(0)
      return
    }
    if (!navigator.geolocation) { applySimPreset(0); return }
    setSimLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = Number(pos.coords.latitude.toFixed(5))
        const ln = Number(pos.coords.longitude.toFixed(5))
        setSimLat(la); setSimLng(ln)
        try {
          const r = await fetch(`/api/geocode/reverse?lat=${la}&lng=${ln}`, { cache: 'no-store' })
          if (r.ok) {
            const j = await r.json()
            const parts = [j.province, j.city, j.district || j.county, j.town || j.township].filter(Boolean)
            if (parts.length) setSimAddr(parts.join(''))
          }
        } catch { /* ignore */ }
        setSimLocating(false)
      },
      () => { setSimLocating(false); setLocateErr('定位失败，已使用默认位置'); applySimPreset(0) },
      { enableHighAccuracy: true, timeout: 6000 },
    )
  }

  // ── 实时直播流模式状态 ──
  const [live, setLive] = useState<{ running: boolean; name?: string; place?: string }>({ running: false })
  const [det, setDet] = useState<LiveDetection | null>(null)
  const [armed, setArmed] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const armedRef = useRef(false)
  const lastTriggerRef = useRef(0)
  const closingRef = useRef(false)
  useEffect(() => { armedRef.current = armed }, [armed])

  // 实时直播流模式：加载直播状态 + 轮询检测
  useEffect(() => {
    if (!isOpen || mode !== 'live') return
    let alive = true
    const loadLive = async () => {
      try {
        const r = await fetch('/api/live-source', { cache: 'no-store' })
        const d = await r.json()
        const st = d.state
        if (!alive) return
        setLive({ running: !!st, name: st?.name, place: st?.place })
      } catch { /* ignore */ }
    }
    const pollDet = async () => {
      try {
        const r = await fetch('/api/live-detection', { cache: 'no-store' })
        const d = (await r.json()) as LiveDetection
        if (!alive) return
        setDet(d)
        if (armedRef.current && !closingRef.current && isQualifyingDetection(d, 0.5)) {
          const now = Date.now()
          if (now - lastTriggerRef.current > 20000) {
            lastTriggerRef.current = now
            const payload = detectToPayload(d, { sourceName: live.name, place: live.place })
            closingRef.current = true
            onStart(payload)
            onClose()
          }
        }
      } catch { /* ignore */ }
    }
    loadLive()
    const t = setInterval(() => { loadLive(); pollDet() }, 800)
    return () => { alive = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode])

  if (!isOpen) return null

  const randomize = () => {
    const d = +(Math.random() * 8 + 0.3).toFixed(1)
    const cnt = 1 + Math.floor(Math.random() * 14)
    const sp = Math.floor(Math.random() * 60)
    const calf = Math.random() > 0.5 ? Math.floor(Math.random() * 4) : 0
    const wind = Math.floor(Math.random() * 35)
    const rain = Math.random() > 0.6 ? +(Math.random() * 18).toFixed(1) : 0
    setDistanceKm(d); setDetectedCount(cnt); setSpeedMpm(sp); setCalfCount(calf)
    setWindKmh(wind); setRainfallMm(rain); setDirection(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)])
    setCondition(rain > 5 ? '中雨' : wind > 20 ? '雷暴' : '局部多云')
    setThermalDeltaT(+(Math.random() * 8 + 1).toFixed(1))
    setDistSchoolKm(+(Math.random() * 6).toFixed(1))
    setAdultCount(Math.max(1, cnt - calf))
    setSystemState(LEVELS[Math.floor(Math.random() * LEVELS.length)].value)
    setName('模拟象群活动')
  }

  const handleStart = () => {
    if (!name.trim()) { setLocateErr('请填写场景名称'); return }
    const { score, level } = estimate(name, { distanceKm, detectedCount, speedMpm, calfCount, windKmh, rainfallMm })
    const payload: ReasoningPayload = {
      name: name.trim(),
      region: simAddr ? `${simAddr}（模拟）` : '云南亚洲象活动区（模拟）',
      detectedClasses: '亚洲象（热成像）',
      detectedCount,
      maxConfidence: 0.82,
      avgConfidence: 0.74,
      distanceKm,
      farmDistKm,
      speedMpm,
      direction,
      weather: { tempC, condition, windKmh, visibilityKm: rainfallMm > 5 ? 3 : windKmh > 20 ? 5 : 12, rainfallMm },
      computedRiskScore: score,
      computedLevel: level,
      predictionWindow: '未来 2 小时内',
      ruleSummary: '模拟场景下基于无人机热成像识别与地理空间关系推算的风险研判。',
      ruleActions: [],
      thermalDeltaT,
      trackingFrames,
      terrainSlopeDeg,
      distSchoolKm,
      adultCount,
      calfCount,
    }
    onStart(payload)
    onClose()
  }

  const handleLiveNow = () => {
    if (!det) return
    const payload = detectToPayload(det, { sourceName: live.name, place: live.place })
    onStart(payload)
    onClose()
  }

  const inputCls =
    'w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-purple-500/70'
  const labelCls = 'mb-1 block text-xs text-slate-400'

  const qualifying = isQualifyingDetection(det, 0.5)
  const detCount = det?.detected_count ?? 0
  const detConf = det?.max_confidence ?? 0
  const elephantHit = (det?.detected || []).some((x) => /elephant|大象|asia_elephant/i.test(x.class))

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl ring-1 ring-purple-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-2 border-b border-purple-500/25 pb-3">
          <Radar size={20} className="text-violet-300" />
          <h2 className="text-lg font-semibold text-slate-100">模拟警情推演</h2>
          <span className="ml-auto rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300 ring-1 ring-violet-400/30">AI 实时推理</span>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"><X size={18} /></button>
        </div>

        {/* 模式切换 */}
        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setMode('param')}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              mode === 'param' ? 'border-violet-400/60 bg-violet-500/15 text-violet-200' : 'border-purple-500/25 bg-slate-800/50 text-slate-300 hover:border-violet-400/40'
            }`}
          >
            <Crosshair size={14} /> 参数模拟推演
          </button>
          <button
            onClick={() => setMode('live')}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              mode === 'live' ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200' : 'border-purple-500/25 bg-slate-800/50 text-slate-300 hover:border-fuchsia-400/40'
            }`}
          >
            <Link2 size={14} /> 实时直播流推演
          </button>
        </div>

        {mode === 'param' ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className={labelCls}>场景名称</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：模拟象群逼近村寨" />
              </div>
              <button
                onClick={randomize}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"
              >
                <Dice5 size={14} /> 随机生成
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><label className={labelCls}>象群数量</label><input type="number" min={1} max={60} className={inputCls} value={detectedCount} onChange={(e) => setDetectedCount(Number(e.target.value) || 1)} /></div>
              <div><label className={labelCls}>成象 / 幼象</label><div className="flex gap-1"><input type="number" min={0} className={inputCls} value={adultCount} onChange={(e) => setAdultCount(Number(e.target.value) || 0)} /><input type="number" min={0} className={inputCls} value={calfCount} onChange={(e) => setCalfCount(Number(e.target.value) || 0)} /></div></div>
              <div><label className={labelCls}>距村寨 (km)</label><input type="number" step={0.1} min={0} className={inputCls} value={distanceKm} onChange={(e) => setDistanceKm(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>距农田 (km)</label><input type="number" step={0.1} min={0} className={inputCls} value={farmDistKm} onChange={(e) => setFarmDistKm(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>运动速度 (m/min)</label><input type="number" step={1} min={0} className={inputCls} value={speedMpm} onChange={(e) => setSpeedMpm(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>方向</label><select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value)}>{DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
              <div><label className={labelCls}>热成像 ΔT (℃)</label><input type="number" step={0.1} min={0} className={inputCls} value={thermalDeltaT} onChange={(e) => setThermalDeltaT(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>跟踪帧数</label><input type="number" min={1} className={inputCls} value={trackingFrames} onChange={(e) => setTrackingFrames(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>地形坡度 (°)</label><input type="number" step={0.5} min={0} className={inputCls} value={terrainSlopeDeg} onChange={(e) => setTerrainSlopeDeg(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>距学校 (km)</label><input type="number" step={0.1} min={0} className={inputCls} value={distSchoolKm} onChange={(e) => setDistSchoolKm(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>温度 (℃)</label><input type="number" step={0.5} className={inputCls} value={tempC} onChange={(e) => setTempC(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>天气</label><select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className={labelCls}>风速 (km/h)</label><input type="number" step={1} min={0} className={inputCls} value={windKmh} onChange={(e) => setWindKmh(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>降水 (mm)</label><input type="number" step={0.1} min={0} className={inputCls} value={rainfallMm} onChange={(e) => setRainfallMm(Number(e.target.value) || 0)} /></div>
            </div>

            <div>
              <label className={labelCls}>当前系统状态</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setSystemState(l.value)}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-bold text-white transition ${systemState === l.value ? `${l.bg} ring-2 ring-white/70` : `${l.bg} opacity-40 hover:opacity-70`}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 定位区域 */}
            <div className="rounded-lg border border-purple-500/25 bg-slate-800/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <MapPin size={14} className="text-cyan-400" />
                <span className="text-xs font-medium text-slate-200">事发位置</span>
                {simLocating && <span className="text-[11px] text-cyan-300">定位中…</span>}
                <button
                  type="button"
                  onClick={autoLocateSim}
                  disabled={simLocating}
                  className="ml-auto inline-flex items-center gap-1 rounded bg-cyan-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  <LocateFixed size={11} className={simLocating ? 'animate-spin' : ''} /> 重新定位
                </button>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {SIM_PRESETS.map((p, i) => (
                  <button key={p.name} type="button" onClick={() => applySimPreset(i)}
                    className="rounded border border-slate-600/40 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200">
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">{simAddr}</span>
                <span>坐标 {simLat?.toFixed(3)}, {simLng?.toFixed(3)}</span>
              </div>
            </div>

            {locateErr && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                <AlertTriangle size={15} /> {locateErr}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/[0.06] px-3 py-2">
              <Cctv size={15} className="text-fuchsia-300" />
              <div className="text-xs">
                <div className="font-medium text-slate-200">当前接入：{live.running ? (live.name || '实时直播') : '未启动直播'}</div>
                <div className="text-[11px] text-slate-400">
                  {live.place ? `${live.place} · ` : ''}
                  {det?.running ? `检出 ${detCount} 头${elephantHit ? '（大象）' : ''} · 置信度 ${detConf.toFixed(2)}` : '等待实时检测…'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${armed ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-purple-500/25 bg-slate-800/50'}`}>
                <span className={`h-2 w-2 rounded-full ${armed ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
                <span className="text-xs text-slate-200">自动推演链路：{armed ? '已布防' : '未布防'}</span>
              </div>
              {flash && (
                <span className="flex items-center gap-1 rounded-lg bg-fuchsia-500/15 px-3 py-2 text-xs font-medium text-fuchsia-200 ring-1 ring-fuchsia-400/30">
                  <Zap size={13} /> {flash}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setArmed((v) => !v)}
                  disabled={!live.running}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${armed ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-emerald-400/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'}`}
                >
                  {armed ? <Pause size={14} /> : <Play size={14} />}{armed ? '撤防' : '布防自动推演'}
                </button>
                <button
                  onClick={handleLiveNow}
                  disabled={!det?.running || detCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Crosshair size={14} /> 立即用当前检测推演
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-purple-500/25 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-600/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/50">取消</button>
          {mode === 'param' && (
            <button type="button" onClick={handleStart} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-cyan-500">
              <Crosshair size={15} /> 开始推演
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
