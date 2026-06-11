'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  MapPinned,
  Plus,
  Radar,
  RefreshCw,
  Route,
  ShieldAlert,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import ChinaMap, { type ChinaMapMarker } from '@/components/ChinaMap'
import CreateTaskModal, { type CreateTaskPayload } from '@/components/CreateTaskModal'
import IntegrationSettings from '@/components/IntegrationSettings'
import LiveFusionPanel from '@/components/LiveFusionPanel'
import Sidebar from '@/components/Sidebar'
import TaskCard from '@/components/TaskCard'
import type { ModelStatus, TrainingTask, WarningLevel } from '@/lib/store'

type IntegrationStatus = {
  map: { configured: boolean; provider: string; reachable?: boolean }
  ai: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
  dji: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
  yolo: { configured: boolean; provider: string; endpoint: string; weights: string; reachable?: boolean }
  thermal: { configured: boolean; provider: string; source: string; reachable?: boolean }
  threeD: { configured: boolean; provider: string; endpoint: string; reachable?: boolean }
}

type LiveFusion = {
  summary: string
  acquisitionSummary: string
  latestTask: { id: string; name: string; status: string; warningLevel: string; intrusionRisk: number; predictionWindow: string; updatedAt: string } | null
  modelStatus: { status: string; source: string; lastUpdated: string; version: string }
  analysis: { warningLevel: WarningLevel; intrusionRisk: number; predictionWindow: string; aiSummary: string }
}

