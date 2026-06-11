'use client'

import { useEffect, useMemo, useState } from 'react'
import { BellRing, BrainCircuit, CheckCircle2, CloudSun, Cpu, Database, MapPinned, Plus, Radar, RefreshCw, Route, ShieldAlert, UploadCloud, ScanSearch, type LucideIcon } from 'lucide-react'
import CreateTaskModal, { type CreateTaskPayload } from '@/components/CreateTaskModal'
import ChinaMap, { type ChinaMapMarker } from '@/components/ChinaMap'
import Sidebar from '@/components/Sidebar'
import TaskCard from '@/components/TaskCard'
import type { ModelStatus, TrainingTask, WarningLevel } from '@/lib/store'

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

const levelStyle: Record<WarningLevel, { label: string; short: string; bg: string; text: string; bar: string; ring: string }> = {
  RED: { label: '红色预警', short: '红', bg: 'bg-red-600', text: 'text-red-700', bar: 'bg-red-500', ring: 'ring-red-200' },
  ORANGE: { label: '橙色预警', short: '橙', bg: 'bg-orange-500', text: 'text-orange-700', bar: 'bg-orange-500', ring: 'ring-orange-200' },
  YELLOW: { label: '黄色预警', short: '黄', bg: 'bg-amber-400', text: 'text-amber-700', bar: 'bg-amber-400', ring: 'ring-amber-200' },
  BLUE: { label: '蓝色预警', short: '蓝', bg: 'bg-blue-600', text: 'text-blue-700', bar: 'bg-blue-500', ring: 'ring-blue-200' },
}

const fusionSources = [
  { icon: Radar, title: '无人机实时检测', desc: '热成像目标、数量、置信度、移动方向' },
  { icon: CloudSun, title: '气象与环境', desc: '降雨、温度、能见度、土地覆盖和水源距离' },
  { icon: MapPinned, title: '地理空间关系', desc: '村庄、农田、道路、边境线和地形通道' },
  { icon: Route, title: '历史项圈轨迹', desc: '迁移走廊、停留热点、历史警情密度' },
]

const chinaMapMarkers: ChinaMapMarker[] = [
  { id: 'yn-bn', name: '西双版纳监测区', lng: 100.7974, lat: 22.0075, status: '热成像巡护' },
  { id: 'yn-pu', name: '普洱边境缓冲区', lng: 101.0215, lat: 22.7736, status: '无人机复飞' },
  { id: 'gx-fc', name: '广西边境样例点', lng: 108.3538, lat: 21.6871, status: '地图接口联通' },
]

