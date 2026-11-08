import { NextRequest, NextResponse } from 'next/server'
import { addLoginLog, getLoginLogs, parseUserAgent, resolveIpLocation } from '@/lib/log/log-login-audit-store'

export const dynamic = 'force-dynamic'

/** GET /api/login-logs - 查询登录日志（支持筛选） */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || ''
    const result = searchParams.get('result') || '' // success/fail/all
    const ip = searchParams.get('ip') || ''
    const keyword = searchParams.get('keyword') || ''
    const limit = parseInt(searchParams.get('limit') || '200', 10)

    let logs = getLoginLogs()

    if (userId) logs = logs.filter((l) => l.userId === userId || l.userName.includes(userId))
    if (result === 'success') logs = logs.filter((l) => l.success)
    if (result === 'fail') logs = logs.filter((l) => !l.success)
    if (ip) logs = logs.filter((l) => l.ip.includes(ip))
    if (keyword) {
      const kw = keyword.toLowerCase()
      logs = logs.filter(
        (l) =>
          l.userName.toLowerCase().includes(kw) ||
          l.location.toLowerCase().includes(kw) ||
          l.browser.toLowerCase().includes(kw) ||
          l.os.toLowerCase().includes(kw),
      )
    }

    return NextResponse.json({ success: true, logs: logs.slice(0, limit), total: logs.length })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 })
  }
}

/** POST /api/login-logs - 记录登录日志 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, userName, role, success, failReason, sessionId } = body

    // 从请求头获取真实客户端IP（Nginx反向代理设置X-Forwarded-For）
    const forwardedFor = req.headers.get('x-forwarded-for') || ''
    const realIp = req.headers.get('x-real-ip') || ''
    const ip = forwardedFor.split(',')[0].trim() || realIp || req.headers.get('cf-connecting-ip') || '未知'

    // 解析User-Agent
    const userAgent = req.headers.get('user-agent') || ''
    const { browser, os, deviceType } = parseUserAgent(userAgent)

    // IP地理位置解析（异步，不阻塞响应）
    let location = '解析中'
    resolveIpLocation(ip).then((loc) => {
      // 异步更新位置（简化：直接在日志记录时用初步值，后续查询时可重新解析）
      location = loc
    }).catch(() => { location = '未知' })

    const entry = addLoginLog({
      sessionId: sessionId || `SID-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: userId || 'unknown',
      userName: userName || '未知用户',
      role: role || 'unknown',
      ip,
      location: location === '解析中' ? '未知' : location,
      userAgent,
      browser,
      os,
      deviceType,
      success: success !== false,
      failReason: failReason || undefined,
    })

    return NextResponse.json({ success: true, log: entry })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '记录失败' }, { status: 500 })
  }
}
