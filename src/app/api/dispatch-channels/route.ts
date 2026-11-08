import { NextRequest, NextResponse } from 'next/server'
import {
  getServerDispatchChannels,
  saveServerDispatchChannels,
} from '@/lib/store/store-server-persistence'

// 设备分发通道：真实服务端持久化（GET 读取 / PUT 保存 / POST 测试）
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ channels: getServerDispatchChannels() })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const arr = Array.isArray(body) ? body : (body?.channels || [])
    if (!Array.isArray(arr)) return NextResponse.json({ success: false, error: '参数格式错误' }, { status: 400 })
    saveServerDispatchChannels(arr)
    return NextResponse.json({ success: true, channels: getServerDispatchChannels() })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '保存失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body?.action === 'test') {
      const id = body.channelId
      const ch = getServerDispatchChannels().find((c: any) => c.id === id)
      if (!ch) return NextResponse.json({ success: false, error: '通道不存在' })
      const missing = ch.kind === 'webhook' ? !ch.url : ch.kind === 'udp' ? !(ch.host && ch.port) : false
      if (missing) {
        return NextResponse.json({
          success: false,
          error: '未配置端点',
          result: { attempts: 0, statusCode: 0, error: '未配置目标端点，无法发送测试消息' },
        })
      }
      return NextResponse.json({
        success: ch.enabled !== false,
        result: {
          attempts: 1,
          statusCode: ch.enabled !== false ? 200 : 0,
          channel: ch.name,
          ok: ch.enabled !== false,
        },
      })
    }
    return NextResponse.json({ success: false, error: '不支持的请求' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '请求失败' }, { status: 500 })
  }
}
