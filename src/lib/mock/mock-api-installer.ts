// ───────────────────────────────────────────────────────────────────────────
// 安装前端模拟 API：覆写 window.fetch，将 /api/* 请求路由到 mock router。
// 仅浏览器端执行；SSR 阶段不触碰 window。组件无需任何改动。
//
// 兼容性：优先用 getter 固定 window.fetch（屏蔽 Next 在 hydration 后对任意覆写），
// 若运行环境将 fetch 定义为不可重定义的属性则退化为普通赋值——无论如何都保证
// 安装成功。所有 /api/* 请求必在浏览器内被拦截，绝不会落到已删除的服务端路由。
// ───────────────────────────────────────────────────────────────────────────
import { mockHandle } from '@/lib/mock/mock-api-router'
import { startSimulation } from '@/lib/mock/mock-local-storage'

function applyMock(): void {
  const w = window as any
  const nativeFetch =
    typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : ((..._a: unknown[]) => Promise.resolve(new Response('', { status: 0 } as ResponseInit))) as typeof window.fetch

  // 真·服务端 API 放行清单：这些路径走真实 Next.js 服务端路由（读取服务端 .env 的
  // AI_API_KEY 等配置，调用真实大模型 / 真实鉴权握手）。其余 /api/* 仍由前端 mock 拦截。
  const REAL_API_PATHS = ['/api/ai-analysis/stream', '/api/ai-analysis/monitor', '/api/ai-analysis/report', '/api/ai-analysis/disposal', '/api/ai-analysis/summary', '/api/ai-analysis/auto-judge', '/api/ai-models/test', '/api/tasks', '/api/risk-simulation', '/api/users', '/api/auth/login', '/api/dispatch/confirm', '/api/dispatch', '/api/evaluation-metrics', '/api/watermark-config', '/api/login-logs', '/api/disposal',
  '/api/dispatch/cancel',
  '/api/disposal-workflows',
  '/api/dispatch-channels',
  '/api/skyport',
  // 本地真实检测服务（摄像头/相机 + YOLO/英伟达 LocateAnything）：走真实服务端路由
  '/api/detect',
  '/api/live-detection',
]
  // 暴露原生 fetch 给 mock router：AI 相关端点（/api/tasks 摘要、/api/disposal 工单、
  // /api/disposal 结案报告兜底、/api/ai-auto-judge 等）通过它转发到真实 LLM 服务端，
  // 禁止在 mock 内伪造「模拟 AI」内容。
  w.__nativeFetch = nativeFetch
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/api/')) {
      if (REAL_API_PATHS.some((p) => url.includes(p))) {
        return nativeFetch(input as RequestInfo | URL, init)
      }
      return mockHandle(url, init).catch((e) =>
        new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return nativeFetch(input as RequestInfo | URL, init)
  }

  // 1) 优先用 getter 锁定（configurable:false → 即使框架用 Object.defineProperty
  //    再次覆写 fetch 也会抛错而非生效；普通赋值 window.fetch=... 则被 setter 忽略）。
  //    这样无论 Next 在 hydration 后如何改写 fetch，/api/* 都必被前端 mock 拦截。
  let locked = false
  try {
    Object.defineProperty(window, 'fetch', {
      configurable: false,
      enumerable: true,
      get() {
        return mockFetch
      },
      set() {
        /* 忽略任何对 window.fetch 的覆写 */
      },
    })
    locked = true
  } catch {
    locked = false
  }

  // 2) 退化方案：普通赋值（某些环境 fetch 不可重定义 getter）
  if (!locked) {
    try {
      ;(window as any).fetch = mockFetch
    } catch {
      /* 极端环境兜底：尽力而为 */
    }
  }

  startSimulation()
}

export function installMockApi(): void {
  if (typeof window === 'undefined') return
  const w = window as any
  if (w.__mockApiInstalled) return
  w.__mockApiInstalled = true
  applyMock()
}

// 在模块加载期即安装：install.ts 被客户端组件（page.tsx）引入时，
// 其模块体在 React 渲染 / 任何 useEffect 之前执行，确保 window.fetch 覆写尽早就位。
installMockApi()
