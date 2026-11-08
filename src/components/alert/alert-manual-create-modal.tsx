'use client'

import { useEffect, useState } from 'react'
import { MapPin, LocateFixed, Upload, X, Crosshair, Cctv, AlertTriangle } from 'lucide-react'
import type { WarningLevel } from '@/lib/utils/util-app-types'

/** HTTP 环境 / 定位被拒时的云南边境预设位置（真实经纬度） */
const PRESET_LOCATIONS = [
  { name: '保山·昌宁·更戛乡', lat: 24.32, lng: 99.68, province: '云南省', city: '保山市', county: '昌宁县', township: '更戛乡' },
  { name: '普洱·澜沧·糯扎渡镇', lat: 22.62, lng: 100.35, province: '云南省', city: '普洱市', county: '澜沧拉祜族自治县', township: '糯扎渡镇' },
  { name: '西双版纳·景洪·勐养镇', lat: 22.15, lng: 100.78, province: '云南省', city: '西双版纳傣族自治州', county: '景洪市', township: '勐养镇' },
  { name: '临沧·双江·大文乡', lat: 23.35, lng: 99.85, province: '云南省', city: '临沧市', county: '双江拉祜族佤族布朗族傣族自治县', township: '大文乡' },
  { name: '德宏·盈江·铜壁关乡', lat: 24.55, lng: 97.78, province: '云南省', city: '德宏傣族景颇族自治州', county: '盈江县', township: '铜壁关乡' },
]

export interface ManualAlertPayload {
  name: string
  description: string
  alertType: string
  warningLevel: WarningLevel
  intrusionRisk: number
  province?: string
  city?: string
  county?: string
  township?: string
  lat?: number
  lng?: number
  hasMedia: boolean
  sourceDevice?: string
  media?: File | null
}

const ALERT_TYPES = ['象群入侵', '人象冲突', '农作物损毁', '闯入村庄', '道路预警']

const LEVELS: { value: WarningLevel; label: string; bg: string }[] = [
  { value: 'RED', label: '红色预警', bg: 'bg-red-600' },
  { value: 'ORANGE', label: '橙色预警', bg: 'bg-orange-500' },
  { value: 'YELLOW', label: '黄色预警', bg: 'bg-amber-400' },
  { value: 'BLUE', label: '蓝色预警', bg: 'bg-blue-600' },
]

interface ManualAlertModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: ManualAlertPayload) => Promise<void>
  devices: string[]
}

