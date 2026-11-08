'use client'

/**
 * 跨标签页工单步骤确认同步工具
 * 使用 BroadcastChannel 在同一浏览器的多个标签页之间同步步骤确认事件。
 * 配合 window CustomEvent('todo:step-confirmed') 实现同标签页 + 跨标签页双重同步。
 */

const channel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('elephant-workflow-sync')
    : null

/** 发布步骤确认事件（跨标签页） */
export function publishWorkflowStepConfirmed(taskId: string, stepId: string) {
  channel?.postMessage({ type: 'step-confirmed', taskId, stepId })
}

/** 订阅步骤确认事件（跨标签页），返回取消订阅函数 */
export function subscribeWorkflowStepConfirmed(
  handler: (taskId: string, stepId: string) => void
): () => void {
  if (!channel) return () => {}
  const msgHandler = (e: MessageEvent) => {
    if (e.data?.type === 'step-confirmed') {
      handler(e.data.taskId, e.data.stepId)
    }
  }
  channel.addEventListener('message', msgHandler)
  return () => channel.removeEventListener('message', msgHandler)
}