type TabStateProps = {
  commandTask?: TrainingTask
  currentLevel: WarningLevel
  integrationStatus: IntegrationStatus | null
  level: { label: string; bg: string; ring: string; text: string; bar: string; short: string }
  liveFusion: LiveFusion | null
  modelStatus: ModelStatus
  setIsModalOpen: (open: boolean) => void
  setSelectedTask: (task: TrainingTask) => void
  tasks: TrainingTask[]
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

const levelStyle: Record<WarningLevel, { label: string; short: string; bg: string; text: string; bar: string; ring: string }> = {
  RED: { label: '红色预警', short: '红', bg: 'bg-red-600', text: 'text-red-700', bar: 'bg-red-500', ring: 'ring-red-200' },
  ORANGE: { label: '橙色预警', short: '橙', bg: 'bg-orange-500', text: 'text-orange-700', bar: 'bg-orange-500', ring: 'ring-orange-200' },
  YELLOW: { label: '黄色预警', short: '黄', bg: 'bg-amber-400', text: 'text-amber-700', bar: 'bg-amber-400', ring: 'ring-amber-200' },
  BLUE: { label: '蓝色预警', short: '蓝', bg: 'bg-blue-600', text: 'text-blue-700', bar: 'bg-blue-500', ring: 'ring-blue-200' },
}

const chinaMapMarkers: ChinaMapMarker[] = [
  { id: 'yn-bn', name: '西双版纳监测区', lng: 100.7974, lat: 22.0075, status: '热成像巡护' },
  { id: 'yn-pu', name: '普洱边境缓冲区', lng: 101.0215, lat: 22.7736, status: '无人机复飞' },
  { id: 'gx-fc', name: '广西边境样例点', lng: 108.3538, lat: 21.6871, status: '地图接口联通' },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [modelStatus, setModelStatus] = useState<ModelStatus>(emptyModelStatus)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null)
  const [liveFusion, setLiveFusion] = useState<LiveFusion | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  const [resultTask, setResultTask] = useState<TrainingTask | null>(null)
  const [noticeTask, setNoticeTask] = useState<TrainingTask | null>(null)

  const refresh = async () => {
    setIsRefreshing(true)
    try {
      const [taskResponse, modelResponse, integrationResponse, fusionResponse] = await Promise.all([
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/model-status', { cache: 'no-store' }),
        fetch('/api/integrations/status', { cache: 'no-store' }),
        fetch('/api/fusion/live', { cache: 'no-store' }),
      ])
      setTasks(await taskResponse.json())
      setModelStatus(await modelResponse.json())
      setIntegrationStatus(await integrationResponse.json())
      setLiveFusion(await fusionResponse.json())
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 5000)
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
    await refresh()
  }

  const confirmAggregate = async (task: TrainingTask) => {
    await fetch(`/api/tasks/${task.id}/aggregate`, { method: 'POST' })
    setResultTask(null)
    await refresh()
  }

  const stats = useMemo(
    () => ({
      total: tasks.length,
      running: tasks.filter((task) => task.status === 'RUNNING').length,
      pending: tasks.filter((task) => task.status === 'PENDING').length,
      high: tasks.filter((task) => ['RED', 'ORANGE'].includes(task.warningLevel)).length,
    }),
    [tasks],
  )

  const latestTask = tasks[0]
  const commandTask = latestTask || tasks.find((task) => task.warningLevel === 'RED') || tasks.find((task) => task.warningLevel === 'ORANGE')
  const currentLevel = commandTask?.warningLevel || 'BLUE'
  const level = levelStyle[currentLevel]

  const tabProps: TabStateProps = {
    commandTask,
    currentLevel,
    integrationStatus,
    level,
    liveFusion,
    modelStatus,
    setIsModalOpen,
    setSelectedTask,
    tasks,
  }

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
                  接入地图、DJI 司空 / FlightHub 2、实时热成像和 AI 分析接口，形成可配置、可追溯的实时研判链路。
                </p>
                <div className="mt-4 flex gap-2">
                  <button onClick={refresh} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    刷新
                  </button>
                  <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                    <Plus size={16} />
                    新建研判任务
                  </button>
                </div>
              </div>
              <div className={`rounded-lg bg-white/10 p-4 ring-4 ${level.ring}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${level.bg}`}>{level.label}</span>
                    <div className="mt-3 text-5xl font-black">{liveFusion?.analysis.intrusionRisk ?? commandTask?.intrusionRisk ?? 18}</div>
                    <p className="text-sm text-slate-300">风险指数 · {liveFusion?.analysis.predictionWindow || commandTask?.predictionWindow || '待研判'}</p>
                  </div>
                  <ShieldAlert size={64} className={level.text} />
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 px-6 py-3 text-sm text-slate-300">
              {liveFusion ? (
                <span>
                  采集 {liveFusion.acquisitionSummary || '0/0'} · 任务 {liveFusion.latestTask?.name || '暂无'} · 风险 {liveFusion.analysis.predictionWindow || '待研判'}
                </span>
              ) : (
                <span>采集中 · 任务加载中 · 风险评估中</span>
              )}
            </div>
          </header>

          <section className="mb-5 grid grid-cols-4 gap-4">
            <MetricTile icon={Database} label="研判任务" value={stats.total} />
            <MetricTile icon={Cpu} label="运行中" value={stats.running} />
            <MetricTile icon={UploadCloud} label="待处理" value={stats.pending} />
            <MetricTile icon={BellRing} label="红橙预警" value={stats.high} />
          </section>

          {activeTab === 'dashboard' ? <DashboardTab {...tabProps} /> : null}
          {activeTab === 'warning' ? <WarningTab {...tabProps} /> : null}
          {activeTab === 'ai' ? <AiTab {...tabProps} /> : null}
          {activeTab === 'dispatch' ? <DispatchTab {...tabProps} /> : null}
          {activeTab === 'history' ? <HistoryTab {...tabProps} /> : null}
          {activeTab === 'settings' ? <SettingsTab {...tabProps} /> : null}
        </main>
      </div>

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateTask} />
      {noticeTask ? <WarningPopup task={noticeTask} onClose={() => setNoticeTask(null)} /> : null}
      {resultTask ? <TrainingResultModal task={resultTask} onConfirm={() => confirmAggregate(resultTask)} onClose={() => setResultTask(null)} /> : null}
      {selectedTask ? <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} /> : null}
    </div>
  )
}