export default function ManualAlertModal({ isOpen, onClose, onSubmit, devices }: ManualAlertModalProps) {
  const [name, setName] = useState('')
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [warningLevel, setWarningLevel] = useState<WarningLevel>('ORANGE')
  const [intrusionRisk, setIntrusionRisk] = useState(60)
  const [description, setDescription] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [county, setCounty] = useState('')
  const [township, setTownship] = useState('')
  const [lat, setLat] = useState<number | undefined>()
  const [lng, setLng] = useState<number | undefined>()
  const [locating, setLocating] = useState(false)
  const [locateErr, setLocateErr] = useState<string | null>(null)
  const [hasMedia, setHasMedia] = useState(false)
  const [media, setMedia] = useState<File | null>(null)
  const [sourceDevice, setSourceDevice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [locateMode, setLocateMode] = useState<'idle' | 'locating' | 'success' | 'fallback'>('idle')

  /** 打开弹窗时自动尝试定位；HTTP 环境或被拒时降级到预设位置 */
  useEffect(() => {
    if (!isOpen) return
    // 延迟一帧确保 DOM 就绪
    const t = setTimeout(() => autoLocate(), 100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const applyPreset = (idx: number) => {
    const p = PRESET_LOCATIONS[idx]
    setLat(p.lat); setLng(p.lng)
    setProvince(p.province); setCity(p.city); setCounty(p.county); setTownship(p.township)
    setLocateMode('fallback')
    setLocateErr(null)
  }

  const autoLocate = () => {
    setLocateErr(null)
    // HTTP 环境下 geolocation 通常不可用，直接降级
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setLocateErr('HTTP 环境不支持浏览器定位，已使用默认位置（可手动选择）')
      applyPreset(0)
      return
    }
    if (!navigator.geolocation) {
      setLocateErr('当前浏览器不支持定位，已使用默认位置')
      applyPreset(0)
      return
    }
    setLocateMode('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = Number(pos.coords.latitude.toFixed(5))
        const ln = Number(pos.coords.longitude.toFixed(5))
        setLat(la); setLng(ln)
        try {
          const r = await fetch(`/api/geocode/reverse?lat=${la}&lng=${ln}`, { cache: 'no-store' })
          if (r.ok) {
            const j = await r.json()
            setProvince(j.province || '云南省')
            setCity(j.city || '')
            setCounty(j.district || j.county || '')
            setTownship(j.town || j.township || '')
          }
        } catch { /* 保留手动录入 */ }
        setLocateMode('success')
      },
      () => {
        setLocateErr('定位失败或被拒绝，已使用默认位置（可手动选择）')
        applyPreset(0)
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
    )
  }

  if (!isOpen) return null

  const reset = () => {
    setName(''); setAlertType(ALERT_TYPES[0]); setWarningLevel('ORANGE'); setIntrusionRisk(60)
    setDescription(''); setProvince(''); setCity(''); setCounty(''); setTownship('')
    setLat(undefined); setLng(undefined); setLocating(false); setLocateErr(null)
    setLocateMode('idle')
    setHasMedia(false); setMedia(null); setSourceDevice(''); setSubmitting(false)
  }

  const handleLocate = () => autoLocate()

  const handleSubmit = async () => {
    if (!name.trim()) { setLocateErr('请填写警情名称'); return }
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        alertType,
        warningLevel,
        intrusionRisk: Math.max(0, Math.min(100, Math.round(intrusionRisk))),
        province: province.trim() || undefined,
        city: city.trim() || undefined,
        county: county.trim() || undefined,
        township: township.trim() || undefined,
        lat, lng,
        hasMedia: hasMedia || !!media,
        sourceDevice: sourceDevice || undefined,
        media,
      })
      reset()
      onClose()
    } catch (e: any) {
      setLocateErr('提交失败：' + (e?.message || e))
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-purple-500/70'
  const labelCls = 'mb-1 block text-xs text-slate-400'

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl ring-1 ring-purple-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-2 border-b border-purple-500/25 pb-3">
          <Crosshair size={20} className="text-rose-400" />
          <h2 className="text-lg font-semibold text-slate-100">手动添加警情</h2>
          <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300 ring-1 ring-rose-400/30">预警研判</span>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"><X size={18} /></button>
        </div>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>警情名称 *</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：更戛乡象群逼近村寨" />
            </div>
            <div>
              <label className={labelCls}>警情类型</label>
              <select className={inputCls} value={alertType} onChange={(e) => setAlertType(e.target.value)}>
                {ALERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>预警级别</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setWarningLevel(l.value)}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-bold text-white transition ${warningLevel === l.value ? `${l.bg} ring-2 ring-white/70` : `${l.bg} opacity-40 hover:opacity-70`}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>风险指数（0-100）</label>
              <input type="number" min={0} max={100} value={intrusionRisk} onChange={(e) => setIntrusionRisk(Number(e.target.value) || 0)} className={inputCls} />
            </div>
          </div>

          {/* 定位 */}
          <div className="rounded-lg border border-purple-500/25 bg-slate-800/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <MapPin size={16} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-200">警情定位</span>
              {locateMode === 'locating' && (
                <span className="flex items-center gap-1 text-[11px] text-cyan-300">
                  <LocateFixed size={12} className="animate-spin" /> 正在定位…
                </span>
              )}
              {locateMode === 'success' && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">实时定位</span>
              )}
              {locateMode === 'fallback' && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">预设位置</span>
              )}
              <button
                type="button"
                onClick={handleLocate}
                disabled={locating || locateMode === 'locating'}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-cyan-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
              >
                <LocateFixed size={14} className={locateMode === 'locating' ? 'animate-spin' : ''} />
                重新定位
              </button>
            </div>
            {/* 预设位置快速选择（HTTP降级时尤为有用） */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">快速选点：</span>
              {PRESET_LOCATIONS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(i)}
                  className="rounded border border-slate-600/40 bg-slate-800/50 px-2 py-0.5 text-[11px] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                >
                  {p.name}
                </button>
              ))}
            </div>
            {lat != null && lng != null && (
              <div className="mb-2 rounded bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300">
                坐标：{lat}, {lng}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              <div><label className={labelCls}>省</label><input className={inputCls} value={province} onChange={(e) => setProvince(e.target.value)} placeholder="云南省" /></div>
              <div><label className={labelCls}>市</label><input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="如：保山市" /></div>
              <div><label className={labelCls}>区/县</label><input className={inputCls} value={county} onChange={(e) => setCounty(e.target.value)} placeholder="如：昌宁县" /></div>
              <div><label className={labelCls}>乡/镇</label><input className={inputCls} value={township} onChange={(e) => setTownship(e.target.value)} placeholder="如：更戛乡" /></div>
            </div>
          </div>

          <div>
            <label className={labelCls}>警情描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="描述象群数量、活动方向、威胁对象等" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>图片 / 视频证据（可选）</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-600/50 bg-slate-800/50 px-3 py-3 text-xs text-slate-400 hover:bg-slate-800/70">
                <Upload size={15} />
                {media ? media.name : '选择图片或视频'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0] || null; setMedia(f); if (f) setHasMedia(true) }}
                />
              </label>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={hasMedia} onChange={(e) => setHasMedia(e.target.checked)} className="h-3.5 w-3.5 accent-cyan-400" />
                携带图片/视频证据
              </label>
            </div>
            <div>
              <label className={labelCls}>接入摄像头 / 无人机设备</label>
              <select className={inputCls} value={sourceDevice} onChange={(e) => setSourceDevice(e.target.value)}>
                <option value="">不接入</option>
                {devices.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                <Cctv size={12} className="mr-1 inline text-emerald-400" />
                可关联实时摄像头设备，自动回传现场画面至研判链路。
              </p>
            </div>
          </div>

          {locateErr && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              <AlertTriangle size={15} /> {locateErr}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-purple-500/25 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-600/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/50">取消</button>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60">
            {submitting ? '提交中…' : '提交警情'}
          </button>
        </div>
      </div>
    </div>
  )
}
