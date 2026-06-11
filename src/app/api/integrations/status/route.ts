import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    amap: {
      configured: Boolean(process.env.NEXT_PUBLIC_AMAP_KEY),
      provider: 'AMap / 高德地图 JS API 2.0',
    },
    ai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      provider: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    },
    yolo: {
      configured: Boolean(process.env.YOLO_SERVICE_URL || process.env.YOLO_PYTHON || process.env.PYTHON),
      provider: process.env.YOLO_SERVICE_URL ? 'Remote YOLO service' : 'Local Python ultralytics',
      weights: process.env.YOLO_WEIGHTS || 'yolov8n.pt',
    },
  })
}
