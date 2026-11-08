'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Camera, MapPinned, RefreshCw, Satellite } from 'lucide-react'
import ChinaMap from '@/components/ChinaMap'
import type { ChinaMapMarker } from '@/components/ChinaMap'
import type { TrainingTask, WarningLevel } from '@/lib/store'

type LiveFusion = {
  summary: string
  acquisitionSummary: string
  latestTask: { id: string; name: string; status: string; warningLevel: string; intrusionRisk: number; predictionWindow: string; updatedAt: string } | null
  modelStatus: { status: string; source: string; lastUpdated: string; version: string }
  analysis: { warningLevel: WarningLevel; intrusionRisk: number; predictionWindow: string; aiSummary: string }
  thermal: { streamUrl: string; snapshotUrl: string; sourceName: string }
  dji: { cloudApiBaseUrl: string; openApiBaseUrl: string; websocketUrl: string }
  map: { apiKey: string }
  yolo: { configured: boolean; providerName: string; serviceUrl: string; weights: string } | null
  threeD: { configured: boolean; providerName: string; serviceUrl: string; snapshotUrl: string } | null
}

type Props = {
  liveFusion: LiveFusion | null
  commandTask?: TrainingTask
  markers: ChinaMapMarker[]
}

export default function DynamicBrowseWall({ liveFusion, commandTask, markers }: Props) {
  const [panelTask, setPanelTask] = useState<TrainingTask | undefined>(commandTask)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setPanelTask(commandTask)
  }, [commandTask])

  const droneUrl = panelTask?.videoUrl || ''
  const thermalUrl = liveFusion?.thermal.snapshotUrl || liveFusion?.thermal.streamUrl || ''

  const runtimeStats = useMemo(
    () => [
      { icon: MapPinned, label: '地图', value: liveFusion?.map.apiKey ? '已接入' : '待配置' },
      { icon: Camera, label: '无人机实拍', value: droneUrl ? '已接入' : '待接入' },
      { icon: Activity, label: '热成像', value: thermalUrl ? '已接入' : '待接入' },
      { icon: Satellite, label: '研判等级', value: liveFusion?.analysis.warningLevel || '待研判' },
    ],
    [droneUrl, liveFusion?.analysis.warningLevel, liveFusion?.map.apiKey, thermalUrl],
  )

  const refreshFrame = async () => {
    setRefreshing(true)
    window.setTimeout(() => setRefreshing(false), 700)
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-emerald-300">动态浏览大屏</div>
          <h2 className="mt-1 text-2xl font-bold">地图、无人机实拍、热成像联动总览</h2>
        </div>
        <button onClick={() => void refreshFrame()} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          刷新画面
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_.8fr] lg:grid-rows-[1fr_1fr]">
        <div className="min-h-[620px] overflow-hidden rounded-xl border border-white/10 bg-white/5 lg:row-span-2">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm">
            <div className="font-semibold">首页大地图</div>
            <div className="text-slate-300">{liveFusion?.analysis.predictionWindow || '待研判'}</div>
          </div>
          <div className="p-4">
            <ChinaMap markers={markers} />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3 text-xs text-slate-300 md:grid-cols-4">
            {runtimeStats.map((item) => (
              <div key={item.label} className="rounded-md bg-white/5 p-3">
                <item.icon size={14} className="mb-1 text-emerald-300" />
                <div className="text-[11px] text-slate-400">{item.label}</div>
                <div className="mt-1 font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <MediaScreen
          title="无人机实拍图"
          subtitle={panelTask?.name || liveFusion?.latestTask?.name || '等待 DJI 实拍流'}
          mediaUrl={droneUrl}
          placeholder="当前还没有无人机实拍地址。上传视频 URL 或接入 DJI 实拍流后，这里会直接显示画面。"
          kind="video"
        />

        <MediaScreen
          title="热成像图片"
          subtitle={liveFusion?.thermal.sourceName || '等待热成像源'}
          mediaUrl={thermalUrl}
          placeholder="当前还没有热成像快照地址。接入热成像快照或热成像流后，这里会直接显示热图。"
          kind="image"
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
        {liveFusion?.summary || '等接入 DJI 坐标流、无人机实拍流和热成像源后，这里会变成真正的动态浏览大屏。'}
      </div>
    </section>
  )
}

function MediaScreen({
  title,
  subtitle,
  mediaUrl,
  placeholder,
  kind,
}: {
  title: string
  subtitle: string
  mediaUrl: string
  placeholder: string
  kind: 'video' | 'image'
}) {
  const hasMedia = Boolean(mediaUrl)
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-slate-300">{subtitle}</div>
        </div>
        <div className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">{hasMedia ? '在线' : '待接入'}</div>
      </div>
      <div className="relative flex min-h-[300px] items-center justify-center bg-black">
        {hasMedia ? (
          kind === 'video' ? (
            <video key={mediaUrl} className="h-full w-full object-cover" src={mediaUrl} autoPlay muted loop playsInline controls />
          ) : (
            <img key={mediaUrl} src={mediaUrl} alt={title} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="px-6 text-center text-sm text-slate-300">{placeholder}</div>
        )}
      </div>
    </div>
  )
}
