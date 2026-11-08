/**
 * @/lib/utils/disposalShared.ts
 * 处置工单的「纯逻辑 / 类型」共享层 —— 刻意不引入 fs，
 * 供客户端组件（DisposalTimeline 等）安全导入而不触发浏览器打包 'fs' 解析失败。
 *
 * 服务端持久化（含 fs）仍留在 disposalStore.ts；本文件只放类型与无副作用的纯函数。
 */
import type { DisposalWorkflow, DisposalStep } from '@/lib/store/store-disposal-workflows'

/** 步骤是否要求确认：工单默认 ∧ 步骤默认（非自动步骤默认需确认） */
export function stepRequiresConfirm(wf: DisposalWorkflow, step: DisposalStep): boolean {
  const wfDefault = wf.requireConfirm !== false
  const stepDefault = step.requireConfirm !== false && step.auto !== true
  return wfDefault && stepDefault
}