function DashboardTab(props: TabStateProps) {
  return (
    <>
      <section className="mb-5 grid grid-cols-[1.15fr_.85fr] gap-4">
        <Panel title="实时三维立体分析与分级预警" icon={BrainCircuit}>
          <LiveFusionPanel />
          <div className="mt-4">
            <ChinaMap markers={chinaMapMarkers} />
          </div>
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {props.liveFusion?.summary || props.commandTask?.aiSummary || '等待实时热成像源接入后，系统会自动拉取地图、DJI 与 AI 分析信息。'}
          </div>
        </Panel>
        <Panel title="当前模型状态与确认汇总" icon={CheckCircle2}>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="模型版本" value={props.modelStatus.version} />
            <Metric label="模型状态" value={props.modelStatus.status} />
            <Metric label="mAP50" value={props.modelStatus.map50.toFixed(3)} />
            <Metric label="Precision" value={props.modelStatus.precision.toFixed(3)} />
            <Metric label="Recall" value={props.modelStatus.recall.toFixed(3)} />
            <Metric label="样本图片" value={props.modelStatus.datasetImages} />
          </div>
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            当前模型状态会跟随实时研判结果更新，确认汇总后才写入模型状态。
          </div>
        </Panel>
      </section>

      <section className="mb-5 grid grid-cols-[.9fr_1.1fr] gap-4">
        <Panel title="监测-预警-处警闭环" icon={Radar}>
          <ProcessFlow level={props.currentLevel} />
        </Panel>
        <Panel title="分级处置预案" icon={Route}>
          <DispatchGrid task={props.commandTask} level={props.currentLevel} levelBg={props.level.bg} />
        </Panel>
      </section>

      {props.tasks[0] ? <LatestTaskStages task={props.tasks[0]} onCreate={() => props.setIsModalOpen(true)} /> : null}
      <TaskGrid tasks={props.tasks} onView={props.setSelectedTask} />
    </>
  )
}

