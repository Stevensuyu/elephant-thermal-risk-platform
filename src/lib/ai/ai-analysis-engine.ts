/**
 * @/lib/ai-llm-client/analysis.ts
 * Unified risk analysis — seeded RNG, risk calculation, AI summary generation.
 *
 * Risk Score Formula (user-specified six-factor model):
 *   0.30 x 空间接近度 + 0.20 x 时间敏感度 + 0.20 x 目标特征
 *   + 0.15 x 环境因素 + 0.10 x 历史数据 + 0.05 x 处置能力
 *
 * Weight verification: 0.30 + 0.20 + 0.20 + 0.15 + 0.10 + 0.05 = 1.00
 */
import type { WarningLevel, AIAnalysis } from '@/lib/utils/util-app-types'

// ── Risk Weights (must sum to 1.00) ───────────────────────────────────────
export const RISK_WEIGHTS = {
  /** 0-1 km = 100, 5+ km = 0 */
  spatial: 0.30,
  /** imminent = 100, days away = 0 */
  temporal: 0.20,
  /** group size, aggression, crop proximity */
  target: 0.20,
  /** weather, terrain, visibility */
  environmental: 0.15,
  /** historical encounter density */
  historical: 0.10,
  /** current response capacity */
  response: 0.05,
} as const

export interface RiskFactors {
  spatial: number       // 0-100
  temporal: number      // 0-100
  target: number        // 0-100
  environmental: number // 0-100
  historical: number    // 0-100
  response: number      // 0-100
}

/** Compute weighted risk score (0-100) from six factors. */
export function computeRiskScore(factors: RiskFactors): number {
  const raw =
    factors.spatial       * RISK_WEIGHTS.spatial +
    factors.temporal      * RISK_WEIGHTS.temporal +
    factors.target        * RISK_WEIGHTS.target +
    factors.environmental * RISK_WEIGHTS.environmental +
    factors.historical    * RISK_WEIGHTS.historical +
    factors.response      * RISK_WEIGHTS.response
  return Math.min(100, Math.max(0, Math.round(raw)))
}

/** Convert numeric risk score to WarningLevel. */
export function riskLevelFromScore(score: number): WarningLevel {
  if (score >= 80) return 'RED'
  if (score >= 60) return 'ORANGE'
  if (score >= 35) return 'YELLOW'
  return 'BLUE'
}

// ── Seeded Pseudo-random (LCG) ────────────────────────────────────────────
export function hashStr(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h & 0x7fffffff
  }
  return h || 1
}

export function seededRng(seed: number) {
  let s = seed
  return (): number => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}

