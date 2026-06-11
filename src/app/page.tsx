'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, CheckCircle2, Cpu, Database, MapPinned, Plus, Radar, RefreshCw, ScanSearch, Server, UploadCloud, type LucideIcon } from 'lucide-react'
import ChinaMap, { type ChinaMapMarker } from '@/components/ChinaMap'
import CreateTaskModal, { type CreateTaskPayload } from '@/components/CreateTaskModal'
import TaskCard from '@/components/TaskCard'
import type { ModelStatus, TrainingTask } from '@/lib/store'

interface IntegrationStatus {
  amap: { configured: boolean; provider: string }
  ai: { configured: boolean; provider: string }
  yolo: { configured: boolean; provider: string; weights: string }
}

const emptyModelStatus: ModelStatus = {
  version: 'YOLOv8n-elephant-thermal',
  status: '加载中',
  datasetImages: 0,
  classes: 0,
  map50: 0,
  elephantMap50: 0,
  precision: 0,
  recall: 0,
  source: '-',
  lastUpdated: '-',
}

const mapMarkers: ChinaMapMarker[] = [
  { id: 'yn-bn', name: '西双版纳监测区', lng: 100.7974, lat: 22.0075, status: '热成像巡护' },
  { id: 'yn-pu', name: '普洱边境缓冲区', lng: 101.0215, lat: 22.7736, status: '无人机复飞' },
  { id: 'gx-fc', name: '广西边境样例点', lng: 108.3538, lat: 21.6871, status: '地图接口联通' },
]

const defaultStatus: IntegrationStatus = {
  amap: { configured: false, provider: 'AMap / 高德地图 JS API 2.0' },
  ai: { configured: false, provider: 'gpt-4.1-mini' },
  yolo: { configured: false, provider: 'Local Python ultralytics', weights: 'yolov8n.pt' },
}