function WarningTab(props: TabStateProps) {
  const grouped = (['RED', 'ORANGE', 'YELLOW', 'BLUE'] as WarningLevel[]).map((level) => ({
    level,
    tasks: props.tasks.filter((task) => task.warningLevel === level),
  }))

  return (
    <section className="grid grid-cols-[.85fr_1.15fr] gap-4">
      <Panel title="分级预警看板" icon={ShieldAlert}>
        <div className="grid grid-cols-2 gap-3">
          {grouped.map((group) => (
            <div key={group.level} className="rounded-md bg-slate-50 p-4">
              <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${levelStyle[group.level].bg}`}>{levelStyle[group.level].label}</span>
              <div className="mt-3 text-3xl font-black text-slate-900">{group.tasks.length}</div>
              <p className="text-xs text-slate-500">当前任务数量</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {props.commandTask ? `${props.commandTask.name}：风险指数 ${props.commandTask.intrusionRisk}` : '暂无预警任务，等待接入实时热成像。'}
        </div>
      </Panel>
      <Panel title="预警任务列表" icon={BellRing}>
        <TaskGrid tasks={props.tasks} onView={props.setSelectedTask} compact />
      </Panel>
    </section>
  )
}

function AiTab(props: TabStateProps) {
  return (
    <section className="grid grid-cols-[1fr_.9fr] gap-4">
      <Panel title="AI 研判" icon={BrainCircuit}>
        <LiveFusionPanel />
        <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {props.liveFusion?.analysis.aiSummary || 'AI 分析将读取实时热成像、地图和 DJI 接入配置。'}
        </div>
      </Panel>
      <Panel title="接口状态" icon={Database}>
        <div className="space-y-3">
          <StatusRow name="地图" value={props.integrationStatus?.map.provider || '未加载'} configured={props.integrationStatus?.map.configured || false} reachable={props.integrationStatus?.map.reachable} />
          <StatusRow name="AI" value={props.integrationStatus?.ai.endpoint || '未加载'} configured={props.integrationStatus?.ai.configured || false} reachable={props.integrationStatus?.ai.reachable} />
          <StatusRow name="DJI" value={props.integrationStatus?.dji.endpoint || '未加载'} configured={props.integrationStatus?.dji.configured || false} reachable={props.integrationStatus?.dji.reachable} />
          <StatusRow name="YOLO" value={props.integrationStatus?.yolo.endpoint || '未加载'} configured={props.integrationStatus?.yolo.configured || false} reachable={props.integrationStatus?.yolo.reachable} />
          <StatusRow name="热成像" value={props.integrationStatus?.thermal.source || '未加载'} configured={props.integrationStatus?.thermal.configured || false} reachable={props.integrationStatus?.thermal.reachable} />
        </div>
      </Panel>
    </section>
  )
}

function DispatchTab(props: TabStateProps) {
  return (
    <section className="grid grid-cols-[.9fr_1.1fr] gap-4">
      <Panel title="处警联动流程" icon={Radar}>
        <ProcessFlow level={props.currentLevel} />
        <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          从边缘感知、融合研判、预警推送到处警调度和留痕复盘，保留原有闭环流程。
        </div>
      </Panel>
      <Panel title="分级处置预案" icon={Route}>
        <DispatchGrid task={undefined} level={props.currentLevel} levelBg={props.level.bg} />
      </Panel>
    </section>
  )
}

function HistoryTab(props: TabStateProps) {
  const completed = props.tasks.filter((task) => task.status === 'COMPLETED' || task.aggregatedAt)
  return (
    <section className="grid grid-cols-[1fr_1fr] gap-4">
      <Panel title="留痕复盘" icon={Database}>
        <div className="space-y-3">
          {(completed.length ? completed : props.tasks).map((task) => (
            <button key={task.id} onClick={() => props.setSelectedTask(task)} className="w-full rounded-md border border-slate-200 bg-white p-3 text-left text-sm hover:bg-slate-50">
              <strong className="text-slate-900">{task.name}</strong>
              <div className="mt-1 text-xs text-slate-500">{task.status} · {levelStyle[task.warningLevel].label} · {task.updatedAt}</div>
            </button>
          ))}
          {!props.tasks.length ? <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">暂无可复盘记录。</div> : null}
        </div>
      </Panel>
      <Panel title="模型汇总记录" icon={CheckCircle2}>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="当前版本" value={props.modelStatus.version} />
          <Metric label="数据图片" value={props.modelStatus.datasetImages} />
          <Metric label="mAP50" value={props.modelStatus.map50.toFixed(3)} />
          <Metric label="最近来源" value={props.modelStatus.source} />
        </div>
      </Panel>
    </section>
  )
}

function SettingsTab(props: TabStateProps) {
  return (
    <section className="grid grid-cols-[1fr_1fr] gap-4">
      <Panel title="系统设置" icon={Database}>
        <div className="space-y-3">
          <StatusRow name="中国地图 API" value={props.integrationStatus?.map.provider || '未加载'} configured={props.integrationStatus?.map.configured || false} reachable={props.integrationStatus?.map.reachable} />
          <StatusRow name="AI 分析接口" value={`${props.integrationStatus?.ai.provider || '未加载'} / ${props.integrationStatus?.ai.endpoint || '未配置'}`} configured={props.integrationStatus?.ai.configured || false} reachable={props.integrationStatus?.ai.reachable} />
          <StatusRow name="DJI 司空 / FlightHub 2" value={`${props.integrationStatus?.dji.provider || '未加载'} / ${props.integrationStatus?.dji.endpoint || '未配置'}`} configured={props.integrationStatus?.dji.configured || false} reachable={props.integrationStatus?.dji.reachable} />
          <StatusRow name="YOLO 服务" value={`${props.integrationStatus?.yolo.provider || '未加载'} / ${props.integrationStatus?.yolo.endpoint || '未配置'}`} configured={props.integrationStatus?.yolo.configured || false} reachable={props.integrationStatus?.yolo.reachable} />
          <StatusRow name="实时热成像" value={`${props.integrationStatus?.thermal.provider || '未加载'} / ${props.integrationStatus?.thermal.source || '未配置'}`} configured={props.integrationStatus?.thermal.configured || false} reachable={props.integrationStatus?.thermal.reachable} />
          <StatusRow name="三维分析" value={`${props.integrationStatus?.threeD?.provider || '未加载'} / ${props.integrationStatus?.threeD?.endpoint || '未配置'}`} configured={props.integrationStatus?.threeD?.configured || false} reachable={props.integrationStatus?.threeD?.reachable} />
        </div>
        <div className="mt-4">
          <IntegrationSettings />
        </div>
      </Panel>
      <Panel title="实时研判状态" icon={CheckCircle2}>
        <LiveFusionPanel />
      </Panel>
    </section>
  )
}

function TaskGrid({ tasks, onView, compact = false }: { tasks: TrainingTask[]; onView: (task: TrainingTask) => void; compact?: boolean }) {
  if (!tasks.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">暂无任务，等待实时研判接入。</div>
  }
  return (
    <section className={compact ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-3 gap-4'}>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onView={onView} />
      ))}
    </section>
  )
}

function DispatchGrid({ task, level, levelBg }: { task?: TrainingTask; level: WarningLevel; levelBg: string }) {
  const items =
    task?.dispatchPlan ||
    ({
      RED: ['立即疏散群众', '实施交通管制', '专业救助力量调派', '指挥中心全程留痕'],
      ORANGE: ['巡护力量前置', '村寨联络员提醒', '无人机复飞跟踪', '准备交通劝导'],
      YELLOW: ['持续观察 1-2 小时', '核对历史轨迹', '村民端注意提醒', '保留升级规则'],
      BLUE: ['常态监测', '记录位置方向', '订阅项圈轨迹', '无需立即处警'],
    }[level] || [])
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item, index) => (
        <div key={item} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <span className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${levelBg}`}>{index + 1}</span>
          {item}
        </div>
      ))}
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

function LatestTaskStages({ task, onCreate }: { task: TrainingTask; onCreate: () => void }) {
  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">最新研判流程</h2>
        <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} />
          新建任务
        </button>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {task.stages.map((stage) => (
          <div key={stage.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <strong className="text-slate-800">{stage.name}</strong>
              <span className="text-slate-500">{stage.status}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className={`h-full rounded-full ${levelStyle[task.warningLevel].bar}`} style={{ width: `${stage.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
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

function StatusRow({ name, value, configured, reachable }: { name: string; value: string; configured: boolean; reachable?: boolean }) {
  return <IntegrationRow name={name} detail={reachable === undefined ? value : `${value} · ${reachable ? '已联通' : '待验证'}`} configured={configured && reachable !== false} />
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

function MetricTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
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

function WarningPopup({ task, onClose }: { task: TrainingTask; onClose: () => void }) {
  const style = levelStyle[task.warningLevel]
  return (
    <div className="fixed right-5 top-5 z-50 w-[420px] rounded-lg border border-white/30 bg-white p-4 shadow-2xl">
      <div className="flex gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${style.bg}`}>{style.short}</div>
        <div>
          <strong className="text-slate-900">{style.label}通知</strong>
          <p className="mt-1 text-sm leading-5 text-slate-600">{task.name}，风险指数 {task.intrusionRisk}，预测窗口 {task.predictionWindow}。</p>
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
            <h2 className="mt-3 text-xl font-bold text-slate-900">结果待确认</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">关闭</button>
        </div>
        <p className="mb-4 text-sm leading-6 text-slate-600">{task.aiSummary}</p>
        <div className="mb-4 grid grid-cols-4 gap-3">
          <Metric label="风险" value={task.intrusionRisk} />
          <Metric label="mAP50" value={String(task.metrics?.mAP50 ?? '-')} />
          <Metric label="Precision" value={String(task.metrics?.precision ?? '-')} />
          <Metric label="Recall" value={String(task.metrics?.recall ?? '-')} />
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2">暂不汇总</button>
          <button onClick={onConfirm} className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">确认并汇总</button>
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
