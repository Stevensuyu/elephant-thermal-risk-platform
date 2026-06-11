import { NextResponse } from 'next/server'
import { runYoloPrediction } from '@/lib/yolo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('image')
      const sourceUrl = String(form.get('sourceUrl') || '')
      const result = await runYoloPrediction({
        file: file instanceof File ? file : undefined,
        sourceUrl: sourceUrl || undefined,
      })
      return NextResponse.json(result)
    }

    const body = await request.json()
    const result = await runYoloPrediction({ sourceUrl: body.sourceUrl })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YOLO prediction failed'
    const configured = Boolean(process.env.YOLO_SERVICE_URL || process.env.YOLO_PYTHON || process.env.PYTHON)
    return NextResponse.json(
      {
        error: message,
        configured,
        hint: configured
          ? '请确认 YOLO 权重、Python 依赖或远程 YOLO 服务可用。'
          : '请配置 YOLO_SERVICE_URL，或在自托管环境配置 YOLO_PYTHON/PYTHON 和 ultralytics。',
      },
      { status: 503 },
    )
  }
}