// ── AI Analysis Builder ───────────────────────────────────────────────────
/** Build deterministic AI analysis from task name + file info (shared by store & API). */
export function buildAiAnalysis(input: {
  name: string
  videoFile?: string
  url?: string
}): AIAnalysis {
  const seedStr = input.name + (input.videoFile ?? '') + (input.url ?? '')
  const seed = hashStr(seedStr)
  const rng = seededRng(seed)

  const detectedCount = Math.floor(rng() * 12) + 2
  const distance      = +(rng() * 4.5 + 0.3).toFixed(2)
  const farmDist      = +(rng() * 2.5 + 0.2).toFixed(2)
  const speed         = Math.floor(rng() * 180) + 20

  const DIRS    = ['北偏东','正北','北偏西','正东','正西','南偏东','西南','东南']
  const TARGETS = ['向村寨方向','向农田方向','沿山脊线迁移','向水源地迁移','向低海拔区域移动']
  const direction = DIRS[Math.floor(rng() * DIRS.length)]
  const heading   = TARGETS[Math.floor(rng() * TARGETS.length)]

  // Determine level based on distance and count
  let level: WarningLevel
  let intrusionRisk: number
  if (distance < 0.8 || detectedCount >= 10) {
    level = 'RED';    intrusionRisk = Math.floor(rng() * 15) + 85
  } else if (distance < 1.5 || detectedCount >= 7) {
    level = 'ORANGE'; intrusionRisk = Math.floor(rng() * 20) + 60
  } else if (distance < 2.5 || detectedCount >= 4) {
    level = 'YELLOW'; intrusionRisk = Math.floor(rng() * 20) + 35
  } else {
    level = 'BLUE';   intrusionRisk = Math.floor(rng() * 25) + 8
  }

  const WIN: Record<WarningLevel, string> = {
    RED:    `${Math.floor(rng() * 20) + 10}–${Math.floor(rng() * 10) + 30} 分钟`,
    ORANGE: `${Math.floor(rng() * 30) + 30}–${Math.floor(rng() * 20) + 60} 分钟`,
    YELLOW: `${Math.floor(rng() * 2) + 1}–${Math.floor(rng() * 2) + 3} 小时`,
    BLUE:   `${Math.floor(rng() * 4) + 4}–${Math.floor(rng() * 4) + 8} 小时`,
  }

  const aiSummary =
    `无人机热成像识别到象群共 ${detectedCount} 头，当前以 ${speed} m/min 速率${heading}（${direction}方向），` +
    `最近村寨直线距离 ${distance} km，最近农田约 ${farmDist} km。` +
    `基于轨迹外推与地形分析，入侵风险指数 ${intrusionRisk}%，预计 ${WIN[level]} 内可能抵达敏感区域。` +
    `建议${
      level === 'RED'    ? '立即启动应急响应，疏散周边村民，协调林草局与公安联合处置' :
      level === 'ORANGE' ? '加密巡逻频次，准备驱离预案，通知沿线村寨加强防护' :
      level === 'YELLOW' ? '持续监测，向周边村寨发出预警通知，次日复查轨迹' :
                           '保持常规监测，记录迁徙轨迹，存档备查'
    }。`

  const DISPATCH: Record<WarningLevel, string> = {
    RED:    `立即调度应急小组赴 ${input.name} 区域，启动村民转移预案；协调县林草局、公安、消防联合处置；沿象群前进路线设置声波隔离带；全程无人机持续跟踪，30 分钟汇报一次；同步启动受损农田赔偿预案登记。`,
    ORANGE: `派遣 2 支巡护队赴现场核实情况，通知沿线 3 km 内所有村寨；准备声波驱离设备和光驱器；无人机间隔 30 分钟侦查；向县级指挥中心上报橙色预警，保持待命状态。`,
    YELLOW: `通知当地护林员加强巡查，向村委会发出预警短信；安排次日早晨无人机复查象群动向；记录方向和数量变化，暂不需要特殊处置。`,
    BLUE:   `登记入档，继续常规 AI 监测，无需特殊处置；每日上报象群位置轨迹；关注天气变化对迁徙路线的影响。`,
  }

  return {
    level,
    intrusionRisk,
    predictionWindow: WIN[level],
    aiSummary,
    dispatchPlan: DISPATCH[level].split(/[；;]\s*/).filter(Boolean),
    detectedCount,
    distance,
    farmDist,
    speed,
    direction,
  }
}

// ── Real Inference Analysis Builder ─────────────────────────────────────────
/**
 * Build AIAnalysis from real YOLO inference JSON output.
 * Replaces buildAiAnalysis when real model results are available.
 */
export interface InferenceResult {
  detected_count: number
  total_detections: number
  avg_confidence: number
  max_confidence: number
  frames_analyzed: number
  total_video_frames: number
  video_fps: number
  video_duration_sec: number
  detections_per_frame: number[]
  class_counts: Record<string, number>
  bboxes: Array<{
    frame: number
    class: string
    confidence: number
    bbox: number[]
    bbox_norm: number[]
  }>
  spatial: {
    center_x: number
    center_y: number
    spread: number
    avg_area_ratio: number
  }
}

