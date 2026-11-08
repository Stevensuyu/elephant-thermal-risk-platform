'use client'

// ───────────────────────────────────────────────────────────────────────────
// 大屏主地图:云南 ECharts 地理图(本地 geojson,离线可用)
// 警情 = 涟漪散点(等级定色);机场/OS 观察站 = 固定标记
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import yunnanGeo from '@/assets/yunnan-geojson.json'
import { SCREEN_SITES } from '@/lib/utils/util-screen-sites'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Props {
  tasks: TrainingTask[]
  onOpenTask?: (t: TrainingTask) => void
}

const LEVEL_COLOR: Record<string, string> = {
  RED: '#ff4d4f',
  ORANGE: '#ff9a3c',
  YELLOW: '#ffd666',
  BLUE: '#4da3ff',
}

let mapRegistered = false
function ensureMap(ec: typeof echarts) {
  if (mapRegistered) return
  ec.registerMap('yunnan', yunnanGeo as any)
  mapRegistered = true
}

export default function ScreenMapYunnan({ tasks, onOpenTask }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  useEffect(() => {
    if (!elRef.current) return
    ensureMap(echarts)
    const chart = echarts.init(elRef.current)
    chartRef.current = chart

    chart.on('click', (params: any) => {
      if (params.seriesType === 'effectScatter') {
        const t = tasksRef.current.find((x) => x.id === params.data?.taskId)
        if (t && onOpenTask) onOpenTask(t)
      }
    })

    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [onOpenTask])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const alertData = tasks
      .filter((t) => typeof t.lat === 'number' && typeof t.lng === 'number')
      .map((t) => ({
        name: t.name,
        taskId: t.id,
        value: [t.lng, t.lat, t.intrusionRisk ?? 0],
        level: t.warningLevel,
        itemStyle: { color: LEVEL_COLOR[t.warningLevel] ?? LEVEL_COLOR.BLUE },
        time: t.createdAt ? new Date(t.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
        risk: t.intrusionRisk ?? '-',
        count: t.detectedCount ?? '-',
        summary: (t.aiSummary || t.description || '').slice(0, 90),
      }))

    const dockData = SCREEN_SITES.filter((s) => s.type === 'dock').map((s) => ({
      name: s.name,
      value: [s.lng, s.lat],
      kind: '机场',
    }))
    const osData = SCREEN_SITES.filter((s) => s.type === 'os').map((s) => ({
      name: s.name,
      value: [s.lng, s.lat],
      kind: 'OS观察站',
    }))

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: 'rgba(3,14,38,0.92)',
        borderColor: '#1d4ed8',
        textStyle: { color: '#bae6fd', fontSize: 12 },
        confine: true,
      },
      legend: {
        bottom: 12,
        left: 'center',
        orient: 'horizontal',
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: '#7dd3fc', fontSize: 12 },
        data: ['机场', 'OS观察站'],
      },
      geo: {
        map: 'yunnan',
        roam: false,
        zoom: 1.06,
        layoutCenter: ['50%', '49%'],
        layoutSize: '96%',
        label: { show: true, color: 'rgba(125,211,252,0.55)', fontSize: 11 },
        itemStyle: {
          areaColor: '#0a1f4d',
          borderColor: '#1e6fd9',
          borderWidth: 1.2,
          shadowColor: 'rgba(14,116,233,0.45)',
          shadowBlur: 18,
        },
        emphasis: {
          label: { color: '#e0f2fe', fontSize: 12 },
          itemStyle: { areaColor: '#123b7a' },
        },
      },
      series: [
        {
          name: '机场',
          type: 'scatter',
          coordinateSystem: 'geo',
          symbol: 'roundRect',
          symbolSize: [14, 14],
          itemStyle: { color: '#22d3ee', borderColor: '#fff', borderWidth: 1 },
          label: { show: true, position: 'right', color: '#67e8f9', fontSize: 11, formatter: ({ name }: any) => name.replace('无人机机场', '机场') },
          data: dockData,
          zlevel: 2,
        },
        {
          name: 'OS观察站',
          type: 'scatter',
          coordinateSystem: 'geo',
          symbol: 'diamond',
          symbolSize: 13,
          itemStyle: { color: '#a78bfa', borderColor: '#fff', borderWidth: 1 },
          label: { show: true, position: 'right', color: '#c4b5fd', fontSize: 11, formatter: ({ name }: any) => name.replace('观察站 ', '') },
          data: osData,
          zlevel: 2,
        },
        {
          name: '警情',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          symbolSize: (val: number[]) => 8 + Math.min(14, (val[2] ?? 0) / 8),
          rippleEffect: { brushType: 'stroke', scale: 3.2, period: 4 },
          showEffectOn: 'render',
          data: alertData,
          zlevel: 3,
          tooltip: {
            formatter: (p: any) =>
              `<div style="max-width:260px">
                 <div style="font-weight:700;color:#fff;margin-bottom:4px">${p.name}</div>
                 <div>时间:${p.data.time || '-'} ｜ 风险:${p.data.risk}</div>
                 <div>检出:${p.data.count} 头 ｜ 等级:${p.data.level}</div>
                 ${p.data.summary ? `<div style="margin-top:4px;color:#94a3b8">${p.data.summary}</div>` : ''}
               </div>`,
          },
        },
      ],
    })
  }, [tasks])

  return <div ref={elRef} className="h-full w-full" />
}
