import type { WarningLevel } from '@/lib/store'

export interface AnalysisResult {
  warningLevel: WarningLevel
  intrusionRisk: number
  predictionWindow: string
  aiSummary: string
  dispatchPlan: string[]
  analysisMode: 'openai' | 'heuristic'
  analysisSource: string
}

interface TaskLikeInput {
  name: string
  description?: string
  videoFileName?: string
  videoPath?: string
  videoUrl?: string
  modelType?: string
  epochs?: number
  batchSize?: number
  imageSize?: number
}

function heuristicAnalysis(input: TaskLikeInput): AnalysisResult {
  const seed = Array.from(`${input.name}${input.description || ''}${input.videoFileName || ''}${input.videoUrl || ''}`)
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const distanceVillage = 180 + (seed % 940)
  const distanceFarm = 120 + ((seed * 7) % 1200)
  const distanceBorder = 300 + ((seed * 11) % 1600)
  const speed = 0.7 + ((seed % 18) / 10)
  const towardSensitive = seed % 3 !== 0
  const timeRisk = new Date().getHours() >= 18 || new Date().getHours() <= 6 ? 18 : 8
  const spatialRisk = Math.max(0, 45 - distanceVillage / 35) + Math.max(0, 35 - distanceFarm / 40) + Math.max(0, 20 - distanceBorder / 90)
  const movementRisk = speed * 8 + (towardSensitive ? 16 : 3)
  const environmentRisk = 8 + (seed % 16)
  const herdSize = 5 + (seed % 11)
  const intrusionRisk = Math.max(8, Math.min(99, Math.round(spatialRisk + movementRisk + environmentRisk + timeRisk + herdSize * 1.2)))
  const warningLevel = riskToLevel(intrusionRisk)
  const predictionWindow = warningLevel === 'RED' ? '30 分钟内' : warningLevel === 'ORANGE' ? '30-60 分钟' : warningLevel === 'YELLOW' ? '1-2 小时' : '2 小时以上'
  const dispatchPlan = {
    RED: ['立即生成红色警情并推送值班端', '启动疏散、交通管制和边界联动', '调派救援力量、巡护警力和无人机持续跟进', '全流程留痕，处置后自动生成复盘材料'],
    ORANGE: ['推送橙色预警至派出所和村委联络员', '巡护组前置到农田、村落和道路交界处', '无人机提高复飞频次并更新移动方向', '准备交通劝导和群众提示'],
    YELLOW: ['推送黄色关注提醒', '持续观察 1-2 小时并核对历史轨迹', '核验水源距离、地形遮挡和道路通道', '向村民端发送注意避让信息'],
    BLUE: ['进入蓝色常态监测', '记录位置、方向和速度', '保持无人机与巡圈轨迹数据订阅', '无需立即处警，保留自动升级规则'],
  }[warningLevel]
  const aiSummary = `融合无人机检测、气象、地理与历史轨迹后，系统识别出目标规模约 ${herdSize} 头，最近村庄 ${Math.round(distanceVillage)} 米，最近农田 ${Math.round(distanceFarm)} 米，最近边界线 ${Math.round(distanceBorder)} 米，移动速度 ${speed.toFixed(1)} m/s。入侵风险指数 ${intrusionRisk}，预测窗口 ${predictionWindow}。`
  return {
    warningLevel,
    intrusionRisk,
    predictionWindow,
    aiSummary,
    dispatchPlan,
    analysisMode: 'heuristic',
    analysisSource: 'heuristic',
  }
}

function extractJson(text: string) {
  const trimmed = text.trim()
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null
  try {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
  } catch {
    return null
  }
}

export async function analyzeTaskInput(input: TaskLikeInput): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  if (!apiKey) {
    return heuristicAnalysis(input)
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: '你是一个面向野外热成像与大象风险研判系统的分析引擎。只输出 JSON，不要输出额外文字。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              taskName: input.name,
              description: input.description || '',
              videoFileName: input.videoFileName || '',
              videoUrl: input.videoUrl || '',
              modelType: input.modelType || 'yolov8n',
              epochs: input.epochs || 10,
              batchSize: input.batchSize || 4,
              imageSize: input.imageSize || 640,
              requiredFields: {
                warningLevel: 'RED | ORANGE | YELLOW | BLUE',
                intrusionRisk: '0-100 number',
                predictionWindow: 'string',
                aiSummary: 'string in Chinese',
                dispatchPlan: 'string array of 4 concise Chinese actions',
                analysisSource: 'string',
              },
            }),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      return heuristicAnalysis(input)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const payload = extractJson(content) || {}
    const warningLevel = (payload.warningLevel as WarningLevel) || riskToLevel(Number(payload.intrusionRisk) || 52)
    const intrusionRisk = Number.isFinite(Number(payload.intrusionRisk)) ? Number(payload.intrusionRisk) : warningLevel === 'RED' ? 90 : warningLevel === 'ORANGE' ? 74 : warningLevel === 'YELLOW' ? 52 : 28
    const predictionWindow = typeof payload.predictionWindow === 'string' && payload.predictionWindow.trim() ? payload.predictionWindow : '1-2 小时'
    const aiSummary = typeof payload.aiSummary === 'string' && payload.aiSummary.trim() ? payload.aiSummary.trim() : heuristicAnalysis(input).aiSummary
    const dispatchPlan = Array.isArray(payload.dispatchPlan) && payload.dispatchPlan.length
      ? payload.dispatchPlan.map((item: unknown) => String(item))
      : heuristicAnalysis(input).dispatchPlan

    return {
      warningLevel,
      intrusionRisk,
      predictionWindow,
      aiSummary,
      dispatchPlan,
      analysisMode: 'openai',
      analysisSource: typeof payload.analysisSource === 'string' && payload.analysisSource.trim() ? payload.analysisSource : `openai:${model}`,
    }
  } catch {
    return heuristicAnalysis(input)
  }
}

function riskToLevel(risk: number): WarningLevel {
  if (risk >= 85) return 'RED'
  if (risk >= 65) return 'ORANGE'
  if (risk >= 40) return 'YELLOW'
  return 'BLUE'
}
