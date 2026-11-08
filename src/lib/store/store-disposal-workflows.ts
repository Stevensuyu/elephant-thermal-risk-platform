/**
 * @/lib/mock-local-storage/disposalStore.ts
 * 警情处置工单（可组合处置流程）的「类型定义」模块（纯前端化）。
 *
 * 原服务端持久化逻辑（fs / storage）已随后端移除；本文件仅保留
 * 客户端组件所需的类型与 AlertRole 角色枚举，供 DisposalTimeline 等
 * 纯前端组件做类型标注使用。处置工单的读写现由前端 mock API 层
 * （localStorage）统一接管，不再依赖任何服务端存储。
 */

import type { WarningLevel } from '@/lib/utils/util-app-types'

export type AlertRole = 'admin' | 'center' | 'street' | 'police'

export type DisposalStepType =
  | 'receive'
  | 'monitor'
  | 'verify'
  | 'broadcast'
  | 'dispatch'
  | 'uav'
  | 'deter'
  | 'blockade'
  | 'traffic'
  | 'evacuate'
  | 'rescue'
  | 'logistics'
  | 'publicity'
  | 'report'
  | 'review'
  | 'archive'

export interface DisposalStep {
  id: string
  type: DisposalStepType
  title: string
  description: string
  assignedRole: AlertRole
  priority: 'high' | 'normal' | 'low'
  auto: boolean
  status: 'pending' | 'executing' | 'done' | 'skipped'
  estimatedMinutes: number
  aiReasoning?: string
  executedAt?: string
  doneAt?: string
  dependsOn?: string[]
  /** 是否需要成员确认（默认：非系统自动步骤需要确认）。可在后台配置 / 逐步覆盖。 */
  requireConfirm?: boolean
  /** 成员确认人（谁点"确认完成"） */
  confirmedBy?: string
  /** 成员确认时间 */
  confirmedAt?: string
}

export interface DisposalWorkflow {
  taskId: string
  level: WarningLevel
  generatedBy: 'rule' | 'ai-llm-client'
  generatedAt: string
  updatedAt: string
  scenario: string
  aiSummary?: string
  steps: DisposalStep[]
  /** 工单级默认是否要求成员确认（默认 true）。可在后台配置覆盖。 */
  requireConfirm?: boolean
  /** 管理员是否已推进 / 结案（全部必需确认后由管理员解锁推进） */
  advanced?: boolean
  advancedAt?: string
  advancedBy?: string
  /** 自定义报告字段（后台可配，处警后填写留痕） */
  report?: Record<string, string>
  /** 动态处置依据（按等级/象群构成/昼夜/位置计算的因素摘要），用于前端展示 */
  factors?: string[]
  /** AI 处置监控（动态建议 / 超时提醒 / 结案评估）初始快照 */
  aiMonitor?: {
    enabled: boolean
    updatedAt?: string
    factors?: string[]
    suggestions?: { type: string; text: string }[]
  }
}

export interface StepPatch {
  status?: 'pending' | 'executing' | 'done' | 'skipped'
}
