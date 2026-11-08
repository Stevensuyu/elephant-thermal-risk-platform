import { NextRequest, NextResponse } from 'next/server'
import { callLLM } from '@/lib/ai/ai-llm-client'

export const dynamic = 'force-dynamic'

/**
 * 1.6小时（96分钟）入侵风险推演引擎
 * 基于象群空间位姿、移动矢量、昼夜节律、气象预报，按10分钟间隔推演风险走向
 * 结合AI大模型对推演结果进行分析解读和处置建议
 */

// 亚洲象昼夜活动节律系数
const CIRCADIAN_RHYTHM: Record<number, number> = {
  0: 1.2, 1: 1.1, 2: 0.9, 3: 0.7, 4: 0.6, 5: 0.5,
  6: 0.6, 7: 0.7, 8: 0.8, 9: 0.7, 10: 0.6, 11: 0.5,
  12: 0.5, 13: 0.5, 14: 0.6, 15: 0.7, 16: 0.9, 17: 1.1,
  18: 1.3, 19: 1.4, 20: 1.5, 21: 1.5, 22: 1.4, 23: 1.3,
}

interface SimulationInput {
  currentRisk: number
  warningLevel: string
  detectedCount: number
  distVillageKm: number
  speedKmH: number
  headingToVillage: number // 0~1，朝向村寨的矢量投影
  isNight: boolean
  weather: string
  rainProbability: number // 0~100
  location: string
  alertType: string
}

interface SimulationPoint {
  offsetMin: number
  timeLabel: string
  riskValue: number
  distVillageKm: number
  riskLevel: string
}

interface SimulationResult {
  points: SimulationPoint[]
  peakRisk: number
  peakOffsetMin: number
  invasionProbability: number
  trend: 'RISK_RISING' | 'RISK_DROPPING' | 'RISK_STABLE'
  mathModel: string
  aiAnalysis?: string
  aiSuggestions?: string[]
  model?: string
}

