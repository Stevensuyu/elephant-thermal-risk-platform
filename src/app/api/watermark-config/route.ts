import { NextRequest, NextResponse } from 'next/server'
import { getWatermarkConfig, saveWatermarkConfig } from '@/lib/store/store-watermark-config'

export const dynamic = 'force-dynamic'

/** GET /api/watermark-config - 获取水印配置 */
export async function GET() {
  try {
    const config = getWatermarkConfig()
    return NextResponse.json({ success: true, config })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '获取失败' }, { status: 500 })
  }
}

/** POST /api/watermark-config - 保存水印配置 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const config = saveWatermarkConfig(body)
    return NextResponse.json({ success: true, config })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '保存失败' }, { status: 500 })
  }
}