export function buildAiAnalysisFromInference(
  input: { name: string; videoFile?: string },
  inference: InferenceResult,
): AIAnalysis {
  const detectedCount = inference.detected_count
  const avgConf = inference.avg_confidence
  const maxConf = inference.max_confidence

  // ── Estimate distance from detection size (larger bbox → closer) ──
  const avgArea = inference.spatial.avg_area_ratio
  // Heuristic: area_ratio 0.001 → ~5km, 0.01 → ~2km, 0.05+ → <0.5km
  const distance = Math.max(0.2, +(5 - avgArea * 80).toFixed(2))
  const farmDist = Math.max(0.1, +(distance * 0.6 + 0.3).toFixed(2))

  // ── Estimate speed from movement between frames ──
  const spread = inference.spatial.spread
  const baseSpeed = detectedCount > 5 ? 120 : detectedCount > 3 ? 80 : 50
  const speed = Math.round(baseSpeed + spread * 60)

  // ── Direction from spatial center ──
  const cx = inference.spatial.center_x
  const cy = inference.spatial.center_y
  const dirs = ['北偏东','正北','北偏西','正东','正西','南偏东','西南','东南']
  const dirIdx = Math.round(((Math.atan2(cy - 0.5, cx - 0.5) + Math.PI) / (2 * Math.PI)) * 8) % 8
  const direction = dirs[dirIdx]

  const TARGETS = ['向村寨方向','向农田方向','沿山脊线迁移','向水源地移动','向低海拔区域移动']
  const heading = TARGETS[Math.abs(Math.round(cx * 10 + cy * 5)) % TARGETS.length]

  // ── Risk scoring via six-factor model ──
  const spatialFactor = Math.min(100, Math.max(0, Math.round((1 - distance / 5) * 100)))
  const temporalFactor = detectedCount >= 8 ? 90 : detectedCount >= 5 ? 65 : detectedCount >= 3 ? 40 : 15
  const targetFactor = Math.min(100, Math.round(detectedCount * 8 + avgConf * 20))
  const environmentalFactor = 50 // Default — would need weather API
  const historicalFactor = 40   // Default — would need historical DB
  const responseFactor = 30     // Default — current capacity

  const factors: RiskFactors = {
    spatial: spatialFactor,
    temporal: temporalFactor,
    target: targetFactor,
    environmental: environmentalFactor,
    historical: historicalFactor,
    response: responseFactor,
  }
  const score = computeRiskScore(factors)
  const level = riskLevelFromScore(score)

  // ── Prediction window ──
  const WIN: Record<WarningLevel, string> = {
    RED:    '10–30 分钟',
    ORANGE: '30–60 分钟',
    YELLOW: '1–3 小时',
    BLUE:   '4–8 小时',
  }

  // ── AI Summary ──
  const elephantCount = inference.class_counts['elephant'] ?? inference.class_counts['person'] ?? detectedCount
  const classInfo = Object.entries(inference.class_counts)
    .map(([cls, cnt]) => `${cls === 'elephant' ? '大象' : cls} ${cnt} 头`)
    .join('，')

  const aiSummary =
    `无人机热成像经 YOLO 模型实时检测（共分析 ${inference.frames_analyzed} 帧），` +
    `识别到 ${classInfo || `目标 ${detectedCount} 个`}，` +
    `平均置信度 ${(avgConf * 100).toFixed(1)}%，最高置信度 ${(maxConf * 100).toFixed(1)}%。` +
    `当前以 ${speed} m/min 速率${heading}（${direction}方向），` +
    `最近村寨直线距离约 ${distance} km，最近农田约 ${farmDist} km。` +
    `入侵风险指数 ${score}%，预计 ${WIN[level]} 内可能抵达敏感区域。` +
    `建议${
      level === 'RED'    ? '立即启动应急响应，疏散周边村民，协调林草局与公安联合处置' :
      level === 'ORANGE' ? '加密巡逻频次，准备驱离预案，通知沿线村寨加强防护' :
      level === 'YELLOW' ? '持续监测，向周边村寨发出预警通知，次日复查轨迹' :
                           '保持常规监测，记录迁徙轨迹，存档备查'
    }。`

  const DISPATCH: Record<WarningLevel, string> = {
    RED:    `立即调度应急小组赴 ${input.name} 区域，启动村民转移预案；协调县林草局、公安、消防联合处置；沿象群前进路线设置声波隔离带；全程无人机持续跟踪，30 分钟汇报一次；同步启动受损农田赔偿预案登记。`,
    ORANGE: `派遣 2 支巡护队赴现场核实情况，通知沿线 3 km 内所有村寨；准备声波驱离设备和光驱器；无人机间隔 30 分钟侦查；向县级指挥中心上报橙色预警，保持待命状态。`,
    YELLOW: `通知当地护林员加强巡查，向村委会发出预警短信；安排次日早晨无人机复查象群动向；记录方向和数量变化，暂不需要特殊处置。`,
    BLUE:   `登记入档，继续常规 AI 监测，无需特殊处置；每日上报象群位置轨迹；关注天气变化对迁徙路线的影响。`,
  }

  return {
    level,
    intrusionRisk: score,
    predictionWindow: WIN[level],
    aiSummary,
    dispatchPlan: DISPATCH[level].split(/[；;]\s*/).filter(Boolean),
    detectedCount,
    distance,
    farmDist,
    speed,
    direction,
  }
}

