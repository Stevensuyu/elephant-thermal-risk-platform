/**
 * @/lib/ai-llm-client/reportGen.ts
 * 结案文字报告生成器（纯函数，无浏览器依赖）。
 * 同时被前端 ClosureReportModal 与 mock 后端 router 复用，保证
 * 「显式结案带 report」与「兜底自动结案」两份文字内容一致。
 */
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { DisposalWorkflow } from '@/lib/store/store-disposal-workflows'

/** 由警情类型返回文雅的中文别名（用于报告标题前缀） */
const LEVEL_LABEL: Record<string, string> = {
  RED: '红色',
  ORANGE: '橙色',
  YELLOW: '黄色',
  BLUE: '蓝色',
}

/**
 * 生成结构化中文结案报告文本。
 * @param task 警情（含定位/研判/分发/无人机联动等字段）
 * @param wf   处置工单（步骤完成情况 / 确认留痕），可空
 */
export function buildClosureReport(task: TrainingTask, wf?: DisposalWorkflow | null): string {
  const level: string = task.warningLevel || 'YELLOW'
  const alertType: string = task.alertType || '象群入侵'
  const region: string =
    [task.province, task.city, task.county, task.township].filter(Boolean).join(' / ') || '事发区域'
  const coord: string =
    task.lat != null && task.lng != null
      ? `${Number(task.lat).toFixed(4)}, ${Number(task.lng).toFixed(4)}`
      : '—'
  const risk: number = task.intrusionRisk ?? 0
  const uav: string = task.uavId
    ? `${task.uavId}（${task.uavLat != null ? Number(task.uavLat).toFixed(4) : '—'}, ${
        task.uavLng != null ? Number(task.uavLng).toFixed(4) : '—'
      }）`
    : '未联动'
  const officers: string =
    (task.assignedOfficers && task.assignedOfficers.length)
      ? task.assignedOfficers
          .map((o) => `${o.name}（${o.role}${o.region ? '·' + o.region : ''}）`)
          .join('、')
      : '未指派'
  const now: string = new Date().toLocaleString('zh-CN')

  const steps = Array.isArray((wf as any)?.steps) ? ((wf as any).steps as any[]) : []
  const doneSteps = steps.filter((s) => s.status === 'done')
  const skipped = steps.filter((s) => s.status === 'skipped')

  const lines: string[] = []
  lines.push('【天眼护象 · 警情结案报告】')
  lines.push(`警情编号：${task.id}`)
  lines.push(`警情名称：${task.name}`)
  lines.push(`警情类型：${alertType}`)
  lines.push(`预警级别：${LEVEL_LABEL[level] || level} · 风险指数 ${risk}`)
  lines.push(`发生区域：${region}`)
  lines.push(`坐标位置：${coord}`)
  lines.push(`研判摘要：${task.aiSummary || '—'}`)
  lines.push('')
  lines.push('【处置情况】')
  lines.push(`处置方案：${(wf as any)?.scenario || '—'}`)
  lines.push(`指派人员：${officers}`)
  lines.push(`无人机联动：${uav}`)
  lines.push(`完成步骤：${doneSteps.length}/${steps.length} 步完成（跳过 ${skipped.length} 步）`)
  if (steps.length) {
    steps.forEach((s, i) => {
      const flag = s.status === 'done' ? '✓' : s.status === 'skipped' ? '⊘' : '·'
      const who = s.confirmedBy ? `（${s.confirmedBy} 确认）` : ''
      lines.push(`  ${i + 1}. ${flag} ${s.title}${who}`)
    })
  }
  lines.push('')
  lines.push('【结案结论】')
  lines.push(
    '本警情处置已全部闭环，各环节经责任人员确认留痕，现予以结案归档。' +
      '后续如有同类警情，可参照本次处置经验优化预案。',
  )
  lines.push(`归档时间：${now}`)
  lines.push('（本报告由「天眼护象」系统自动生成，可人工修订后确认存档。）')
  return lines.join('\n')
}
