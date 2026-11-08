'use client'

import { useEffect, useMemo, useState } from 'react'
import RealMap, { type RealMapMarker } from '@/components/dashboard/dashboard-real-map-leaflet'
import {
  X, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Sun,
  MapPinned, Video, Loader2, Thermometer, Droplets, Wind, Play, AlertTriangle,
  Plus, Trash2, Pencil, Check, XCircle, Crosshair,
} from 'lucide-react'
import type { WarningLevel } from '@/lib/utils/util-app-types'

export interface LocationInfoPanelProps {
  lat: number
  lng: number
  city: string
  onClose: () => void
}

interface PointWeather {
  temp: number
  humidity: number
  weatherCode: number
  weatherLabel: string
  windSpeed: number
  windDir: number
  windDirLabel: string
  windLevel: number
  windLevelName: string
  isDay: boolean
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

interface GeocodeResult {
  province: string
  city: string
  district: string
  town: string
  path: string[]
  source: 'online' | 'local'
}

interface RegionAlert {
  id: string
  name: string
  warningLevel: WarningLevel
  intrusionRisk: number
  alertType: string | null
  province: string | null
  city: string | null
  county: string | null
  township: string | null
  lat: number | null
  lng: number | null
  distanceKm: number | null
  manual: boolean
  realInference: boolean
  createdAt: string
  aiSummary: string
  status?: string
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/** YouTube 链接 → 可嵌入 iframe 地址 */
function toEmbed(src: string): string | null {
  let id: string | null = null
  const m1 = src.match(/[?&]v=([\w-]+)/)
  if (m1) id = m1[1]
  else {
    const m2 = src.match(/youtu\.be\/([\w-]+)/)
    if (m2) id = m2[1]
  }
  return id ? `https://www.youtube.com/embed/${id}` : null
}

function weatherIcon(code: number, isDay: boolean) {
  if (code === 0) return isDay ? Sun : CloudSun
  if (code === 1) return CloudSun
  if (code === 2 || code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return CloudRain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow
  if ([95, 96, 99].includes(code)) return CloudLightning
  return CloudSun
}

/** 警情事后状态（处置进展）标签 */
function alertStatusLabel(status?: string): { text: string; cls: string } | null {
  switch (status) {
    case 'RUNNING': return { text: '正在处置', cls: 'bg-amber-500/15 text-amber-200' }
    case 'COMPLETED': return { text: '已闭环', cls: 'bg-emerald-500/15 text-emerald-200' }
    case 'PENDING': return { text: '待处置', cls: 'bg-slate-500/20 text-slate-300' }
    case 'AGGREGATED': return { text: '已归档', cls: 'bg-cyan-500/15 text-cyan-200' }
    default: return null
  }
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-700/50 ${className}`} />
}

const ALERT_TYPES = ['象群入侵', '人象冲突', '农作物损毁', '闯入村庄', '道路预警']
const LEVELS: { value: WarningLevel; label: string; bg: string }[] = [
  { value: 'RED', label: '红色', bg: 'bg-red-600' },
  { value: 'ORANGE', label: '橙色', bg: 'bg-orange-500' },
  { value: 'YELLOW', label: '黄色', bg: 'bg-amber-400' },
  { value: 'BLUE', label: '蓝色', bg: 'bg-blue-600' },
]

export default function LocationInfoPanel({ lat, lng, city, onClose }: LocationInfoPanelProps) {
  const [weather, setWeather] = useState<{ loading: boolean; data?: PointWeather; error?: string }>({ loading: true })
  const [geo, setGeo] = useState<{ loading: boolean; data?: GeocodeResult; error?: string }>({ loading: true })
  const [videos, setVideos] = useState<{ loading: boolean; list: VideoSource[]; error?: string }>({ loading: true, list: [] })
  const [preview, setPreview] = useState<VideoSource | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddVideo, setShowAddVideo] = useState(false)

  const [region, setRegion] = useState<{ loading: boolean; total: number; counts: Record<string, number>; alerts: RegionAlert[]; error?: string }>({ loading: true, total: 0, counts: { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }, alerts: [] })
  const [showAddAlert, setShowAddAlert] = useState(false)

  const radius = 30

  // ── 数据加载 ──
  useEffect(() => {
    let alive = true
    setWeather({ loading: true }); setGeo({ loading: true }); setVideos({ loading: true, list: [] })
    setRegion({ loading: true, total: 0, counts: { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }, alerts: [] })
    setPreview(null); setEditingId(null); setShowAddVideo(false); setShowAddAlert(false)

    const wReq = fetch(`/api/weather/point?lat=${lat}&lng=${lng}`)
      .then((r) => r.json()).then((j) => { if (alive) setWeather({ loading: false, data: j as PointWeather }) })
      .catch((e) => { if (alive) setWeather({ loading: false, error: String(e?.message || e) }) })

    const gReq = fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      .then((r) => r.json()).then((j) => { if (alive) setGeo({ loading: false, data: j as GeocodeResult }) })
      .catch((e) => { if (alive) setGeo({ loading: false, error: String(e?.message || e) }) })

    const vReq = fetch(`/api/video-sources`)
      .then((r) => r.json()).then((j) => { if (alive) setVideos({ loading: false, list: (j.sources || []) as VideoSource[] }) })
      .catch((e) => { if (alive) setVideos({ loading: false, list: [], error: String(e?.message || e) }) })

    const rReq = fetch(`/api/region-alerts?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((r) => r.json()).then((j) => {
        if (!alive) return
        setRegion({ loading: false, total: j.total || 0, counts: j.counts || { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }, alerts: j.alerts || [] })
      })
      .catch((e) => { if (alive) setRegion({ loading: false, total: 0, counts: { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }, alerts: [], error: String(e?.message || e) }) })

    return () => { alive = false; void wReq; void gReq; void vReq; void rReq }
  }, [lat, lng, city])

