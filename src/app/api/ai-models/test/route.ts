// ───────────────────────────────────────────────────────────────────────────
// 真·模型连接测试：服务端路由（Next.js App Router Route Handler）
// ───────────────────────────────────────────────────────────────────────────
// 前端「AI 配置中心」点击「测试连接」时，install.ts 已将 /api/ai-models/test
// 放行到本服务端路由：这里使用用户填写的 baseURL/model/apiKey 真实发起一次
// 最小化的 chat/completions 请求做鉴权握手，返回真实连通结果，绝不伪造。
// 注意：请求目标是用户自行配置的第三方模型端点；仅用于连接测试，Key 不落库。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* 保持空对象 */
  }
  const baseURL = String(body.baseURL || '').trim().replace(/\/$/, '')
  const model = String(body.model || '').trim()
  const apiKey = String(body.apiKey || '').trim()

  if (!baseURL || !model || !apiKey) {
    return Response.json({ ok: false, ms: 0, error: '请填写完整的 base_url / 模型名 / API Key 后再测试' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(baseURL)) {
    return Response.json({ ok: false, ms: 0, error: 'base_url 必须以 http(s):// 开头' }, { status: 400 })
  }

  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 200)
      } catch {
        /* ignore */
      }
      return Response.json({ ok: false, ms, error: `服务端握手失败（HTTP ${res.status}）：${detail}` })
    }
    return Response.json({ ok: true, ms, reply: `已真实连通 ${model}（${baseURL}），耗时 ${ms}ms` })
  } catch (e: any) {
    return Response.json({ ok: false, ms: Date.now() - started, error: `连接异常：${String(e?.message || e).slice(0, 200)}` })
  } finally {
    clearTimeout(timeout)
  }
}