interface IntegrationStatus {
  amap: { configured: boolean; provider: string }
  ai: { configured: boolean; provider: string }
  yolo: { configured: boolean; provider: string; weights: string }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [modelStatus, setModelStatus] = useState<ModelStatus>(emptyModelStatus)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  const [resultTask, setResultTask] = useState<TrainingTask | null>(null)
  const [noticeTask, setNoticeTask] = useState<TrainingTask | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null)
  const [yoloImage, setYoloImage] = useState<File | null>(null)
  const [yoloResult, setYoloResult] = useState<string>('')
  const [yoloError, setYoloError] = useState<string>('')
  const [isYoloRunning, setIsYoloRunning] = useState(false)

  const fetchAll = async () => {
    setIsRefreshing(true)
    try {
      const [taskResponse, modelResponse, integrationResponse] = await Promise.all([
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/model-status', { cache: 'no-store' }),
        fetch('/api/integrations/status', { cache: 'no-store' }),
      ])
      const nextTasks = await taskResponse.json()
      const nextModel = await modelResponse.json()
      const nextIntegration = await integrationResponse.json()
      setTasks(nextTasks)
      setModelStatus(nextModel)
      setIntegrationStatus(nextIntegration)
      const pendingResult = nextTasks.find((task: TrainingTask) => task.needsModelConfirm)
      if (pendingResult) setResultTask((current) => current || pendingResult)
      const activeWarning = nextTasks.find((task: TrainingTask) => ['RED', 'ORANGE'].includes(task.warningLevel) && task.status !== 'COMPLETED')
      if (activeWarning) setNoticeTask((current) => current || activeWarning)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const interval = window.setInterval(fetchAll, 3000)
    return () => window.clearInterval(interval)
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

  const confirmAggregate = async (task: TrainingTask) => {
    await fetch(`/api/tasks/${task.id}/aggregate`, { method: 'POST' })
    setResultTask(null)
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
    pending: tasks.filter((task) => task.status === 'PENDING').length,
    high: tasks.filter((task) => ['RED', 'ORANGE'].includes(task.warningLevel)).length,
  }), [tasks])

  const latestTask = tasks[0]
  const commandTask = latestTask || tasks.find((task) => task.warningLevel === 'RED') || tasks.find((task) => task.warningLevel === 'ORANGE')
  const currentLevel = commandTask?.warningLevel || 'BLUE'
  const level = levelStyle[currentLevel]

  return (
    <div className="min-h-screen bg-[#eef3f0] text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="flex-1 p-5">
          <header className="mb-5 overflow-hidden rounded-lg bg-slate-950 text-white shadow-lg">
            <div className="grid grid-cols-[1.1fr_.9fr] gap-5 p-6">
              <div>
                <p className="text-sm font-medium text-emerald-300">天眼护象 · 监测-预警-处警一体化</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">象群入侵风险智能研判与警情联动大屏</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  接入气象、地理信息、无人机检测、历史项圈轨迹和环境遥感数据，构建基于时间与空间的三维立体分析数据，滚动预测 30 分钟至 2 小时内入侵概率。
                </p>
                <div className="mt-4 flex gap-2">
                  <button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    刷新
                  </button>
                  <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                    <Plus size={16} />
                    上传视频训练
                  </button>
                </div>
              </div>
              <div className={`rounded-lg bg-white/10 p-4 ring-4 ${level.ring}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${level.bg}`}>{level.label}</span>
                    <div className="mt-3 text-5xl font-black">{commandTask?.intrusionRisk ?? 18}</div>
                    <p className="text-sm text-slate-300">入侵风险指数 · 预测窗口 {commandTask?.predictionWindow || '2 小时以上'}</p>
                  </div>
                  <ShieldAlert size={64} className={level.text} />
                </div>
              </div>
            </div>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-4">
            <StatusTile icon={Database} label="警情/训练任务" value={stats.total} />
            <StatusTile icon={Cpu} label="AI 处理中" value={stats.running} />
            <StatusTile icon={UploadCloud} label="待处理队列" value={stats.pending} />
            <StatusTile icon={BellRing} label="红橙重点预警" value={stats.high} />
          </section>

          <section className="mb-5 grid grid-cols-[1.15fr_.85fr] gap-4">
            <Panel title="实时三维立体分析与分级预警" icon={BrainCircuit}>
              <div className="grid grid-cols-4 gap-3">
                {fusionSources.map((source) => {
                  const Icon = source.icon
                  return (
                    <div key={source.title} className="rounded-md border border-slate-200 bg-white p-3">
                      <Icon size={20} className="mb-2 text-emerald-700" />
                      <strong className="text-sm text-slate-900">{source.title}</strong>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{source.desc}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4">
                <ChinaMap markers={chinaMapMarkers} />
              </div>
              <div className="mt-4 rounded-md bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-700">{commandTask?.aiSummary || '等待无人机视频或边缘端识别结果接入后，系统将自动计算象群位置、速度、方向与村庄、农田、道路、边境线之间的空间关系，并输出入侵风险指数。'}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">地图: {integrationStatus?.amap.configured ? '已接入' : '待配置'}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">AI: {integrationStatus?.ai.configured ? '已接入' : '待配置'}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">YOLO: {integrationStatus?.yolo.configured ? '已接入' : '待配置'}</span>
              </div>
            </Panel>

            <Panel title="当前模型状态与确认汇总" icon={CheckCircle2}>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="模型版本" value={modelStatus.version} />
                <Metric label="模型状态" value={modelStatus.status} />
                <Metric label="mAP50" value={modelStatus.map50.toFixed(3)} />
                <Metric label="Precision" value={modelStatus.precision.toFixed(3)} />
                <Metric label="Recall" value={modelStatus.recall.toFixed(3)} />
                <Metric label="训练图片" value={modelStatus.datasetImages} />
              </div>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ScanSearch size={16} />
                  YOLO 图片检测
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 hover:bg-slate-50">
                  <UploadCloud size={18} />
                  {yoloImage ? yoloImage.name : '上传图片后运行真实 YOLO'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => setYoloImage(event.target.files?.[0] || null)}
                  />
                </label>
                <button onClick={runYolo} disabled={isYoloRunning} className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  {isYoloRunning ? 'YOLO 检测中...' : '运行 YOLO 检测'}
                </button>
                {yoloError ? <p className="mt-3 text-sm text-red-600">{yoloError}</p> : null}
                {yoloResult ? <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{yoloResult}</pre> : null}
              </div>
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-500">训练完成后不会直接覆盖模型状态，必须在弹窗中点击确认后才汇总到当前模型。</p>
            </Panel>
          </section>

          <section className="mb-5 grid grid-cols-[.9fr_1.1fr] gap-4">
            <Panel title="监测-预警-处警闭环" icon={Radar}>
              <ProcessFlow level={currentLevel} />
            </Panel>
            <Panel title="分级处置预案" icon={Route}>
              <div className="grid grid-cols-2 gap-3">
                {(commandTask?.dispatchPlan || defaultDispatch(currentLevel)).map((item, index) => (
                  <div key={item} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <span className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${level.bg}`}>{index + 1}</span>
                    {item}
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          {latestTask ? (
            <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">最新 AI 识别全过程</h2>
                <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  <Plus size={16} />
                  上传视频训练
                </button>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {latestTask.stages.map((stage) => (
                  <div key={stage.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <strong className="text-slate-800">{stage.name}</strong>
                      <span className="text-slate-500">{stage.status}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className={`h-full rounded-full ${levelStyle[latestTask.warningLevel].bar}`} style={{ width: `${stage.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-3 gap-4">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onView={setSelectedTask} />
            ))}
          </section>

          {!tasks.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
              暂无警情训练任务。点击“上传视频训练”创建第一个动态训练与分级预警任务。
            </div>
          ) : null}
        </main>
      </div>

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateTask} />

      {noticeTask ? <WarningPopup task={noticeTask} onClose={() => setNoticeTask(null)} /> : null}
      {resultTask ? <TrainingResultModal task={resultTask} onConfirm={() => confirmAggregate(resultTask)} onClose={() => setResultTask(null)} /> : null}
      {selectedTask ? <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} /> : null}
    </div>
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-base font-bold text-slate-900">{value}</div>
    </div>
  )
}

function ProcessFlow({ level }: { level: WarningLevel }) {
  const steps = ['边缘感知', '融合研判', `${levelStyle[level].label}推送`, '处警调度', '留痕复盘']
  return (
    <div className="grid grid-cols-5 gap-2">
      {steps.map((step, index) => (
        <div key={step} className="rounded-md bg-slate-50 p-3 text-center">
          <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ${levelStyle[level].bg}`}>{index + 1}</div>
          <div className="text-sm font-medium text-slate-800">{step}</div>
        </div>
      ))}
    </div>
  )
}

function defaultDispatch(level: WarningLevel) {
  return {
    RED: ['立即疏散群众', '实施交通管制', '专业救助力量调派', '指挥中心全程留痕'],
    ORANGE: ['巡护力量前置', '村寨联络员提醒', '无人机复飞跟踪', '准备交通劝导'],
    YELLOW: ['持续观察 1-2 小时', '核对历史轨迹', '村民端注意提醒', '保留升级规则'],
    BLUE: ['常态监测', '记录位置方向', '订阅项圈轨迹', '无需立即处警'],
  }[level]
}

function WarningPopup({ task, onClose }: { task: TrainingTask; onClose: () => void }) {
  const style = levelStyle[task.warningLevel]
  return (
    <div className="fixed right-5 top-5 z-50 w-[420px] rounded-lg border border-white/30 bg-white p-4 shadow-2xl">
      <div className="flex gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${style.bg}`}>{style.short}</div>
        <div>
          <strong className="text-slate-900">{style.label}弹窗通知</strong>
          <p className="mt-1 text-sm leading-5 text-slate-600">{task.name}，入侵风险指数 {task.intrusionRisk}，预测窗口 {task.predictionWindow}。</p>
          <button onClick={onClose} className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">确认接收</button>
        </div>
      </div>
    </div>
  )
}

function TrainingResultModal({ task, onConfirm, onClose }: { task: TrainingTask; onConfirm: () => void; onClose: () => void }) {
  const style = levelStyle[task.warningLevel]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${style.bg}`}>{style.label}</span>
            <h2 className="mt-3 text-xl font-bold text-slate-900">训练测试结果待确认</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">关闭</button>
        </div>
        <p className="mb-4 text-sm leading-6 text-slate-600">{task.aiSummary}</p>
        <div className="mb-4 grid grid-cols-4 gap-3">
          <Metric label="入侵风险" value={task.intrusionRisk} />
          <Metric label="mAP50" value={String(task.metrics?.mAP50 ?? '-')} />
          <Metric label="Precision" value={String(task.metrics?.precision ?? '-')} />
          <Metric label="Recall" value={String(task.metrics?.recall ?? '-')} />
        </div>
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">点击确认后，系统才会把本次训练测试指标汇总到“当前模型状态”。</div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2">暂不汇总</button>
          <button onClick={onConfirm} className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">确认并汇总到模型</button>
        </div>
      </div>
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
