'use client'

// ───────────────────────────────────────────────────────────────────────────
// 数据统计(参照上云平台 /data 模块):作业/警情趋势、等级分布、站点排行、处置指标
// 数据源:/api/tasks + /api/evaluation-metrics(服务端真实计算)
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Activity, AlertTriangle, CheckCircle2, Timer, Radar, Cpu } from 'lucide-react'
import { SCREEN_SITES, haversineKm } from '@/lib/utils/util-screen-sites'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Metrics {
  alerts?: { total?: number; redOrange?: number; redOrangeRatio?: number; closed?: number; closedRatio?: number; avgResponseMin?: number }
  dispatch?: { total?: number; sent?: number }
  model?: { mAP50?: number; precision?: number; recall?: number }
}

const LEVEL_NAME: Record<string, string> = { RED: '红色', ORANGE: '橙色', YELLOW: '黄色', BLUE: '蓝色' }
const LEVEL_COLOR: Record<string, string> = { RED: '#ff4d4f', ORANGE: '#ff9a3c', YELLOW: '#ffd666', BLUE: '#4da3ff' }

export default function StatsMainView({ tasks }: { tasks: TrainingTask[] }) {
  const [m, setM] = useState<Metrics>({})
  const trendRef = useRef<HTMLDivElement>(null)
  const pieRef = useRef<HTMLDivElement>(null)
  const rankRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/evaluation-metrics', { cache: 'no-store' })
        if (r.ok && alive) setM(await r.json())
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  // 近 14 日趋势
  const trend = useMemo(() => {
    const days: string[] = []
    const counts: number[] = []
    const highs: number[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const key = d.toLocaleDateString('zh-CN')
      days.push(`${d.getMonth() + 1}/${d.getDate()}`)
      let c = 0
      let h = 0
      for (const t of tasks) {
        if (t.createdAt && new Date(t.createdAt).toLocaleDateString('zh-CN') === key) {
          c++
          if (['RED', 'ORANGE'].includes(t.warningLevel)) h++
        }
      }
      counts.push(c)
      highs.push(h)
    }
    return { days, counts, highs }
  }, [tasks])

  // 等级分布
  const levelDist = useMemo(() => {
    const dist: Record<string, number> = { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }
    for (const t of tasks) dist[t.warningLevel] = (dist[t.warningLevel] ?? 0) + 1
    return Object.entries(dist).filter(([, v]) => v > 0).map(([k, v]) => ({ name: LEVEL_NAME[k] ?? k, value: v, itemStyle: { color: LEVEL_COLOR[k] } }))
  }, [tasks])

  // 站点(区域)排行
  const siteRank = useMemo(() => {
    const rows = SCREEN_SITES.map((s) => ({ name: s.name.replace('无人机机场', '机场'), count: 0 }))
    let unlocated = 0
    for (const t of tasks) {
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number') {
        unlocated++
        continue
      }
      const tLat: number = t.lat
      const tLng: number = t.lng
      let best = -1
      let bestD = Infinity
      SCREEN_SITES.forEach((s, i) => {
        const d = haversineKm(tLat, tLng, s.lat, s.lng)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      if (best >= 0 && bestD <= 60) rows[best].count++
      else unlocated++
    }
    rows.sort((a, b) => b.count - a.count)
    return { rows, unlocated }
  }, [tasks])

  // 状态分布
  const statusDist = useMemo(() => {
    const s = { PENDING: 0, RUNNING: 0, CLOSED: 0 }
    for (const t of tasks) {
      if (t.status === 'COMPLETED' || t.aggregatedAt || t.closedAt) s.CLOSED++
      else if (t.status === 'RUNNING') s.RUNNING++
      else s.PENDING++
    }
    return s
  }, [tasks])

  // ECharts 渲染
  useEffect(() => {
    const charts: echarts.ECharts[] = []
    if (trendRef.current) {
      const c = echarts.init(trendRef.current)
      c.setOption({
        backgroundColor: 'transparent',
        grid: { left: 42, right: 16, top: 34, bottom: 26 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(3,14,38,0.92)', textStyle: { color: '#bae6fd', fontSize: 12 } },
        legend: { top: 2, right: 4, textStyle: { color: '#7dd3fc', fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        xAxis: { type: 'category', data: trend.days, axisLine: { lineStyle: { color: '#1e3a6e' } }, axisLabel: { color: '#64748b', fontSize: 10 } },
        yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: 'rgba(30,58,110,0.5)' } }, axisLabel: { color: '#64748b', fontSize: 10 } },
        series: [
          { name: '警情数', type: 'bar', data: trend.counts, barWidth: 12, itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] } },
          { name: '红橙重点', type: 'line', data: trend.highs, smooth: true, symbolSize: 5, lineStyle: { color: '#ff9a3c', width: 2 }, itemStyle: { color: '#ff9a3c' } },
        ],
      })
      charts.push(c)
    }
    if (pieRef.current) {
      const c = echarts.init(pieRef.current)
      c.setOption({
        backgroundColor: 'transparent',
        tooltip: { backgroundColor: 'rgba(3,14,38,0.92)', textStyle: { color: '#bae6fd', fontSize: 12 } },
        legend: { bottom: 0, textStyle: { color: '#7dd3fc', fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        series: [{
          type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'],
          label: { show: true, color: '#94a3b8', fontSize: 11, formatter: '{b} {c}' },
          data: levelDist.length ? levelDist : [{ name: '暂无', value: 0, itemStyle: { color: '#1e3a6e' } }],
        }],
      })
      charts.push(c)
    }
    if (rankRef.current) {
      const c = echarts.init(rankRef.current)
      c.setOption({
        backgroundColor: 'transparent',
        grid: { left: 110, right: 36, top: 10, bottom: 22 },
        tooltip: { backgroundColor: 'rgba(3,14,38,0.92)', textStyle: { color: '#bae6fd', fontSize: 12 } },
        xAxis: { type: 'value', minInterval: 1, splitLine: { show: false }, axisLabel: { color: '#64748b', fontSize: 10 } },
        yAxis: {
          type: 'category',
          data: [...siteRank.rows.map((r) => r.name), '位置未标注'],
          axisLine: { lineStyle: { color: '#1e3a6e' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
        series: [{
          type: 'bar',
          data: [...siteRank.rows.map((r) => r.count), siteRank.unlocated],
          barWidth: 12,
          itemStyle: { color: '#22d3ee', borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', color: '#7dd3fc', fontSize: 11 },
        }],
      })
      charts.push(c)
    }
    const onResize = () => charts.forEach((c) => c.resize())
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      charts.forEach((c) => c.dispose())
    }
  }, [trend, levelDist, siteRank])

  const a = m.alerts ?? {}
  const mo = m.model ?? {}

  return (
    <div className="space-y-4">
      {/* KPI 行 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Activity size={15} />} label="累计警情" value={a.total ?? tasks.length} tone="text-sky-300" />
        <Kpi icon={<AlertTriangle size={15} />} label="红橙占比" value={`${a.redOrangeRatio ?? 0}%`} tone="text-orange-300" />
        <Kpi icon={<CheckCircle2 size={15} />} label="闭环率" value={`${a.closedRatio ?? 0}%`} tone="text-emerald-300" />
        <Kpi icon={<Timer size={15} />} label="平均响应" value={`${a.avgResponseMin ?? 0} min`} tone="text-violet-300" />
        <Kpi icon={<Radar size={15} />} label="通道触达" value={m.dispatch?.total ? `${m.dispatch.sent ?? 0}/${m.dispatch.total}` : '—'} tone="text-cyan-300" />
        <Kpi icon={<Cpu size={15} />} label="模型 mAP50" value={mo.mAP50 != null ? mo.mAP50.toFixed(2) : '—'} tone="text-indigo-300" />
      </div>

      {/* 状态速览 */}
      <div className="flex flex-wrap gap-2 text-[12px] text-slate-400">
        <span className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1">待处理 <b className="text-slate-100">{statusDist.PENDING}</b></span>
        <span className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1">处置中 <b className="text-cyan-300">{statusDist.RUNNING}</b></span>
        <span className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1">已闭环 <b className="text-emerald-300">{statusDist.CLOSED}</b></span>
        <span className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1">合计 <b className="text-slate-100">{tasks.length}</b></span>
      </div>

      {/* 图表区 */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="近 14 日警情趋势">
          <div ref={trendRef} className="h-[260px] w-full" />
        </ChartCard>
        <ChartCard title="预警等级分布">
          <div ref={pieRef} className="h-[260px] w-full" />
        </ChartCard>
        <ChartCard title="站点 / 区域预警排行" className="xl:col-span-2">
          <div ref={rankRef} className="h-[240px] w-full" />
        </ChartCard>
      </div>
    </div>
  )
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3.5">
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <span className={tone}>{icon}</span> {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  )
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 ${className}`}>
      <h2 className="mb-2 text-[15px] font-semibold text-cyan-100">{title}</h2>
      {children}
    </section>
  )
}