function riskLevelOf(risk: number): string {
  if (risk >= 80) return 'RED'
  if (risk >= 60) return 'ORANGE'
  if (risk >= 40) return 'YELLOW'
  return 'BLUE'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const input: SimulationInput = {
      currentRisk: body.currentRisk ?? body.intrusionRisk ?? 50,
      warningLevel: body.warningLevel || 'YELLOW',
      detectedCount: body.detectedCount ?? 1,
      distVillageKm: body.distVillageKm ?? 1.5,
      speedKmH: body.speedKmH ?? 0.8,
      headingToVillage: body.headingToVillage ?? 0.6,
      isNight: body.isNight ?? false,
      weather: body.weather || '晴',
      rainProbability: body.rainProbability ?? 20,
      location: body.location || '未知区域',
      alertType: body.alertType || '象群入侵',
    }

    // 数学模型推演：1.6小时=96分钟，按10分钟间隔，共10个点（0,10,20,...,90）
    const startTime = new Date()
    const points: SimulationPoint[] = []
    const intervalMin = 10
    const totalMin = 96
    const numPoints = Math.floor(totalMin / intervalMin) + 1 // 10个点

    for (let i = 0; i < numPoints; i++) {
      const offsetMin = i * intervalMin
      const offsetHour = offsetMin / 60

      // 1. 空间距离外推
      const travelledTowardsVillage = input.speedKmH * offsetHour * input.headingToVillage
      const projectedDist = Math.max(0.05, input.distVillageKm - travelledTowardsVillage)

      // 2. 距离越近风险越高（非线性）
      const spatialRisk = (1 / projectedDist) * 12

      // 3. 昼夜节律加权
      const futureHour = (startTime.getHours() + Math.floor(offsetHour)) % 24
      const rhythmFactor = CIRCADIAN_RHYTHM[futureHour] ?? 1
      const nightBonus = input.isNight && futureHour >= 18 && futureHour <= 6 ? 1.15 : 1

      // 4. 气象加权（降水增加防护难度）
      const weatherDelta = (input.rainProbability / 100) * 12

      // 5. 象群数量加权
      const countFactor = Math.min(1.5, 1 + (input.detectedCount - 1) * 0.1)

      // 6. 综合风险计算
      let risk = (input.currentRisk * 0.4 + spatialRisk * 0.35) * rhythmFactor * nightBonus * countFactor + weatherDelta
      risk = Math.round(Math.max(5, Math.min(99, risk)))

      const time = new Date(startTime.getTime() + offsetMin * 60 * 1000)
      const timeLabel = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`

      points.push({
        offsetMin,
        timeLabel,
        riskValue: risk,
        distVillageKm: Math.round(projectedDist * 100) / 100,
        riskLevel: riskLevelOf(risk),
      })
    }

    // 分析峰值和趋势
    const peakPoint = points.reduce((max, p) => p.riskValue > max.riskValue ? p : max, points[0])
    const firstRisk = points[0].riskValue
    const lastRisk = points[points.length - 1].riskValue

    let trend: SimulationResult['trend']
    if (peakPoint.riskValue - firstRisk >= 10) trend = 'RISK_RISING'
    else if (firstRisk - lastRisk >= 10) trend = 'RISK_DROPPING'
    else trend = 'RISK_STABLE'

    // 入侵概率计算：基于最小距离和峰值风险
    const minDist = Math.min(...points.map((p) => p.distVillageKm))
    const invasionProbability = Math.round(Math.min(95, Math.max(5, (peakPoint.riskValue * 0.6 + (1 / minDist) * 20))))

    const mathModel = `空间距离外推(v=${input.speedKmH}km/h,朝向系数=${input.headingToVillage}) × 昼夜节律(${peakPoint.offsetMin}min时=${CIRCADIAN_RHYTHM[(startTime.getHours() + Math.floor(peakPoint.offsetMin / 60)) % 24]}) × 象群数量系数(${Math.min(1.5, 1 + (input.detectedCount - 1) * 0.1)}) + 气象加权(降水概率${input.rainProbability}%)`

    const result: SimulationResult = {
      points,
      peakRisk: peakPoint.riskValue,
      peakOffsetMin: peakPoint.offsetMin,
      invasionProbability,
      trend,
      mathModel,
    }

    // AI 分析：对推演结果进行解读和处置建议
    try {
      const pointsSummary = points.map((p) => `${p.timeLabel}(${p.offsetMin}min):风险${p.riskValue}%(${p.riskLevel}),距村寨${p.distVillageKm}km`).join('; ')

      const aiPrompt = `你是亚洲象入侵风险研判专家。基于以下1.6小时风险推演数据，给出专业分析和处置建议。

【警情基本信息】
- 类型：${input.alertType}
- 位置：${input.location}
- 预警等级：${input.warningLevel}
- 象群数量：${input.detectedCount}头
- 当前风险：${input.currentRisk}%
- 距村寨：${input.distVillageKm}km
- 移动速度：${input.speedKmH}km/h
- 朝向村寨系数：${input.headingToVillage}
- 是否夜间：${input.isNight ? '是' : '否'}
- 天气：${input.weather}，降水概率${input.rainProbability}%

【1.6小时推演结果】
- 峰值风险：${peakPoint.riskValue}%（出现在+${peakPoint.offsetMin}分钟，${peakPoint.timeLabel}）
- 入侵概率：${invasionProbability}%
- 趋势：${trend === 'RISK_RISING' ? '风险上升' : trend === 'RISK_DROPPING' ? '风险趋缓' : '高位震荡'}
- 逐时数据：${pointsSummary}

请输出：
1. 风险研判分析（200字以内，说明风险变化的原因和关键时间窗口）
2. 处置建议（3-5条，具体可执行，针对不同时间节点）

严格按JSON格式输出：{"ai-analysis-engine":"...","suggestions":["...","..."]}`

      const llmResult = await callLLM({
        messages: [
          { role: 'system', content: '你是专业的亚洲象入侵风险研判专家，输出严格的JSON格式，不要输出任何其他内容。' },
          { role: 'user', content: aiPrompt },
        ],
        jsonMode: true,
        maxTokens: 1200,
        temperature: 0.3,
        timeoutMs: 45000,
      })

      // 解析AI返回的JSON
      let aiData: any = null
      try {
        aiData = JSON.parse(llmResult.content)
      } catch {
        // 尝试提取JSON
        const jsonMatch = llmResult.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try { aiData = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
        }
      }

      if (aiData) {
        result.aiAnalysis = aiData.analysis || ''
        result.aiSuggestions = Array.isArray(aiData.suggestions) ? aiData.suggestions : []
        result.model = llmResult.model
      }
    } catch (aiError) {
      // AI调用失败时，保留数学推演结果，不伪造AI内容
      console.warn('AI analysis failed, returning math simulation only:', aiError)
      result.aiAnalysis = 'AI分析服务暂不可用，以上为数学模型推演结果，请结合人工研判。'
      result.aiSuggestions = []
    }

    return NextResponse.json({ success: true, simulation: result })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '推演失败' },
      { status: 500 },
    )
  }
}
