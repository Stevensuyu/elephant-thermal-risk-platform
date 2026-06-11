import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { analyzeTaskInput, type AnalysisResult } from '@/lib/analysis'
import type { IntegrationConfig } from '@/lib/integrations'

export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type StageKey = 'upload' | 'frames' | 'label' | 'train' | 'sync'
export type WarningLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'

export interface TrainingStage {
  key: StageKey
  name: string
  progress: number
  status: '等待' | '处理中' | '完成' | '失败'
}

export interface TrainingTask extends AnalysisResult {
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
  status: '等待研判任务',
  datasetImages: 6137,
  classes: 7,
  map50: 0.587,
  elephantMap50: 0.989,
  precision: 0.976,
  recall: 0.973,
  source: '实时热成像基线',
  lastUpdated: '基线状态',
}

export function defaultStages(active: number = -1): TrainingStage[] {
  const names: Array<[StageKey, string]> = [
    ['upload', '视频接收'],
    ['frames', '抽帧分析'],
    ['label', '自动预标注'],
    ['train', '结果同步'],
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
  const tasks = (parsed.tasks || []).map((task) => ({
    ...task,
    warningLevel: task.warningLevel || 'BLUE',
    intrusionRisk: Number(task.intrusionRisk || 18),
    predictionWindow: task.predictionWindow || '2 小时以上',
    aiSummary: task.aiSummary || '等待 AI 研判结果。',
    dispatchPlan: task.dispatchPlan?.length ? task.dispatchPlan : ['持续监测', '核验位置', '记录轨迹', '等待升级规则'],
    analysisMode: task.analysisMode || 'heuristic',
    analysisSource: task.analysisSource || 'legacy-db',
  }))
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
  integrationConfig?: Partial<IntegrationConfig>
}) {
  const db = await readDb()
  const now = new Date().toISOString()
  const analysis = await analyzeTaskInput(input, input.integrationConfig ? { ai: input.integrationConfig.ai } : undefined)
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
    ...analysis,
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
      status: `${levelText(db.tasks[index].warningLevel)}结果完成，等待确认汇总`,
      pendingTaskId: db.tasks[index].id,
      source: db.tasks[index].name,
      lastUpdated: new Date().toISOString(),
    }
  } else if (patch.status === 'RUNNING') {
    db.modelStatus = {
      ...db.modelStatus,
      status: `${levelText(db.tasks[index].warningLevel)}处理中 ${Math.round(Number(patch.progress ?? db.tasks[index].progress))}%`,
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
