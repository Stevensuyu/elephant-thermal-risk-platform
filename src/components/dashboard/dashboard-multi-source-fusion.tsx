'use client'

/**
 * 多源信息融合 · 入侵概率滚动预测（研究要点③）
 * ───────────────────────────────────────────────────────────────────────────
 * 对应申请书「（3）基于多源信息融合的象群活动态势感知与入侵概率预测」：
 *   接入气象数据与地理信息，融合实时无人机检测结果、历史项圈轨迹、环境遥感数据
 *   （土地覆盖 / 地形 / 水源距离 / 道路及村庄分布），构建「时间与空间」三维立体分析；
 *   以红、橙、黄、蓝四级划分「入侵风险指数」，实现 30 分钟至 2 小时之内的
 *   入侵概率滚动预测与空间可视化，为分级警情推送提供科学依据。
 *
 * 数据来源：
 *   - 气象：/api/weather（Open-Meteo 真实数据，服务端缓存 10 分钟）
 *   - 实时无人机检测 / 警情态势：tasks（与态势总览同源）
 *   - 地理空间 / 历史项圈轨迹 / 环境遥感：基于云南边境走廊的遥感要素库
 */

import { useEffect, useMemo, useState } from 'react'
import { CloudSun, Satellite, Footprints, Radar, Globe2, Waves, Timer, ShieldAlert, TrendingUp } from 'lucide-react'
import { predictRollingRisk, levelOfRisk, type RollingRiskPrediction } from '@/lib/utils/util-risk-trend-predictor'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

interface WeatherStation {
  id: string
  name: string
  lng: number
  lat: number
  current: {
    temp: number
    humidity: number
    precipitation: number
    windSpeed: number
    weatherLabel: string
  }
}

/** 服务端 /api/rolling-prediction 融合结果（气象 + 遥感 + 项圈 + 滚动窗口） */
interface FusionPayload {
  computedAt: string
  windows: RollingRiskPrediction['windows']
  peakWindow: RollingRiskPrediction['peakWindow']
  currentLevel: WarningLevel
  note: string
  sources: {
    remoteSense: {
      region: string
      summary: string
      landCover: string
      terrain: string
      slopeDeg: number
      waterDistKm: number
      roadDistKm: number
      villageDistKm: number
      isCorridor: boolean
    }
    collar: { hits: number; total: number; corridor: string; latestTs: string }
    weather: { live: boolean; label?: string; tempC?: number; humidity?: number; precipMm?: number; windKmh?: number }
  }
}

const FALLBACK_WEATHER: WeatherStation[] = [
  {
    id: 'xishuangbanna', name: '西双版纳', lng: 101.57, lat: 21.48,
    current: { temp: 26.4, humidity: 82, precipitation: 0.0, windSpeed: 1.8, weatherLabel: '局部多云' },
  },
]

/** 深色大屏下四级预警概率数值的亮色文本（区别于 light 主题的 levelStyle.text） */
const ROLLING_TEXT: Record<WarningLevel, string> = {
  RED: 'text-red-400',
  ORANGE: 'text-orange-400',
  YELLOW: 'text-amber-300',
  BLUE: 'text-sky-400',
}

interface Props {
  tasks: TrainingTask[]
  fleet: Drone[]
}

