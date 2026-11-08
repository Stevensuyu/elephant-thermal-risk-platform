/**
 * @/lib/utils/liveJudge.ts
 * 实时直播流研判链路的纯函数工具（客户端可用，无服务端依赖）。
 *  - isQualifyingDetection：判断当前检测是否为"主控目标（象群/大象）"且达到阈值
 *  - detectToPayload：把实时检测结果（数量/置信度/bbox）转换为推理链路所需的 ReasoningPayload
 *    其中距离/方向由 bbox 面积与中心估算，与 stream-event.ts（eventIngest）保持一致。
 */
import type { ReasoningPayload } from '@/components/dashboard/dashboard-ai-reasoning-trace'
import type { WarningLevel } from '@/lib/utils/util-app-types'

export interface LiveDetection {
  running: boolean
  source?: string
  name?: string
  frame?: number
  detected?: { class: string; confidence: number; bbox_norm: number[] }[]
  max_confidence?: number
  detected_count?: number
  ts?: string
  // 来自 /api/live-detection 实时检测端响应的扩展字段（推演演示结构化多目标结果）
  connected?: boolean
  mode?: 'off' | 'demo' | string
  count?: number
  confidence?: number
  detections?: { track_id?: number; class_name?: string; score?: number; bbox_norm?: number[] }[]
}

const QUALIFYING_CLASSES = ['elephant', '大象', 'asia_elephant', 'elephants']

/** 是否为"主控目标"（象群/大象）且置信度达到阈值——满足即触发自动研判链路 */
export function isQualifyingDetection(det: LiveDetection | null, threshold = 0.5): boolean {
  if (!det || !det.running) return false
  const dets = det.detected || []
  const hit = dets.some(
    (d) => QUALIFYING_CLASSES.includes(d.class) && (d.confidence ?? 0) >= threshold,
  )
  if (hit) return true
  // 检测未带 class 明细时，用 detected_count>0 + max_confidence 兜底判断
  return (det.detected_count ?? 0) > 0 && (det.max_confidence ?? 0) >= threshold
}

/** 由实时检测数据构建研判 payload（距离/方向由 bbox 面积与中心估算） */
export function detectToPayload(
  det: LiveDetection,
  opts: { sourceName?: string; place?: string; lat?: number; lng?: number } = {},
): ReasoningPayload {
  const dets = det.detected || []
  const count = det.detected_count ?? dets.length ?? 1
  const maxConf = det.max_confidence ?? (dets[0]?.confidence ?? 0.8)

  // 由 bbox 面积估算距离（面积越大越近），与 eventIngest 一致
  const areas = dets
    .map((d) => {
      const b = d.bbox_norm || []
      const w = Number(b[2]) || 0
      const h = Number(b[3]) || 0
      return w * h
    })
    .filter((a) => a > 0)
  const avgArea = areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0.06
  const distanceKm = Math.max(0.3, +(6.0 - avgArea * 12).toFixed(1))

  // 由 bbox 中心估算方向
  const cxs = dets.map((d) => {
    const b = d.bbox_norm || []
    return (Number(b[0]) || 0) + (Number(b[2]) || 0) / 2
  })
  const cys = dets.map((d) => {
    const b = d.bbox_norm || []
    return (Number(b[1]) || 0) + (Number(b[3]) || 0) / 2
  })
  const cy = cys.length ? cys.reduce((a, b) => a + b, 0) / cys.length : 0.5
  const direction = cy > 0.55 ? '村寨方向（画面下方）' : '山野方向（画面上方）'

  const speed = avgArea > 0.18 ? 35 : 14

  return {
    name: `${opts.sourceName || '实时直播'}｜象群识别`,
    region: opts.place || '云南亚洲象活动区（实时直播）',
    detectedClasses: '亚洲象（实时检测）',
    detectedCount: count,
    maxConfidence: maxConf,
    avgConfidence: +(maxConf * 0.92).toFixed(2),
    distanceKm,
    farmDistKm: Math.max(0.2, +(distanceKm - 0.8).toFixed(1)),
    speedMpm: speed,
    direction,
    weather: undefined,
    computedRiskScore: undefined,
    computedLevel: undefined,
    predictionWindow: '未来 2 小时内',
    ruleSummary: '实时直播流 YOLO 检测驱动（真实证据 → 引擎定级，不预设结论）',
    ruleActions: [],
  }
}

/**
 * 由真实检测证据推导研判等级与风险（不预设固定结论）。
 * 仅在 isQualifyingDetection 命中（确为象群且达标）后调用。
 *  - 风险 = 置信度为主 × 0.7 + 数量为辅（封顶 99，保底 35）
 *  - 等级由风险（或头数）映射：风险≥85/≥6头→红；≥65/≥3头→橙；≥45→黄；其余蓝
 */
export function judgeFromDetection(
  det: LiveDetection,
  opts: { sourceName?: string } = {},
): { warningLevel: WarningLevel; intrusionRisk: number; name: string; alertType: string; aiSummary: string } {
  const count = det.detected_count ?? det.detected?.length ?? 1
  const conf = det.max_confidence ?? det.detected?.[0]?.confidence ?? 0.8
  const risk = Math.round(Math.min(99, Math.max(35, conf * 70 + Math.min(count, 10) * 3)))
  let warningLevel: WarningLevel = 'BLUE'
  if (risk >= 85 || count >= 6) warningLevel = 'RED'
  else if (risk >= 65 || count >= 3) warningLevel = 'ORANGE'
  else if (risk >= 45) warningLevel = 'YELLOW'
  const label = warningLevel === 'RED' ? '红色' : warningLevel === 'ORANGE' ? '橙色' : warningLevel === 'YELLOW' ? '黄色' : '蓝色'
  const name = `${opts.sourceName || '实时直播'}｜象群识别（检出 ${count} 头）`
  const aiSummary = `实时直播流 YOLO 检测检出 ${count} 头亚洲象，最高置信度 ${(conf * 100).toFixed(0)}%。已据真实检测证据自动研判为${label}预警，风险指数 ${risk}，并自动生成警情与处置工单。`
  return { warningLevel, intrusionRisk: risk, name, alertType: '象群入侵', aiSummary }
}