export default function Home() {
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [modelStatus, setModelStatus] = useState<ModelStatus>(emptyModelStatus)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(defaultStatus)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  const [yoloImage, setYoloImage] = useState<File | null>(null)
  const [yoloResult, setYoloResult] = useState<string>('')
  const [yoloError, setYoloError] = useState<string>('')
  const [isYoloRunning, setIsYoloRunning] = useState(false)

  const fetchAll = async () => {
    setIsRefreshing(true)
    try {
      const [taskResponse, modelResponse, statusResponse] = await Promise.all([
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/model-status', { cache: 'no-store' }),
        fetch('/api/integrations/status', { cache: 'no-store' }),
      ])
      setTasks(await taskResponse.json())
      setModelStatus(await modelResponse.json())
      setIntegrationStatus(await statusResponse.json())
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const timer = window.setInterval(fetchAll, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const handleCreateTask = async (data: CreateTaskPayload) => {
    const form = new FormData()
    form.set('name', data.name)
    form.set('description', data.description)
    form.set('videoUrl', data.videoUrl)
    form.set('modelType', data.modelType)
    form.set('epochs', String(data.epochs))
    form.set('batchSize', String(data.batchSize))
    form.set('imageSize', String(data.imageSize))
    if (data.video) form.set('video', data.video)
    await fetch('/api/tasks', { method: 'POST', body: form })
    await fetchAll()
  }

  const runYolo = async () => {
    if (!yoloImage) {
      setYoloError('请先上传一张热成像图片。')
      return
    }
    setIsYoloRunning(true)
    setYoloError('')
    setYoloResult('')
    try {
      const form = new FormData()
      form.set('image', yoloImage)
      const response = await fetch('/api/yolo/predict', { method: 'POST', body: form })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || payload.hint || 'YOLO 检测失败')
      }
      setYoloResult(JSON.stringify(payload, null, 2))
    } catch (error) {
      setYoloError(error instanceof Error ? error.message : 'YOLO 检测失败')
    } finally {
      setIsYoloRunning(false)
    }
  }

  const stats = useMemo(() => ({
    total: tasks.length,
    running: tasks.filter((task) => task.status === 'RUNNING').length,
    high: tasks.filter((task) => ['RED', 'ORANGE'].includes(task.warningLevel)).length,
    realAi: tasks.filter((task) => task.analysisMode === 'openai').length,
  }), [tasks])

  const latestTask = tasks[0]

  return (
    <main className="min-h-screen bg-[#eef3f0] p-5 text-slate-900">
      <header className="mb-5 rounded-xl bg-slate-950 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-300">Elephant Thermal Risk Platform</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">大象热成像风险研判与 YOLO 训练平台</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              已接入中国地图 API、真实 AI 研判接口和 YOLO 推理/训练通道。线上 Vercel 负责页面与 API 编排，YOLO 推荐连接外部 GPU 服务或本地 worker。
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              刷新
            </button>
            <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
              <Plus size={16} />
              创建任务
            </button>
          </div>
        </div>
      </header>

      <section className="mb-5 grid gap-4 md:grid-cols-4">
        <StatusTile icon={Database} label="训练任务" value={stats.total} />
        <StatusTile icon={Cpu} label="处理中" value={stats.running} />
        <StatusTile icon={Radar} label="重点预警" value={stats.high} />
        <StatusTile icon={BrainCircuit} label="真实 AI 分析" value={stats.realAi} />
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Panel title="中国地图 API 接口" icon={MapPinned}>
          <ChinaMap markers={mapMarkers} />
        </Panel>

        <Panel title="服务接入状态" icon={Server}>
          <div className="grid gap-3">
            <IntegrationRow name="高德地图" configured={integrationStatus.amap.configured} detail={integrationStatus.amap.provider} />
            <IntegrationRow name="AI 分析" configured={integrationStatus.ai.configured} detail={integrationStatus.ai.provider} />
            <IntegrationRow name="YOLO" configured={integrationStatus.yolo.configured} detail={`${integrationStatus.yolo.provider} / ${integrationStatus.yolo.weights}`} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="mAP50" value={modelStatus.map50.toFixed(3)} />
            <MiniMetric label="Precision" value={modelStatus.precision.toFixed(3)} />
            <MiniMetric label="Recall" value={modelStatus.recall.toFixed(3)} />
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            AI 使用 OPENAI_API_KEY；地图使用 NEXT_PUBLIC_AMAP_KEY；YOLO 使用 YOLO_SERVICE_URL，或在自托管环境配置 YOLO_PYTHON、YOLO_WEIGHTS。
          </div>
        </Panel>
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <Panel title="真实 YOLO 检测" icon={ScanSearch}>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 hover:bg-slate-100">
              <UploadCloud size={18} />
              {yoloImage ? yoloImage.name : '上传一张热成像图片进行 YOLO 推理'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setYoloImage(event.target.files?.[0] || null)}
              />
            </label>
            <button
              onClick={runYolo}
              disabled={isYoloRunning}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isYoloRunning ? 'YOLO 检测中...' : '运行 YOLO 检测'}
            </button>
            {yoloError ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{yoloError}</div> : null}
            {yoloResult ? <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{yoloResult}</pre> : null}
          </div>
        </Panel>

        <Panel title="AI 研判结果" icon={CheckCircle2}>
          {latestTask ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{latestTask.warningLevel}</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                  {latestTask.analysisMode === 'openai' ? '真实 AI 分析' : '规则兜底'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">风险 {latestTask.intrusionRisk}</span>
              </div>
              <p className="text-sm leading-6 text-slate-700">{latestTask.aiSummary}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {latestTask.dispatchPlan.map((item, index) => (
                  <div key={item} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              还没有任务。创建任务后，系统会调用 AI 分析并生成风险等级、预测窗口和处置预案。
            </div>
          )}
        </Panel>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onView={setSelectedTask} />
        ))}
      </section>

      {!tasks.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
          暂无训练任务。点击“创建任务”上传视频或填写视频 URL。
        </div>
      ) : null}

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateTask} />
      {selectedTask ? <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} /> : null}
    </main>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={20} className="text-emerald-700" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function StatusTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <Icon size={20} className="mb-3 text-slate-700" />
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{value}</div>
    </div>
  )
}

function IntegrationRow({ name, configured, detail }: { name: string; configured: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
      <div>
        <div className="text-sm font-semibold text-slate-900">{name}</div>
        <div className="mt-1 text-xs text-slate-500">{detail}</div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {configured ? '已配置' : '待配置'}
      </span>
    </div>
  )
}

function TaskDetail({ task, onClose }: { task: TrainingTask; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="max-h-[82vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold text-slate-900">{task.name}</h2>
        <p className="mb-4 text-sm leading-6 text-slate-600">{task.aiSummary}</p>
        <pre className="rounded-md bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(task, null, 2)}</pre>
      </div>
    </div>
  )
}