export default function MultiSourceFusionPanel({ tasks, fleet }: Props) {
  const [weather, setWeather] = useState<WeatherStation[]>(FALLBACK_WEATHER)
  const [weatherLive, setWeatherLive] = useState(false)
  const [fusion, setFusion] = useState<FusionPayload | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/weather', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { stations?: WeatherStation[] }) => {
        if (!alive) return
        if (Array.isArray(d.stations) && d.stations.length) {
          setWeather(d.stations)
          setWeatherLive(true)
        }
      })
      .catch(() => { /* 离线兜底：使用典型值 */ })
    return () => { alive = false }
  }, [])

  // 当前态势：取最高级任务作为指挥研判对象
  const commandTask = useMemo(
    () =>
      tasks.find((t) => t.warningLevel === 'RED') ||
      tasks.find((t) => t.warningLevel === 'ORANGE') ||
      tasks.find((t) => t.warningLevel === 'YELLOW') ||
      tasks.find((t) => t.warningLevel === 'BLUE') ||
      tasks[0] ||
      null,
    [tasks],
  )

  const currentRisk = commandTask?.intrusionRisk ?? 52
  const currentLevel = commandTask?.warningLevel || levelOfRisk(currentRisk)
  const lv = levelStyle[currentLevel]

  // 服务端滚动预测（研究要点③：气象+遥感+项圈融合，按指挥任务真实坐标）
  useEffect(() => {
    let alive = true
    const lat = commandTask?.lat
    const lng = commandTask?.lng
    const q = new URLSearchParams({ risk: String(currentRisk) })
    if (typeof lat === 'number') q.set('lat', String(lat))
    if (typeof lng === 'number') q.set('lng', String(lng))
    fetch(`/api/rolling-prediction?${q.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: FusionPayload) => {
        if (alive && d && Array.isArray(d.windows) && d.windows.length === 4) setFusion(d)
      })
      .catch(() => { /* 离线：回退本地推演 */ })
    return () => { alive = false }
  }, [currentRisk, commandTask?.lat, commandTask?.lng])

  // 实时检测融合要素
  const liveDetected = commandTask?.detectedCount ?? 0
  const maxConf = commandTask?.autonomous?.decisionConfidence ?? commandTask?.intrusionRisk ?? 52
  const fleetOnline = fleet.filter((d) => d.status !== '离线' && d.status !== '故障').length

  // 气象要素（取西双版纳边境站点，或首个站点）
  const station = weather.find((w) => w.id === 'xishuangbanna') || weather[0]

  // 30 分钟–2 小时入侵概率滚动预测（服务端融合优先；离线回退本地推演）
  const rolling = useMemo(() => {
    if (fusion) {
      return {
        windows: fusion.windows,
        peakWindow: fusion.peakWindow,
        currentLevel: fusion.currentLevel,
        note: fusion.note,
      }
    }
    const speedKmH = 4.8 // 站点代表移动速率 km/h（象群典型行进速度）
    const headingDot = 0.85 // 朝向村寨/农田的矢量投影（典型值）
    const rainProb30 = station ? Math.min(1, (station.current.precipitation || 0) / 3) : 0.25
    return predictRollingRisk(currentRisk, 0.8, speedKmH, headingDot, rainProb30)
  }, [currentRisk, station, fusion])

  // 多源要素详情（服务端遥感/项圈数据优先，静态典型值兜底）
  const sense = fusion?.sources.remoteSense
  const collar = fusion?.sources.collar
  const geoDetail = sense
    ? `${sense.region} · ${sense.landCover} · 地形 ${sense.terrain}(${sense.slopeDeg}°) · 距水源 ${sense.waterDistKm} km · 距道路 ${sense.roadDistKm} km · 距村庄 ${sense.villageDistKm} km`
    : '保山·昌宁边境走廊典型值 · 地形山地 6°–18° · 水源 0.6 km · 道路 1.2 km · 村庄 0.8 km'
  const collarDetail = collar
    ? `${collar.corridor} · 走廊命中 ${collar.hits}/${collar.total} · 最新轨迹 ${new Date(collar.latestTs).toLocaleString('zh-CN')}`
    : '西双版纳—普洱历史迁徙走廊 · 走廊命中 12/14'

  const sources = [
    { icon: Radar, name: '实时无人机检测', detail: `检出 ${liveDetected} 头 · 置信度 ${Math.round(maxConf)}% · 机队在线 ${fleetOnline} 架`, color: 'text-cyan-300', ring: 'ring-cyan-400/30', bg: 'bg-cyan-500/10' },
    { icon: CloudSun, name: '气象数据', detail: station ? `${station.name} · ${station.current.weatherLabel} ${station.current.temp}℃ · 湿度 ${station.current.humidity}% · 降水 ${station.current.precipitation}mm` : '气象数据获取中…', color: 'text-sky-300', ring: 'ring-sky-400/30', bg: 'bg-sky-500/10', live: weatherLive },
    { icon: Globe2, name: '地理空间', detail: geoDetail, color: 'text-emerald-300', ring: 'ring-emerald-400/30', bg: 'bg-emerald-500/10' },
    { icon: Footprints, name: '历史项圈轨迹', detail: collarDetail, color: 'text-amber-300', ring: 'ring-amber-400/30', bg: 'bg-amber-500/10' },
    { icon: Satellite, name: '环境遥感', detail: sense ? `${sense.landCover} · ${sense.region} · 遥感要素库实时投影` : '热带雨林·次生林 · 遥感要素库实时投影', color: 'text-violet-300', ring: 'ring-violet-400/30', bg: 'bg-violet-500/10' },
  ]

  return (
    <div className="dv-panel p-5">
      {/* 头部 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Waves size={20} className="text-cyan-300" />
        <h2 className="dv-title text-lg font-semibold text-slate-100">多源信息融合 · 入侵概率滚动预测</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-300 ring-1 ring-cyan-400/30">
          研究要点③ · 时间+空间三维分析
        </span>
        <span className="ml-auto text-[11px] text-slate-500">30 分钟–2 小时滚动窗口</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        {/* 左：多源信息融合要素 */}
        <div className="space-y-2.5">
          {sources.map((s) => (
            <div key={s.name} className={`flex items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3.5 py-2.5 ring-1 ${s.ring}`}>
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.color}`}>
                <s.icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
                  {s.name}
                  {s.live && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> 实时
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] leading-5 text-slate-400">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 右：入侵风险指数 + 滚动预测窗口 */}
        <div className="flex flex-col gap-3">
          {/* 当前入侵风险指数 */}
          <div className={`relative overflow-hidden rounded-xl p-4 text-white ring-2 ${lv.ring}`}>
            <div className={`absolute inset-0 ${lv.bg} opacity-90`} />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-medium text-white/90">
                <ShieldAlert size={14} />
                <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-sm font-bold">{lv.label}</span>
                <span className="ml-auto text-[11px] text-white/80">入侵风险指数</span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div className="text-5xl font-black tracking-tight">{currentRisk}</div>
                <div className="pb-1 text-right text-[11px] leading-4 text-white/85">
                  <div>预测窗口 {commandTask?.predictionWindow || '2 小时以上'}</div>
                  <div className="mt-0.5">{rolling.note.length > 26 ? rolling.note.slice(0, 26) + '…' : rolling.note}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 30min–2h 滚动预测窗口 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Timer size={13} className="text-cyan-300" /> 入侵概率滚动预测（30 分钟–2 小时）
            </div>
            <div className="grid grid-cols-4 gap-2">
              {rolling.windows.map((w) => {
                const ws = levelStyle[w.level]
                return (
                  <div key={w.minutes} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-2.5 text-center">
                    <div className="text-[10px] text-slate-500">+{w.minutes} 分钟</div>
                    <div className={`mt-1 text-lg font-black ${ROLLING_TEXT[w.level]}`}>{w.probability}%</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                      <div className={`h-full rounded-full ${ws.bar}`} style={{ width: `${w.probability}%` }} />
                    </div>
                    <div className="mt-1.5 text-[10px] font-medium text-slate-300">{ws.label.replace('预警', '')}</div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-5 text-slate-400">
              <TrendingUp size={12} className="mt-0.5 shrink-0 text-amber-400" />
              {rolling.note}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
