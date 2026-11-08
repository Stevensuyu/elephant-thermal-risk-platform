import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/detect/[...path] — 本地检测服务代理
 *
 * 把前端请求转发到本机检测服务（worker/detect，默认 http://127.0.0.1:8765），
 * 实现「设置里选摄像头/相机 → 本地 YOLO 或英伟达 LocateAnything 检测」的真实链路。
 * 检测服务未启动时返回 503 + 明确提示，前端据此引导用户启动 start-detect.bat。
 *
 * 稳定性修复要点（针对 Pocket 3 连接频繁失败）：
 *  1. 超时从 30s 延长到 60s：摄像头 open() 是慢操作（Pocket 3 / UVC 设备
 *     在 Win11 上经常需要 3-10s 才能打开），30s 太短会误判为「服务未启动」。
 *  2. 区分错误码：连接拒绝 / 网络异常 → 503（服务未启动）；
 *     超时（AbortError）→ 504（服务在线但响应慢），让前端能区分两种情况。
 *  3. 保留原始状态透传：后端返回 4xx/5xx 时，状态码与 JSON body 原样转发，
 *     方便前端按后端语义处理（如 select_source 失败时显示具体错误）。
 */
const DETECT_BASE = process.env.DETECT_BASE_URL || 'http://127.0.0.1:8765'
const PROXY_TIMEOUT_MS = 60000

async function proxy(target: string, req: NextRequest, path: string) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const init: RequestInit = {
      method: req.method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text()
    }
    const resp = await fetch(target, init)
    clearTimeout(timer)
    const text = await resp.text()
    // 原样透传后端状态码与 body（包括 4xx/5xx），让前端能拿到结构化错误信息
    return new NextResponse(text, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError'
    const reason = isTimeout ? '响应超时（设备正在连接，请稍候）' : '未启动'
    const status = isTimeout ? 504 : 503
    return NextResponse.json(
      {
        ok: false,
        error: `本地检测服务${reason}（请运行 start-detect.bat 或手动启动 worker/detect/run.py）`,
        timeout: isTimeout,
      },
      { status },
    )
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const sub = params.path.join('/')
  return proxy(`${DETECT_BASE}/api/${sub}`, req, sub)
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const sub = params.path.join('/')
  return proxy(`${DETECT_BASE}/api/${sub}`, req, sub)
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  const sub = params.path.join('/')
  return proxy(`${DETECT_BASE}/api/${sub}`, req, sub)
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  const sub = params.path.join('/')
  return proxy(`${DETECT_BASE}/api/${sub}`, req, sub)
}
