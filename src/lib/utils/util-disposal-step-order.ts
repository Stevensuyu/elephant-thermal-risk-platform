// ───────────────────────────────────────────────────────────────────────────
// 处置步骤顺序强制工具：确保上报联动(report)紧接核实研判(verify)之后
// 用于兼容旧workflow数据（服务端已强制排序，前端做显示层兜底）
// ───────────────────────────────────────────────────────────────────────────
import type { DisposalStep } from '@/lib/store/store-disposal-workflows'

/**
 * 强制排序：将 report(上报联动) 步骤移动到 verify(核实研判) 紧后面。
 * - 若 report 不存在，不做任何操作
 * - 若 verify 不存在，不做任何操作
 * - 若 report 已在 verify 紧后面，保持不变
 * - 其他步骤相对顺序保持不变
 */
export function sortDisposalSteps(steps: DisposalStep[]): DisposalStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return steps
  const verifyIdx = steps.findIndex((s) => s.type === 'verify')
  const reportIdx = steps.findIndex((s) => s.type === 'report')
  if (verifyIdx < 0 || reportIdx < 0) return steps
  // report 已在 verify 紧后面，无需移动
  if (reportIdx === verifyIdx + 1) return steps
  const result = [...steps]
  const [reportStep] = result.splice(reportIdx, 1)
  // 移除 report 后，verify 的索引可能变化（如果 report 在 verify 之前）
  const newVerifyIdx = result.findIndex((s) => s.type === 'verify')
  result.splice(newVerifyIdx + 1, 0, reportStep)
  return result
}