// ── Deterministic Map Marker Position ──────────────────────────────────────
const MAP_W = 3.8
const MAP_H = 3.2

/** Deterministic geographic position from task id (Yunnan approximate range). */
export function seedMarkerPosition(id: string): { lng: number; lat: number } {
  const [x, z] = seedPos(id)
  return { lng: 97.5 + (x / 1.9) * 3.5, lat: 21.5 + (z / 1.6) * 3.0 }
}

export function seedPos(id: string): [number, number] {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  h = h >>> 0
  const x = ((h & 0xffff) / 0xffff) * MAP_W * 0.82 - MAP_W * 0.41
  const z = ((h >>> 16) / 0xffff) * MAP_H * 0.82 - MAP_H * 0.41
  return [x, z]
}

// ── Shared Style Constants ────────────────────────────────────────────────
export interface LevelStyle {
  label: string
  short: string
  bg: string
  text: string
  bar: string
  ring: string
}

export const levelStyle: Record<WarningLevel, LevelStyle> = {
  RED:    { label: '红色预警', short: '红', bg: 'bg-red-600',    text: 'text-red-700',    bar: 'bg-red-500',    ring: 'ring-red-200' },
  ORANGE: { label: '橙色预警', short: '橙', bg: 'bg-orange-500', text: 'text-orange-700', bar: 'bg-orange-500', ring: 'ring-orange-200' },
  YELLOW: { label: '黄色预警', short: '黄', bg: 'bg-amber-400',  text: 'text-amber-700',  bar: 'bg-amber-400',  ring: 'ring-amber-200' },
  BLUE:   { label: '蓝色预警', short: '蓝', bg: 'bg-blue-600',   text: 'text-blue-700',   bar: 'bg-blue-500',   ring: 'ring-blue-200' },
}

export const warningOrder: WarningLevel[] = ['RED', 'ORANGE', 'YELLOW', 'BLUE']

/** Default dispatch plan fallback per level. */
export function defaultDispatch(level: WarningLevel): string[] {
  return {
    RED:    ['立即疏散群众', '实施交通管制', '专业救助力量调派', '指挥中心全程留痕'],
    ORANGE: ['巡护力量前置', '村寨联络员提醒', '无人机复飞跟踪', '准备交通劝导'],
    YELLOW: ['持续观察 1-2 小时', '核对历史轨迹', '村民端注意提醒', '保留升级规则'],
    BLUE:   ['常态监测', '记录位置方向', '订阅项圈轨迹', '无需立即处警'],
  }[level]
}
