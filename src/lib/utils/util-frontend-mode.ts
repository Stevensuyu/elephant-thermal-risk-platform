// ───────────────────────────────────────────────────────────────────────────
// 纯前端模式开关与「实时推送」封装
//
// 后端已整体删除，应用进入「纯前端」运行态。部分组件原本依赖真实服务端的
// SSE（EventSource）推送做事件驱动刷新；但 EventSource 是独立于 window.fetch
// 的网络 API，window.fetch 覆写无法拦截它，会直接打到已删除的 /api/* 路由上
// 产生 404 噪声。此处统一封装：纯前端模式下返回一个 no-op 对象，不发起任何
// 网络请求；若将来恢复真实后端，把 FRONTEND_ONLY 置为 false 即可自动走真实通道。
// ───────────────────────────────────────────────────────────────────────────

/** 是否为纯前端运行态（后端已删除）。 */
export const FRONTEND_ONLY = true

/** EventSource 的最小形态，供组件复用同一套 onmessage/close 调用约定。 */
export interface SseLike {
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  close: () => void
}

/**
 * 打开一个「事件源」。
 * - 纯前端模式：返回一个 no-op 对象（不连接任何服务端，不触发 404）。
 * - 真实后端模式：返回原生 EventSource，组件按原逻辑监听 onmessage。
 */
export function openSse(url: string): SseLike {
  if (FRONTEND_ONLY) {
    return { onmessage: null, onerror: null, close() {} }
  }
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return { onmessage: null, onerror: null, close() {} }
  }
  const es = new EventSource(url)
  return es as unknown as SseLike
}
