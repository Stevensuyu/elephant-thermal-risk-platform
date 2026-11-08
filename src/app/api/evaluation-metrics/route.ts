import { NextResponse } from 'next/server'
import { getEvaluationMetrics } from '@/lib/store/store-server-persistence'

export const dynamic = 'force-dynamic'

// GET /api/evaluation-metrics - 获取处置评估指标
export async function GET() {
  try {
    const metrics = getEvaluationMetrics()
    return NextResponse.json(metrics)
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '获取评估指标失败' },
      { status: 500 }
    )
  }
}
