/**
 * @/lib/utils/types.ts
 * Unified type definitions — single source of truth for client & server.
 */

// ── Warning Level ──────────────────────────────────────────────────────────
/** 四级预警等级：红、橙、黄、蓝 */
export type WarningLevel = 'BLUE' | 'YELLOW' | 'ORANGE' | 'RED'

// ── Training Pipeline ──────────────────────────────────────────────────────
export interface TrainingStage {
  name: string
  progress: number
  status: 'pending' | 'running' | 'completed' | 'error'
}

// ── Autonomous Judgment (AI 自主研判) ──────────────────────────────────────
export interface AutonomousAction {
  /** 动作描述 */
  action: string
  /** 是否由系统自主决定（无需人工触发） */
  auto: boolean
  /** 是否已被系统自动执行/起草 */
  done: boolean
}

export interface AutonomousAnalysis {
  /** 证据链：感知 → 空间 → 推演 → 决策 */
  evidenceChain: string[]
  /** 自主决策动作（系统自主起草/执行） */
  autonomousActions: AutonomousAction[]
  /** 是否自动升级响应级别 */
  autoEscalated: boolean
  /** 决策置信度 0-100 */
  decisionConfidence: number
  /** 建议立即执行项 */
  recommendedImmediateAction: string
  /** AI 自主给出的问题处置结论 */
  problemResolution: string
  /** 大模型研判来源（如 'deepseek-chat'）；为空表示规则引擎生成 */
  aiModel?: string
  /** 大模型给出的风险推理过程 */
  riskReasoning?: string
}

// ── AI Analysis ────────────────────────────────────────────────────────────
export interface AIAnalysis {
  level: WarningLevel
  intrusionRisk: number
  predictionWindow: string
  aiSummary: string
  dispatchPlan: string[]
  detectedCount: number
  distance: number
  farmDist: number
  speed: number
  direction: string
  /** 是否来自真实 YOLO 推理（而非模拟） */
  realInference?: boolean
  /** 各类别检测数量 */
  classCounts?: Record<string, number>
  /** 标注图 Web 路径 */
  resultImage?: string
  /** 自主研判结果 */
  autonomous?: AutonomousAnalysis
}

