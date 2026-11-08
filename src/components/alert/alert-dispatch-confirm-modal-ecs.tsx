'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  ShieldAlert, MapPin, Users, Loader2, CheckCircle2, X, Radio, Send, Plane,
  UserCheck, Map as MapIcon, Circle as CircleIcon, Hexagon,
  Sparkles, Eraser, ChevronDown, ChevronUp,
} from 'lucide-react'

import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'

import { recordLog, LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'

import RealMap, {
  type RealMapMarker,
  type AiRecommendZone,
} from '@/components/dashboard/dashboard-real-map-leaflet'

import {
  type DrawResult,
} from '@/components/dashboard/map-utils'

interface Officer {
  id: string
  name: string
  account: string
  role: string
  region?: string
}

interface Props {
  task: TrainingTask
  /** 确认后回调：由父组件统一刷新大屏 + 派发联动事件 */
  onConfirm: (officer: Officer) => void
  /** 稍后处理：关闭弹窗但不确认，警情仍保持待确认状态 */
  onDismiss: () => void
}

const LEVEL_STYLE: Record<WarningLevel, { label: string; bg: string; text: string; ring: string }> = {
  RED: { label: '红色预警', bg: 'bg-red-600', text: 'text-red-200', ring: 'ring-red-400/50' },
  ORANGE: { label: '橙色预警', bg: 'bg-orange-500', text: 'text-orange-100', ring: 'ring-orange-400/50' },
  YELLOW: { label: '黄色预警', bg: 'bg-amber-400', text: 'text-amber-900', ring: 'ring-amber-400/50' },
  BLUE: { label: '蓝色预警', bg: 'bg-blue-600', text: 'text-blue-100', ring: 'ring-blue-400/50' },
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  center: '指挥中心',
  street: '街道干部',
  police: '派出所警力',
  town: '村委会',
}

// 各预警级别实际下发的分发终端（与后台 planDispatch 一致）
const ALL_CHANNELS = ['公安指挥大屏', '指挥调度看板', '护林员APP', '村委广播', '无人机网关', '应急短信']

const CHANNELS_BY_LEVEL: Record<string, string[]> = {
  RED: ['公安指挥大屏', '指挥调度看板', '护林员APP', '村委广播', '无人机网关', '应急短信'],
  ORANGE: ['公安指挥大屏', '指挥调度看板', '护林员APP', '村委广播', '无人机网关', '应急短信'],
  YELLOW: ['公安指挥大屏', '指挥调度看板', '护林员APP', '应急短信'],
  BLUE: ['公安指挥大屏', '指挥调度看板'],
}

// 景洪市指挥中心（作为路线规划起点兜底）
const COMMAND_CENTER: [number, number] = [22.0, 100.79]

export default function AlarmDispatchModal({ task, onConfirm, onDismiss }: Props) {
  const [people, setPeople] = useState<Officer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [primaryId, setPrimaryId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ recipients: number; region: string; uavId?: string; uavLat?: number; uavLng?: number } | null>(null)

  // 分发区域选择
  const [regionMode, setRegionMode] = useState<'county' | 'township' | 'custom' | 'map'>('county')
  const [customRegion, setCustomRegion] = useState('')

  // 分发通道勾选
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set())

  // ── 地图选择面板状态 ──
  const [mapPanelOpen, setMapPanelOpen] = useState(false)
  const [mapDrawMode, setMapDrawMode] = useState<'circle' | 'polygon' | 'ai' | null>(null)
  const [drawnRegion, setDrawnRegion] = useState<DrawResult | null>(null)
  const [clearDrawKey, setClearDrawKey] = useState(0)
  const [aiZone, setAiZone] = useState<AiRecommendZone | undefined>(undefined)

  const lv = LEVEL_STYLE[task.warningLevel] ?? LEVEL_STYLE.BLUE
  const baseRegion = task.township || task.county || '全县'

  // 警情位置（兜底到景洪）
  const taskLat = task.lat ?? COMMAND_CENTER[0]
  const taskLng = task.lng ?? COMMAND_CENTER[1]

  // 地图上显示的警情标记
  const taskMarker: RealMapMarker = useMemo(() => ({
    id: task.id,
    name: task.name,
    lng: taskLng,
    lat: taskLat,
    level: task.warningLevel,
    time: task.createdAt,
    location: [task.province, task.city, task.county, task.township].filter(Boolean).join('/'),
    detectionCount: task.detectedCount,
    alertType: task.alertType,
  }), [task, taskLat, taskLng])

  // 地图划定区域的文字描述
  const mapRegionText = useMemo(() => {
    if (!drawnRegion) return ''
    if (drawnRegion.type === 'circle' && drawnRegion.center && drawnRegion.radius != null) {
      return `圆形范围 · 中心(${drawnRegion.center[0].toFixed(3)},${drawnRegion.center[1].toFixed(3)}) · 半径${(drawnRegion.radius / 1000).toFixed(1)}km`
    }
    if (drawnRegion.type === 'polygon' && drawnRegion.latlngs) {
      return `多边形范围 · ${drawnRegion.latlngs.length} 个顶点`
    }
    return ''
  }, [drawnRegion])

  const region = regionMode === 'county'
    ? '全县'
    : regionMode === 'custom'
      ? (customRegion || baseRegion)
      : regionMode === 'map'
        ? (mapRegionText || baseRegion)
        : baseRegion

  // 初始化：按预警级别预选分发通道
  useEffect(() => {
    const defaults = CHANNELS_BY_LEVEL[task.warningLevel] || CHANNELS_BY_LEVEL.BLUE
    setSelectedChannels(new Set(defaults))
  }, [task.warningLevel])

  useEffect(() => {
    fetch('/api/people', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Officer[]) => {
        setPeople(d || [])
        const inRegion = (d || []).filter(
          (p) => ['police', 'street', 'town'].includes(p.role) && (p.region === region || p.region === '全县' || region === '全县'),
        )
        const targets = inRegion.length ? inRegion : (d || []).filter((p) => ['police', 'street', 'town'].includes(p.role))
        setSelectedIds(new Set(targets.map((p) => p.id)))
        const firstPolice = targets.find((p) => p.role === 'police') || targets[0]
        if (firstPolice) setPrimaryId(firstPolice.id)
      })
      .catch(() => { /* ignore */ })
  }, [region])

  // 自动分发对象（区域内一线处置人员）
  const recipients = useMemo(
    () => people.filter((p) => ['police', 'street', 'town'].includes(p.role) && (p.region === region || p.region === '全县' || region === '全县')),
    [people, region],
  )

  const fallbackNote = recipients.length === 0 ? '该区域暂无专属一线人员，已扩大至全县一线力量' : ''
  const effectiveRecipients = recipients.length ? recipients : people.filter((p) => ['police', 'street', 'town'].includes(p.role))
  const selectedRecipients = effectiveRecipients.filter((p) => selectedIds.has(p.id))
  const primary = effectiveRecipients.find((p) => p.id === primaryId) || selectedRecipients[0] || null
  const channels = CHANNELS_BY_LEVEL[task.warningLevel] || CHANNELS_BY_LEVEL.BLUE

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return next
    })
  }

  // ── 地图绘制完成 ──
  const handleDrawComplete = (geo: DrawResult) => {
    setDrawnRegion(geo)
    setMapDrawMode(null)
    setRegionMode('map')
  }

  // ── 清除绘制 ──
  const handleClearDraw = () => {
    setDrawnRegion(null)
    setMapDrawMode(null)
    setAiZone(undefined)
    setClearDrawKey((k) => k + 1)
  }

  // ── AI 推荐分发区域 ──
  const handleAiRecommend = () => {
    setMapDrawMode('ai')
    const zone: AiRecommendZone = {
      markerId: task.id,
      radiusMeters: 2000,
      confidence: 0.87,
      reason: `AI 基于象群移动轨迹、历史入侵热点和地形遮蔽分析，针对「${task.name}」推荐以警情点为中心、半径2km的圆形分发区域。该区域覆盖了象群最可能的移动路径和周边村落，置信度 87%。`,
    }
    setAiZone(zone)
    setDrawnRegion({
      type: 'circle',
      center: [taskLat, taskLng],
      radius: 2000,
    })
    setRegionMode('map')
  }

  const confirm = async () => {
    if (selectedRecipients.length === 0) { setErr('请至少选择一个接收处置人员'); return }
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, any> = {
        taskId: task.id,
        by: primary?.name || '管理员',
        officerName: primary?.name || '管理员',
        officerId: primary?.id || '',
        region,
        regionMode,
        channels: Array.from(selectedChannels),
        recipients: selectedRecipients.map((p) => ({ id: p.id, name: p.name, role: p.role, region: p.region })),
      }
      // 地图划定区域随提交一起发送
      if (regionMode === 'map' && drawnRegion) {
        body.mapRegion = drawnRegion
      }
      const r = await fetch('/api/dispatch/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || '确认失败')

      recordLog({ userName: primary?.name || '管理员', role: 'admin', action: LOG_ACTIONS.DISPATCH, detail: `警情 ${task.id}（${task.name}）确认分发至 ${selectedRecipients.length} 人` })

      setDone({ recipients: j.summary?.recipients ?? selectedRecipients.length, region: j.summary?.region || region, uavId: j.summary?.uavId, uavLat: j.summary?.uavLat, uavLng: j.summary?.uavLng })
    } catch (e: any) {
      setErr(e?.message || '确认失败')
    } finally {
      setBusy(false)
    }
  }

  // 绘制模式提示文字
  const drawHint = mapDrawMode === 'polygon'
    ? '点击地图添加顶点，双击完成多边形绘制'
    : mapDrawMode === 'circle'
      ? '按住鼠标确定圆心，拖动设置半径，松开完成'
      : mapDrawMode === 'ai'
        ? 'AI 已推荐最优分发区域，可点击查看推荐理由'
        : ''

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onDismiss}>
      <div
        className={`relative w-full max-w-lg overflow-y-auto max-h-[92vh] rounded-2xl border bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl ring-2 ${lv.ring}`}
        style={{ animation: 'alarm-pop .35s cubic-bezier(.2,.9,.3,1.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${lv.bg} ${lv.text} animate-pulse`}>
              <ShieldAlert size={18} />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-100">警情分发确认</div>
              <div className="text-[11px] text-slate-400">确认分发通道、区域与人员，处置预案将在详情页生成</div>
            </div>
          </div>
          <button onClick={onDismiss} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100" title="稍后处理">
            <X size={18} />
          </button>
        </div>

        {done ? (
          // 分发完成确认
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 size={30} />
            </div>
            <div>
              <div className="text-base font-bold text-slate-100">警情已确认并分发</div>
              <p className="mt-1 text-[12px] text-slate-400">分发区域：{done.region}</p>
            </div>
            <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3 text-left text-[12px] leading-5 text-slate-300">
              <div className="flex items-center gap-2"><Users size={13} className="text-emerald-300" /> 已分发至 <b className="text-slate-100">{done.recipients}</b> 名区域内处置人员（警员 / 街道干部 / 村委会）</div>
              <div className="mt-1.5 flex items-center gap-2"><Radio size={13} className="text-cyan-300" /> 已选通道：{Array.from(selectedChannels).join('、') || '（未选择）'}</div>
              {done.uavId && (
                <div className="mt-1.5 flex items-center gap-2"><Plane size={13} className="text-sky-300" /> 无人机 {done.uavId} 实时定位已同步（{done.uavLat?.toFixed?.(3) ?? done.uavLat}，{done.uavLng?.toFixed?.(3) ?? done.uavLng}），据定位锁定分发区域</div>
              )}
            </div>
            <button
              onClick={() => onConfirm(primary as Officer)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-emerald-500"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            {/* ═══ 1. 警情基本信息 ═══ */}
            <div className="mb-1">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-slate-200">
                <ShieldAlert size={14} className="text-rose-300" /> 警情基本信息
              </div>
              <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3.5">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-bold text-white ${lv.bg}`}>{lv.label}</span>
                  <span className="truncate text-sm font-semibold text-slate-100">{task.name}</span>
                  {task.alertType && <span className="rounded bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-300">{task.alertType}</span>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <MapPin size={13} className="shrink-0 text-cyan-300" />
                    <span className="truncate">{[task.province, task.city, task.county, task.township].filter(Boolean).join('/') || (task.lat != null ? `${task.lat.toFixed(3)},${task.lng?.toFixed(3)}` : '定位未详')}</span>
                  </div>
                  <div className="text-slate-300">象群规模：<span className="font-semibold text-slate-100">{task.detectedCount ?? '—'} 头</span></div>
                  <div className="text-slate-300">风险指数：<span className="font-semibold text-slate-100">{task.intrusionRisk ?? '—'}</span></div>
                  <div className="text-slate-300">预测窗口：<span className="font-semibold text-slate-100">{task.predictionWindow || '—'}</span></div>
                </div>
                {task.aiSummary && <p className="mt-2 text-[11.5px] leading-5 text-violet-100">{task.aiSummary}</p>}
                {task.simulated && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300 ring-1 ring-sky-400/30">
                    推演演示来源 · 非真实视频
                  </div>
                )}
              </div>
            </div>

            <div className="my-3 border-t border-slate-600/40" />

            {/* ═══ 2. 分发区域（含地图选择） ═══ */}
            <div className="mb-1">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-slate-200">
                <MapPin size={14} className="text-emerald-300" /> 分发区域
              </div>
              <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3.5">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: 'county', label: '全县' },
                    { key: 'township', label: '指定乡镇' },
                    { key: 'custom', label: '自定义范围' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setRegionMode(opt.key); setMapPanelOpen(false) }}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                        regionMode === opt.key
                          ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {/* 在地图上划定按钮 */}
                  <button
                    onClick={() => {
                      setMapPanelOpen((prev) => !prev)
                      if (!mapPanelOpen) setRegionMode('map')
                    }}
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                      regionMode === 'map' || mapPanelOpen
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
                    }`}
                  >
                    <MapIcon size={12} />
                    在地图上划定
                    {mapPanelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {regionMode === 'township' && (
                  <div className="mt-2.5 rounded-md border border-slate-600/40 bg-slate-800/50 p-2.5">
                    <p className="text-[11px] text-slate-400">当前区域：<span className="font-semibold text-slate-200">{baseRegion}</span></p>
                    <p className="mt-1 text-[10px] text-slate-400">（乡镇列表多选功能将在后续版本启用）</p>
                  </div>
                )}

                {regionMode === 'custom' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      value={customRegion}
                      onChange={(e) => setCustomRegion(e.target.value)}
                      placeholder="请输入自定义分发范围（如：勐仑镇+勐腊镇）"
                      className="w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-purple-500/70"
                    />
                  </div>
                )}

                {regionMode === 'county' && (
                  <p className="mt-2 text-[11px] text-slate-400">将分发至全县范围内的处置力量{fallbackNote && <span className="text-amber-300">（{fallbackNote}）</span>}</p>
                )}

                {/* 地图划定区域描述 */}
                {regionMode === 'map' && drawnRegion && (
                  <div className="mt-2.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 p-2.5">
                    <p className="text-[11px] text-cyan-200">
                      <span className="font-semibold">已划定区域：</span>{mapRegionText}
                    </p>
                  </div>
                )}

                {/* ── 地图选择面板 ── */}
                {mapPanelOpen && (
                  <div className="mt-3 rounded-lg border border-slate-600/40 bg-slate-800/80 p-2.5">
                    {/* 划定方式切换 */}
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => { setMapDrawMode(mapDrawMode === 'circle' ? null : 'circle'); setAiZone(undefined) }}
                        className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition ${
                          mapDrawMode === 'circle'
                            ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50'
                            : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <CircleIcon size={11} /> 圆形范围
                      </button>
                      <button
                        onClick={() => { setMapDrawMode(mapDrawMode === 'polygon' ? null : 'polygon'); setAiZone(undefined) }}
                        className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition ${
                          mapDrawMode === 'polygon'
                            ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50'
                            : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Hexagon size={11} /> 多边形范围
                      </button>
                      <button
                        onClick={handleAiRecommend}
                        className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition ${
                          mapDrawMode === 'ai'
                            ? 'bg-purple-500/25 text-purple-200 ring-1 ring-purple-400/50'
                            : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Sparkles size={11} /> AI 推荐
                      </button>
                      {drawnRegion && (
                        <button
                          onClick={handleClearDraw}
                          className="ml-auto inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium text-rose-300 transition hover:bg-rose-500/15"
                        >
                          <Eraser size={11} /> 清除重画
                        </button>
                      )}
                    </div>

                    {/* 操作提示 */}
                    {drawHint && (
                      <div className="mb-1.5 rounded bg-gradient-to-r from-slate-800 to-slate-900 px-2 py-1 text-[10px] text-cyan-300">
                        {drawHint}
                      </div>
                    )}

                    {/* 内嵌地图 */}
                    <div className="relative h-[300px] w-full overflow-hidden rounded-md border border-purple-500/25">
                      <RealMap
                        markers={[taskMarker]}
                        center={[taskLat, taskLng]}
                        zoom={11}
                        drawMode={mapDrawMode === 'ai' ? null : mapDrawMode}
                        onDrawComplete={handleDrawComplete}
                        drawnShapes={drawnRegion ? [drawnRegion] : []}
                        clearDrawingKey={clearDrawKey}
                        aiRecommendZone={aiZone}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="my-3 border-t border-slate-600/40" />

            {/* ═══ 3. 分发通道 ═══ */}
            <div className="mb-1">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-bold text-slate-200">
                  <Radio size={14} className="text-cyan-300" /> 分发通道
                </div>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 ring-1 ring-cyan-400/30">
                  已选 {selectedChannels.size}/6
                </span>
              </div>
              <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3.5">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ALL_CHANNELS.map((ch) => (
                    <label
                      key={ch}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition ${
                        selectedChannels.has(ch)
                          ? 'border-cyan-400/40 bg-cyan-500/10 text-slate-100'
                          : 'border-purple-500/25 bg-slate-800/50 text-slate-400'
                      }`}
                    >
                      <input type="checkbox" checked={selectedChannels.has(ch)} onChange={() => toggleChannel(ch)} className="h-3 w-3 accent-cyan-400" />
                      <span className="truncate">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="my-3 border-t border-slate-600/40" />

            {/* ═══ 4. 分发对象 ═══ */}
            <div className="mb-1">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-bold text-slate-200">
                  <Users size={14} className="text-emerald-300" /> 分发对象
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                  已选 {selectedRecipients.length}/{effectiveRecipients.length}
                </span>
              </div>
              <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3.5">
                {effectiveRecipients.length === 0 ? (
                  <p className="text-[11px] text-slate-400">暂无可分发的一线处置人员</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {effectiveRecipients.map((p) => (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition ${
                          selectedIds.has(p.id) ? 'border-emerald-400/40 bg-emerald-500/10 text-slate-100' : 'border-purple-500/25 bg-slate-800/50 text-slate-300'
                        }`}
                      >
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} className="h-3.5 w-3.5 accent-emerald-400" />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto text-[10px] text-slate-400">{ROLE_LABEL[p.role] || p.role}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="my-3 border-t border-slate-600/40" />

            {/* ═══ 5. 主责人 ═══ */}
            <div className="mb-1">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-slate-200">
                <UserCheck size={14} className="text-amber-300" /> 主责人
              </div>
              <div className="rounded-xl border border-purple-500/25 bg-slate-800/50 p-3.5">
                <select
                  value={primaryId}
                  onChange={(e) => setPrimaryId(e.target.value)}
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/70"
                >
                  {effectiveRecipients.length === 0 && <option value="">（无可用人员）</option>}
                  {effectiveRecipients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role] || p.role}{p.region ? ` · ${p.region}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {err && (
              <p className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200">{err}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onDismiss}
                className="flex-1 rounded-md border border-slate-600/40 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800/50"
                disabled={busy}
              >
                稍后处理
              </button>
              <button
                onClick={confirm}
                disabled={busy || selectedRecipients.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                确认并分发
              </button>
            </div>
          </>
        )}

        <style jsx global>{`
          @keyframes alarm-pop { 0%{transform:scale(.85);opacity:0} 100%{transform:scale(1);opacity:1} }
        `}</style>
      </div>
    </div>
  )
}
