import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Activity, MapPinned, Radar, RefreshCw, Satellite } from 'lucide-react'

type LiveFusion = {
  source: string
  thermal: { streamUrl: string; snapshotUrl: string; sourceName: string }
  dji: { providerName: string; cloudApiBaseUrl: string; openApiBaseUrl: string; websocketUrl: string }
  map: { apiKey: string }
  yolo: { configured: boolean; providerName: string; serviceUrl: string; weights: string } | null
  analysis: { aiSummary: string; warningLevel: string; intrusionRisk: number; predictionWindow: string }
  summary: string
}

export default function LiveFusionPanel() {
  const [data, setData] = useState<LiveFusion | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/fusion/live', { cache: 'no-store' })
      if (response.ok) setData(await response.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Satellite size={16} />
          实时热成像三维研判
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-slate-600 shadow-sm">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
        <Mini icon={Radar} label="风险" value={data ? `${data.analysis.warningLevel} / ${data.analysis.intrusionRisk}` : '未加载'} />
        <Mini icon={MapPinned} label="地图" value={data?.map.apiKey ? '已接入' : '待配置'} />
        <Mini icon={Activity} label="热成像" value={data?.thermal.streamUrl || data?.thermal.snapshotUrl ? '在线' : '未接入'} />
      </div>

      <div className="rounded-md bg-white p-3">
        <div className="text-sm font-medium text-slate-900">研判摘要</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{data?.summary || '等待接入实时热成像源、DJI 司空/FlightHub 2 和 AI 分析接口。'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className="rounded-md bg-white p-3">DJI：{data?.dji.cloudApiBaseUrl || data?.dji.openApiBaseUrl || '未配置'}</div>
        <div className="rounded-md bg-white p-3">YOLO：{data?.yolo?.configured ? data.yolo.providerName : '未配置'}</div>
      </div>
    </div>
  )
}

function Mini({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <Icon size={14} className="mb-1 text-emerald-700" />
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-xs font-semibold text-slate-900">{value}</div>
    </div>
  )
}
