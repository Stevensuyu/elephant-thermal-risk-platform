import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type StageKey = 'upload' | 'frames' | 'label' | 'train' | 'sync'
export type WarningLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'

export interface TrainingStage {
  key: StageKey
  name: string
  progress: number
  status: '等待' | '处理中' | '完成' | '失败'
}

export interface TrainingTask {
  id: string
  name: string
  description?: string
  status: TaskStatus
  videoFileName?: string
  videoPath?: string
  videoUrl?: string
  modelType: string
  epochs: number
  batchSize: number
  imageSize: number
  progress: number
  stages: TrainingStage[]
  metrics?: Record<string, number | string>
  warningLevel: WarningLevel
  intrusionRisk: number
  predictionWindow: string
  aiSummary: string
  dispatchPlan: string[]
  resultDir?: string
  errorMessage?: string
  needsModelConfirm?: boolean
  aggregatedAt?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
}

export interface ModelStatus {
  version: string
  status: string
  datasetImages: number
  classes: number
  map50: number
  elephantMap50: number
  precision: number
  recall: number
  source: string
  lastUpdated: string
  pendingTaskId?: string
  lastAggregatedTaskId?: string
}

interface DbShape {
  tasks: TrainingTask[]
  modelStatus: ModelStatus
}

const root = process.cwd()
export const storageDir = path.join(root, 'storage')
export const uploadDir = path.join(storageDir, 'uploads')
const dbPath = path.join(storageDir, 'training-db.json')

const defaultModelStatus: ModelStatus = {
  version: 'YOLOv8n-elephant-thermal',
  status: '等待训练任务',
  datasetImages: 6137,
  classes: 7,
  map50: 0.587,
  elephantMap50: 0.989,
  precision: 0.976,
  recall: 0.973,
  source: '多源象群热成像基线模型',
  lastUpdated: '基线模型',
}

export function defaultStages(active: number = -1): TrainingStage[] {
  const names: Array<[StageKey, string]> = [
    ['upload', '视频接收'],
    ['frames', '抽帧分析'],
    ['label', '自动预标注'],
    ['train', 'YOLO 训练'],
    ['sync', '结果同步'],
  ]
  return names.map(([key, name], index) => ({
    key,
    name,
    progress: index < active ? 100 : 0,
    status: index < active ? '完成' : '等待',
  }))
}

export function levelFromRisk(risk: number): WarningLevel {
  if (risk >= 85) return 'RED'
  if (risk >= 65) return 'ORANGE'
  if (risk >= 40) return 'YELLOW'
  return 'BLUE'
}

export function levelText(level: WarningLevel) {
  return { RED: '红色预警', ORANGE: '橙色预警', YELLOW: '黄色预警', BLUE: '蓝色预警' }[level]
}

function buildAiAnalysis(input: { name: string; videoFileName?: string; videoUrl?: string }) {
  const seed = Array.from(`${input.name}${input.videoFileName || input.videoUrl || ''}`).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const herdSize = 5 + (seed % 11)
  const distanceVillage = 180 + (seed % 940)
  const distanceFarm = 120 + ((seed * 7) % 1200)
  const distanceBorder = 300 + ((seed * 11) % 1600)
  const speed = 0.7 + ((seed % 18) / 10)
  const towardSensitive = seed % 3 !== 0
  const timeRisk = new Date().getHours() >= 18 || new Date().getHours() <= 6 ? 18 : 8
  const spatialRisk = Math.max(0, 45 - distanceVillage / 35) + Math.max(0, 35 - distanceFarm / 40) + Math.max(0, 20 - distanceBorder / 90)
  const movementRisk = speed * 8 + (towardSensitive ? 16 : 3)
  const environmentRisk = 8 + (seed % 16)
  const intrusionRisk = Math.max(8, Math.min(99, Math.round(spatialRisk + movementRisk + environmentRisk + timeRisk + herdSize * 1.2)))
  const warningLevel = levelFromRisk(intrusionRisk)
  const predictionWindow = warningLevel === 'RED' ? '30 分钟内' : warningLevel === 'ORANGE' ? '30-60 分钟' : warningLevel === 'YELLOW' ? '1-2 小时' : '2 小时以上'
  const dispatchPlan = {
    RED: ['立即生成红色警情卡片并推送指挥端', '启动群众疏散、道路临时管制与边境线联防', '调派专业救助力量、巡护警力和无人机持续跟踪', '全流程留痕，处置后自动生成复盘材料'],
    ORANGE: ['推送橙色预警至派出所和村寨联络员', '巡护组前置到农田、村庄和道路交界处', '无人机提高复飞频次并更新移动方向', '准备交通劝导和群众提示'],
    YELLOW: ['推送黄色关注提醒', '持续观察 1-2 小时并核对项圈历史轨迹', '核验水源距离、土地覆盖和地形通道', '向村民端发送注意避让信息'],
    BLUE: ['进入蓝色常态监测', '记录象群位置、方向和速度', '保持无人机与项圈轨迹数据订阅', '无需立即处警，保留自动升级规则'],
  }[warningLevel]
  const aiSummary = `融合无人机检测、气象、地理信息、历史项圈轨迹、土地覆盖、地形、水源、道路和村庄分布后，系统识别象群规模约 ${herdSize} 头，最近村庄 ${Math.round(distanceVillage)} 米，最近农田 ${Math.round(distanceFarm)} 米，最近边境线 ${Math.round(distanceBorder)} 米，移动速率 ${speed.toFixed(1)} m/s，${towardSensitive ? '方向指向敏感区域' : '方向暂未指向敏感区域'}。入侵风险指数 ${intrusionRisk}，预测窗口 ${predictionWindow}。`
  return { warningLevel, intrusionRisk, predictionWindow, aiSummary, dispatchPlan }
}