  const refreshRegion = () => {
    fetch(`/api/region-alerts?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((r) => r.json()).then((j) => setRegion({ loading: false, total: j.total || 0, counts: j.counts || { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }, alerts: j.alerts || [] }))
      .catch((e) => setRegion((p) => ({ ...p, loading: false, error: String(e?.message || e) })))
  }
  const refreshVideos = () => {
    fetch(`/api/video-sources`).then((r) => r.json()).then((j) => setVideos({ loading: false, list: j.sources || [] }))
      .catch((e) => setVideos({ loading: false, list: [], error: String(e?.message || e) }))
  }

  const WIcon = weather.data ? weatherIcon(weather.data.weatherCode ?? 1, weather.data.isDay ?? true) : CloudSun
  const mapMarker: RealMapMarker[] = [{ id: 'pick', name: city || '选定位置', lng, lat, level: 'BLUE', risk: 0 }]

  // 视频源：按距离排序，标注与选中点的距离
  const sortedVideos = useMemo(() => {
    return [...videos.list].sort((a, b) => {
      const da = a.lat != null && a.lng != null ? haversine(lat, lng, a.lat, a.lng) : 1e9
      const db = b.lat != null && b.lng != null ? haversine(lat, lng, b.lat, b.lng) : 1e9
      return da - db
    })
  }, [videos.list, lat, lng])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="dv-panel relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="relative z-10 mb-4 flex items-start justify-between gap-3 border-b border-slate-700/50 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-cyan-100">
              <MapPinned size={20} className="text-cyan-300" />
              {city || '选定位置'} · 地点详情
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">坐标 {lat.toFixed(4)}°N, {lng.toFixed(4)}°E</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-white" title="关闭并返回大屏">
            <X size={20} />
          </button>
        </div>

        {/* 行政区划层级 */}
        <section className="dv-card mb-4 p-4">
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-200">
            <MapPinned size={16} /> 行政区划层级
            {geo.data && (
              <span className="ml-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">{geo.data.source === 'online' ? '在线逆地理' : '本地降级'}</span>
            )}
          </h4>
          {geo.loading ? (
            <div className="flex gap-2"><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-20" /></div>
          ) : geo.error ? (
            <p className="flex items-center gap-1.5 text-xs text-rose-300"><AlertTriangle size={14} /> 行政区划获取失败</p>
          ) : geo.data ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {geo.data.path.map((p, i) => (
                <span key={`${p}-${i}`} className="flex items-center gap-2">
                  <span className={`rounded-md px-2.5 py-1 font-medium ${i === geo.data!.path.length - 1 ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40' : 'bg-slate-700/50 text-slate-200'}`}>{p}</span>
                  {i < geo.data!.path.length - 1 && <span className="text-slate-500">→</span>}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* 天气 */}
          <section className="dv-card p-4 md:col-span-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-200"><CloudSun size={16} /> 天气状态</h4>
            {weather.loading ? (
              <div className="space-y-3"><Skeleton className="h-12 w-12 rounded-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            ) : weather.error ? (
              <p className="flex items-center gap-1.5 text-xs text-rose-300"><AlertTriangle size={14} /> 天气获取失败</p>
            ) : weather.data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <WIcon size={40} className="text-cyan-200" />
                  <div><div className="text-3xl font-bold text-white">{weather.data.temp.toFixed(1)}°C</div><div className="text-xs text-slate-300">{weather.data.weatherLabel}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1.5 text-slate-300"><Droplets size={15} className="text-sky-300" /> 湿度 {weather.data.humidity}%</div>
                  <div className="flex items-center gap-1.5 text-slate-300"><Thermometer size={15} className="text-rose-300" /> {weather.data.isDay ? '白天' : '夜间'}</div>
                  <div className="col-span-2 flex items-center gap-1.5 text-slate-300"><Wind size={15} className="text-emerald-300" />{weather.data.windDirLabel} · {weather.data.windSpeed.toFixed(1)} m/s · {weather.data.windLevel} 级（{weather.data.windLevelName}）</div>
                </div>
              </div>
            ) : null}
          </section>

          {/* 地图 */}
          <section className="dv-card relative isolate z-0 overflow-hidden p-0 md:col-span-8">
            <div className="relative z-10 flex items-center gap-1.5 border-b border-slate-700/50 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-cyan-200 backdrop-blur-sm"><MapPinned size={16} /> 地图信息（可缩放 / 拖拽）</div>
            <div className="relative z-0 h-[260px] w-full"><RealMap markers={mapMarker} center={[lat, lng]} zoom={11} className="h-full w-full" /></div>
          </section>

          {/* 视频信息（真实 CRUD，连接后台 video-sources.json） */}
          <section className="dv-card p-4 md:col-span-12">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-200">
              <Video size={16} /> 视频源（监控接入点）
              <span className="ml-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">实时 CRUD · 连接后台</span>
            </h4>
            <div className="mb-3 flex items-center justify-between">
              {preview ? (
                <button onClick={() => setPreview(null)} className="rounded-md border border-slate-600/60 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700/50">返回列表</button>
              ) : (
                <span className="text-xs text-slate-400">共 {videos.list.length} 个接入点 · 按距本点距离排序</span>
              )}
              {!preview && (
                <button onClick={() => setShowAddVideo((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500">
                  <Plus size={14} /> 新增视频源
                </button>
              )}
            </div>

            {showAddVideo && !preview && (
              <AddVideoForm
                lat={lat} lng={lng} city={city}
                onDone={() => { setShowAddVideo(false); refreshVideos() }}
                onCancel={() => setShowAddVideo(false)}
              />
            )}

            {preview ? (
              <VideoPreview source={preview} onClose={() => setPreview(null)} />
            ) : videos.loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-video w-full" />)}</div>
            ) : videos.error ? (
              <p className="flex items-center gap-1.5 text-xs text-rose-300"><AlertTriangle size={14} /> 视频源加载失败</p>
            ) : sortedVideos.length === 0 ? (
              <p className="text-xs text-slate-400">暂无视频源，点击「新增视频源」登记摄像头 / 直播地址（坐标默认落在本点）。</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sortedVideos.map((v) => (
                  <div key={v.id} className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3">
                    {editingId === v.id ? (
                      <EditVideoForm source={v} onDone={() => { setEditingId(null); refreshVideos() }} onCancel={() => setEditingId(null)} />
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-100">{v.name}</div>
                            <div className="text-[11px] text-slate-400">{v.place || '未填地点'}</div>
                            {v.lat != null && v.lng != null && (
                              <div className="text-[11px] text-cyan-400">距本点 {haversine(lat, lng, v.lat, v.lng).toFixed(1)} km</div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button onClick={() => setPreview(v)} className="rounded p-1 text-cyan-300 hover:bg-slate-700/60" title="预览"><Play size={15} /></button>
                            <button onClick={() => setEditingId(v.id)} className="rounded p-1 text-slate-300 hover:bg-slate-700/60" title="编辑"><Pencil size={15} /></button>
                            <button onClick={async () => { if (confirm(`确认删除视频源「${v.name}」？`)) { await fetch(`/api/video-sources?id=${v.id}`, { method: 'DELETE' }); refreshVideos() } }} className="rounded p-1 text-rose-300 hover:bg-slate-700/60" title="删除"><Trash2 size={15} /></button>
                          </div>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-slate-500">{v.source}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 区域警情（真实数据，连接后台 training-db.json） */}
          <section className="dv-card p-4 md:col-span-12">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-200">
              <AlertTriangle size={16} /> 区域警情（{radius} km 内）
              <span className="ml-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">平台数据</span>
            </h4>
            <div className="mb-3 flex items-center justify-between">
              {!showAddAlert && (
                <span className="text-xs text-slate-400">
                  该区域累计警情 <span className="text-lg font-bold text-white">{region.total}</span> 起
                </span>
              )}
              <button onClick={() => setShowAddAlert((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500">
                <Plus size={14} /> 在此区域新增警情
              </button>
            </div>

            {showAddAlert && (
              <AddAlertForm
                lat={lat} lng={lng} city={city} geo={geo.data}
                onDone={() => { setShowAddAlert(false); refreshRegion() }}
                onCancel={() => setShowAddAlert(false)}
              />
            )}

            {region.loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    { k: 'RED', label: '红色', bg: 'bg-red-500' },
                    { k: 'ORANGE', label: '橙色', bg: 'bg-orange-500' },
                    { k: 'YELLOW', label: '黄色', bg: 'bg-yellow-400' },
                    { k: 'BLUE', label: '蓝色', bg: 'bg-cyan-400' },
                  ] as const).map((lv) => (
                    <div key={lv.k} className="rounded-md border border-slate-700/50 bg-slate-800/40 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400"><span className={`inline-block h-2.5 w-2.5 rounded-full ${lv.bg}`} /> {lv.label}预警</div>
                      <div className="mt-1 text-2xl font-bold text-white">{region.counts[lv.k] ?? 0}</div>
                    </div>
                  ))}
                </div>

                {region.error ? (
                  <p className="flex items-center gap-1.5 text-xs text-rose-300"><AlertTriangle size={14} /> 区域警情加载失败</p>
                ) : region.alerts.length === 0 ? (
                  <p className="text-xs text-slate-400">该半径内暂无真实警情记录。点击「在此区域新增警情」登记一条，将实时写入后台并在大屏联动。</p>
                ) : (
                  <ul className="space-y-2">
                    {region.alerts.map((a) => (
                      <li key={a.id} className="rounded-md border border-slate-700/50 bg-slate-800/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${(LEVELS.find((l) => l.value === a.warningLevel) || LEVELS[3]).bg}`}>{a.warningLevel}</span>
                              <span className="truncate text-sm font-medium text-slate-100">{a.name}</span>
                              {a.manual && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] text-rose-300">人工</span>}
                              {alertStatusLabel(a.status) && <span className={`rounded px-1.5 py-0.5 text-[9px] ${alertStatusLabel(a.status)!.cls}`}>{alertStatusLabel(a.status)!.text}</span>}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              {[a.province, a.city, a.county, a.township].filter(Boolean).join(' / ') || '定位未详'}
                              {a.distanceKm != null && <span className="ml-1 text-cyan-400">· 距本点 {a.distanceKm} km</span>}
                              {a.alertType && <span className="ml-1">· {a.alertType}</span>}
                            </div>
                            {a.aiSummary && <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-300">{a.aiSummary}</p>}
                          </div>
                          <button onClick={async () => { if (confirm(`确认删除警情「${a.name}」？`)) { await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [a.id] }) }); refreshRegion() } }} className="shrink-0 rounded p-1 text-rose-300 hover:bg-slate-700/60" title="删除"><Trash2 size={15} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ── 新增视频源表单 ──
function AddVideoForm({ lat, lng, city, onDone, onCancel }: { lat: number; lng: number; city: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [place, setPlace] = useState(city || '')
  const [vlat, setVlat] = useState(lat)
  const [vlng, setVlng] = useState(lng)
  const [err, setErr] = useState<string | null>(null)
  const cls = 'w-full rounded-md border border-slate-600/70 bg-slate-800/80 px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-400/70'
  const submit = async () => {
    if (!name.trim() || !source.trim()) { setErr('请填写名称与视频源地址'); return }
    const r = await fetch('/api/video-sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), source: source.trim(), place: place.trim() || undefined, lat: vlat, lng: vlng }),
    })
    if (r.ok) onDone()
    else { const j = await r.json().catch(() => null); setErr(j?.error || '新增失败') }
  }
  return (
    <div className="mb-3 rounded-md border border-cyan-400/30 bg-cyan-500/[0.05] p-3">
      <div className="grid grid-cols-2 gap-2">
        <input className={cls} placeholder="名称（如：更戛乡卡点摄像头）" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={cls} placeholder="源地址 YouTube/RTSP/0/路径" value={source} onChange={(e) => setSource(e.target.value)} />
        <input className={cls} placeholder="地点" value={place} onChange={(e) => setPlace(e.target.value)} />
        <div className="flex gap-2">
          <input className={cls} type="number" step={0.0001} value={vlat} onChange={(e) => setVlat(Number(e.target.value))} />
          <input className={cls} type="number" step={0.0001} value={vlng} onChange={(e) => setVlng(Number(e.target.value))} />
        </div>
      </div>
      {err && <p className="mt-2 flex items-center gap-1 text-xs text-rose-300"><XCircle size={13} /> {err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-slate-600/60 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700/40">取消</button>
        <button onClick={submit} className="rounded-md bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500">保存</button>
      </div>
    </div>
  )
}

// ── 编辑视频源表单 ──
function EditVideoForm({ source, onDone, onCancel }: { source: VideoSource; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(source.name)
  const [src, setSrc] = useState(source.source)
  const [place, setPlace] = useState(source.place || '')
  const [vlat, setVlat] = useState(source.lat ?? 0)
  const [vlng, setVlng] = useState(source.lng ?? 0)
  const cls = 'w-full rounded-md border border-slate-600/70 bg-slate-800/80 px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-400/70'
  const submit = async () => {
    const r = await fetch('/api/video-sources', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: source.id, name: name.trim(), source: src.trim(), place: place.trim() || undefined, lat: vlat, lng: vlng }),
    })
    if (r.ok) onDone()
  }
  return (
    <div className="space-y-2">
      <input className={cls} value={name} onChange={(e) => setName(e.target.value)} />
      <input className={cls} value={src} onChange={(e) => setSrc(e.target.value)} />
      <input className={cls} placeholder="地点" value={place} onChange={(e) => setPlace(e.target.value)} />
      <div className="flex gap-2">
        <input className={cls} type="number" step={0.0001} value={vlat} onChange={(e) => setVlat(Number(e.target.value))} />
        <input className={cls} type="number" step={0.0001} value={vlng} onChange={(e) => setVlng(Number(e.target.value))} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-slate-600/60 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700/40">取消</button>
        <button onClick={submit} className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500"><Check size={13} /> 保存</button>
      </div>
    </div>
  )
}

// ── 视频预览 ──
function VideoPreview({ source, onClose }: { source: VideoSource; onClose: () => void }) {
  const embed = toEmbed(source.source)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-sm text-slate-200">{source.name}</span>
        <button onClick={onClose} className="rounded-md border border-slate-600/60 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700/50">返回列表</button>
      </div>
      {embed ? (
        <iframe src={embed} className="aspect-video w-full rounded-md bg-black" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={source.name} />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center rounded-md bg-black/60 text-center text-xs text-slate-400">
          <Video size={28} className="mb-2 text-slate-500" />
          该源为 RTSP / 摄像头 / 本地文件，浏览器无法直接预览
          <span className="mt-1 break-all px-3 text-[11px] text-slate-500">{source.source}</span>
        </div>
      )}
    </div>
  )
}

// ── 在此区域新增警情表单 ──
function AddAlertForm({ lat, lng, city, geo, onDone, onCancel }: { lat: number; lng: number; city: string; geo?: GeocodeResult | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [alertType, setAlertType] = useState(ALERT_TYPES[0])
  const [level, setLevel] = useState<WarningLevel>('ORANGE')
  const [risk, setRisk] = useState(60)
  const [err, setErr] = useState<string | null>(null)
  const cls = 'w-full rounded-md border border-slate-600/70 bg-slate-800/80 px-2.5 py-1.5 text-sm text-white outline-none focus:border-cyan-400/70'
  const submit = async () => {
    if (!name.trim()) { setErr('请填写警情名称'); return }
    const r = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), alertType, warningLevel: level, intrusionRisk: risk,
        province: geo?.province || '云南省', city: geo?.city || city || undefined,
        county: geo?.district || undefined, township: geo?.town || undefined,
        lat, lng, manual: true, hasMedia: false,
      }),
    })
    if (r.ok) onDone()
    else { const j = await r.json().catch(() => null); setErr(j?.error || '新增失败') }
  }
  return (
    <div className="mb-3 rounded-md border border-rose-400/30 bg-rose-500/[0.05] p-3">
      <div className="grid grid-cols-2 gap-2">
        <input className={cls} placeholder="警情名称（如：更戛乡象群逼近村寨）" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={cls} value={alertType} onChange={(e) => setAlertType(e.target.value)}>{ALERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <div>
          <div className="mb-1 flex gap-1.5">
            {LEVELS.map((l) => (
              <button key={l.value} onClick={() => setLevel(l.value)} className={`flex-1 rounded px-1.5 py-1 text-[11px] font-bold text-white ${level === l.value ? `${l.bg} ring-2 ring-white/70` : `${l.bg} opacity-40`}`}>{l.label}</button>
            ))}
          </div>
        </div>
        <input className={cls} type="number" min={0} max={100} value={risk} onChange={(e) => setRisk(Number(e.target.value) || 0)} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500"><Crosshair size={12} className="mr-1 inline text-cyan-400" />坐标 {lat.toFixed(4)}, {lng.toFixed(4)} 将随警情写入后台，并实时联动大屏与研判。</p>
      {err && <p className="mt-2 flex items-center gap-1 text-xs text-rose-300"><XCircle size={13} /> {err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-slate-600/60 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700/40">取消</button>
        <button onClick={submit} className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500">提交警情</button>
      </div>
    </div>
  )
}