// ── Training Task (frontend-facing) ────────────────────────────────────────
export interface TrainingTask {
  id: string
  /** 目标唯一标识（同一头象/同一位置/同一目标ID），用于警情去重 */
  targetId?: string
  name: string
  description?: string
  status: string
  progress: number
  warningLevel: WarningLevel
  intrusionRisk: number
  predictionWindow: string
  aiSummary: string
  dispatchPlan: string[]
  detectedCount: number
  needsModelConfirm: boolean
  aggregatedAt?: string
  closedAt?: string
  completedAt?: string
  videoFileName?: string
  videoUrl?: string
  metrics?: { mAP50: number; precision?: number; recall?: number }
  stages: TrainingStage[]
  createdAt: string
  updatedAt: string
  realInference?: boolean
  classCounts?: Record<string, number>
  resultImage?: string
  autonomous?: AutonomousAnalysis
  /** 实时监控事件溯源 */
  eventId?: string
  deviceId?: string
  deviceName?: string
  /** 触发方式：'realtime-stream' 表示由实时监控流自动生成；
   *  'realtime-demo' 表示由用户主动开启的「推演演示」视频源生成（非真实视频，需诚实标注） */
  triggeredBy?: string
  /** 是否为推演演示生成的警情（非真实视频检测）；用于前端诚实标注「推演演示」徽标 */
  simulated?: boolean
  /** 研判来源模型（大模型名 / 规则引擎标识），用于前端展示来源徽标 */
  aiModel?: string
  // ── 手动添加警情（含定位）扩展字段 ──
  /** 警情类型：象群入侵 / 人象冲突 / 农作物损毁 / 闯入村庄 / 道路预警 */
  alertType?: string
  /** 行政区划：省 / 市 / 区·县 / 乡·镇（手动录入或逆地理解析） */
  province?: string
  city?: string
  county?: string
  township?: string
  /** 经纬度（定位当前位置或地图拾取） */
  lat?: number
  lng?: number
  /** 是否携带图片 / 视频证据 */
  hasMedia?: boolean
  /** 接入的摄像头 / 无人机设备名 */
  sourceDevice?: string
  /** 是否由人工手动添加（区别于自动识别 / 训练生成） */
  manual?: boolean
  /** 分发后写入：本警情指派的处置人员（区域化分发结果，#9） */
  assignedOfficers?: { id: string; name: string; role: string; region?: string }[]
  /** 分发区域（警情发生区域 / 无人机定位锁定区域，#9/#10） */
  dispatchRegion?: string
  /** 无人机实时定位联动（#10）：分发时同步的最近无人机 id 与实时坐标 */
  uavId?: string
  uavLat?: number
  uavLng?: number
  uavSyncedAt?: string
  /** 真实传感细项（引擎研判用过的 ΔT / 跟踪帧 / 坡度 / 学校距离 / 成年·幼象数） */
  sensor?: {
    thermalDeltaT?: number
    trackingFrames?: number
    terrainSlopeDeg?: number
    distSchoolKm?: number
    adultCount?: number
    calfCount?: number
  }
  // ── 实时研判 · AI 研判后人工确认（模式 confirm）──
  /** AI 研判已完成，等待人工确认后才分发（confirm 模式） */
  pendingConfirm?: boolean
  /** 人工确认时间 */
  confirmedAt?: string
  /** 人工确认人 */
  confirmedBy?: string
  /** 是否使用 AI 研判（ai/confirm 为 true；manual 为 false） */
  useAi?: boolean
  // ── 结案归档 · 文字报告 + 视频（#指令B）──
  /** 工单结案归档时生成的结案报告（文字总结 + 关联复盘视频），由人工确认并存档到警情 */
  report?: CaseReport
}

// ── 结案报告（工单结案归档时生成，可手动编辑后确认存档） ──────────────────
export interface CaseReport {
  /** 结案文字总结（可手动修改） */
  text: string
  /** 关联复盘视频文件名（生成于浏览器，会话内可预览/下载） */
  videoName?: string
  /** 视频 base64 dataURL（仅当体积较小才随警情持久化；过大则只保留元数据，不持久化） */
  videoDataUrl?: string
  /** 视频大小（KB） */
  videoSizeKb?: number
  /** 视频是否已随警情持久化（false 表示仅当次会话内可预览/下载，刷新后需重新生成） */
  videoPersisted?: boolean
  /** 报告生成时间（ISO） */
  generatedAt: string
  /** 最后编辑人（确认人姓名） */
  editedBy?: string
  /** 归档时间（ISO，服务端写入） */
  archivedAt?: string
  /** AI 生成模型标识（真实 LLM 生成时记录） */
  aiModel?: string
}

// ── 用户角色与预警消息 ─────────────────────────────────────────────────────
export type UserRole = 'POLICE' | 'LEADER' | 'CIVILIAN'

export interface AlertMessage {
  id: string
  level: WarningLevel
  title: string
  message: string
  senderRole: UserRole
  createdAt: string
  status: 'unread' | 'read'
}

// ── Model Status ───────────────────────────────────────────────────────────
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
}

// ── 警情任务状态 → 中文标签 ──────────────────────────────────────────────
export const TASK_STATUS_LABEL: Record<string, string> = {
  RUNNING: '正在处置',
  PENDING: '待处理',
  CLOSED: '已闭环',
  COMPLETED: '已完成',
  ERROR: '异常',
}
/** 把警情任务状态值转换为中文显示文本，未识别状态原样返回 */
export function taskStatusLabel(status?: string): string {
  if (!status) return '—'
  return TASK_STATUS_LABEL[status] ?? status
}