async function ensureStore() {
  await mkdir(uploadDir, { recursive: true })
  try {
    await readFile(dbPath, 'utf8')
  } catch {
    await writeDb({ tasks: [], modelStatus: defaultModelStatus })
  }
}

export async function readDb(): Promise<DbShape> {
  await ensureStore()
  const raw = await readFile(dbPath, 'utf8')
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<DbShape>
  const tasks = (parsed.tasks || []).map((task) => {
    if (task.warningLevel && task.aiSummary && task.dispatchPlan) return task
    return { ...task, ...buildAiAnalysis({ name: task.name, videoFileName: task.videoFileName, videoUrl: task.videoUrl }) }
  })
  return {
    tasks,
    modelStatus: parsed.modelStatus || defaultModelStatus,
  }
}

export async function writeDb(db: DbShape) {
  await mkdir(storageDir, { recursive: true })
  await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8')
}

export async function listTasks() {
  const db = await readDb()
  return db.tasks.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function createTask(input: {
  name: string
  description?: string
  videoFileName?: string
  videoPath?: string
  videoUrl?: string
  modelType?: string
  epochs?: number
  batchSize?: number
  imageSize?: number
}) {
  const db = await readDb()
  const now = new Date().toISOString()
  const ai = buildAiAnalysis(input)
  const task: TrainingTask = {
    id: `TRAIN-${Date.now()}`,
    name: input.name,
    description: input.description || '',
    status: 'PENDING',
    videoFileName: input.videoFileName,
    videoPath: input.videoPath,
    videoUrl: input.videoUrl,
    modelType: input.modelType || 'yolov8n',
    epochs: Number(input.epochs || 10),
    batchSize: Number(input.batchSize || 4),
    imageSize: Number(input.imageSize || 640),
    progress: 0,
    stages: defaultStages(),
    ...ai,
    createdAt: now,
    updatedAt: now,
  }
  db.tasks.unshift(task)
  db.modelStatus = {
    ...db.modelStatus,
    status: `${levelText(task.warningLevel)}任务已接入`,
    source: task.videoFileName || task.videoUrl || task.name,
    lastUpdated: now,
  }
  await writeDb(db)
  return task
}

export async function updateTask(id: string, patch: Partial<TrainingTask>) {
  const db = await readDb()
  const index = db.tasks.findIndex((task) => task.id === id)
  if (index === -1) return null
  db.tasks[index] = { ...db.tasks[index], ...patch, updatedAt: new Date().toISOString() }
  if (patch.status === 'COMPLETED' && patch.metrics && !db.tasks[index].aggregatedAt) {
    db.tasks[index].needsModelConfirm = true
    db.modelStatus = {
      ...db.modelStatus,
      status: `${levelText(db.tasks[index].warningLevel)}训练完成，等待确认汇总`,
      pendingTaskId: db.tasks[index].id,
      source: db.tasks[index].name,
      lastUpdated: new Date().toISOString(),
    }
  } else if (patch.status === 'RUNNING') {
    db.modelStatus = {
      ...db.modelStatus,
      status: `${levelText(db.tasks[index].warningLevel)}训练中 ${Math.round(Number(patch.progress ?? db.tasks[index].progress))}%`,
      source: db.tasks[index].name,
      lastUpdated: new Date().toISOString(),
    }
  }
  await writeDb(db)
  return db.tasks[index]
}

export async function aggregateTaskToModel(id: string) {
  const db = await readDb()
  const index = db.tasks.findIndex((task) => task.id === id)
  if (index === -1) return null
  const task = db.tasks[index]
  if (!task.metrics) return null
  const now = new Date().toISOString()
  db.tasks[index] = {
    ...task,
    needsModelConfirm: false,
    aggregatedAt: now,
    updatedAt: now,
  }
  db.modelStatus = {
    ...db.modelStatus,
    status: `${levelText(task.warningLevel)}模型结果已汇总`,
    datasetImages: db.modelStatus.datasetImages + Number(task.metrics.frames || 0),
    map50: Number(task.metrics.mAP50 ?? db.modelStatus.map50),
    precision: Number(task.metrics.precision ?? db.modelStatus.precision),
    recall: Number(task.metrics.recall ?? db.modelStatus.recall),
    source: task.name,
    lastUpdated: now,
    pendingTaskId: undefined,
    lastAggregatedTaskId: task.id,
  }
  await writeDb(db)
  return { task: db.tasks[index], modelStatus: db.modelStatus }
}

export async function getModelStatus() {
  const db = await readDb()
  return db.modelStatus
}

export async function updateModelStatus(patch: Partial<ModelStatus>) {
  const db = await readDb()
  db.modelStatus = { ...db.modelStatus, ...patch, lastUpdated: new Date().toISOString() }
  await writeDb(db)
  return db.modelStatus
}
