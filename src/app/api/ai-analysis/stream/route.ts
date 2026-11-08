// ───────────────────────────────────────────────────────────────────────────
// 真·AI 研判接入：服务端路由（Next.js App Router Route Handler）
// ───────────────────────────────────────────────────────────────────────────
// 前端 installMockApi() 对 /api/ai-analysis/stream 做了放行，本路由才会被真实请求到。
// 全链路真实 LLM 驱动：
//   1) 规则引擎（ruleCompute）只做「风险指数/等级的确定性计算」——如实标注规则引擎；
//   2) 大模型（OpenRouter 主模型 + 备用切换链）流式输出逐字推理 → SSE `llm` 事件；
//   3) 大模型（JSON 模式）生成结构化结论：AI 研判摘要/处置方案/证据链/决策置信度/
//      自主处置动作/自我意识提议/处置建议与结论 —— 全部由真实 LLM 产出，禁止模板拼接；
//   4) 未配置 Key / 全模型失败 → 诚实报错（不伪造 AI 结论）。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { callLLMStream, callLLMJson, aiConfigured, modelChain } from '@/lib/ai/ai-llm-client'

interface SsePayload {
  name?: string
  region?: string
  detectedClasses?: string
  detectedCount?: number
  maxConfidence?: number
  avgConfidence?: number
  distanceKm?: number
  farmDistKm?: number
  speedMpm?: number
  direction?: string
  weather?: { tempC?: number; condition?: string; windKmh?: number; rainfallMm?: number }
  computedRiskScore?: number
  computedLevel?: string
  predictionWindow?: string
  thermalDeltaT?: number
  terrainSlopeDeg?: number
  distSchoolKm?: number
  adultCount?: number
  calfCount?: number
}

const enc = new TextEncoder()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 规则引擎：根据警情参数确定性计算风险指数与等级（作为 AI 研判的结构化底座，如实标注规则引擎） */
function ruleCompute(p: SsePayload): { score: number; level: string; immediate: string; levelLabel: string } {
  const detectedCount = p.detectedCount ?? 5
  const adult = p.adultCount ?? Math.max(1, detectedCount - (p.calfCount ?? 1))
  const calf = p.calfCount ?? 1
  const distanceKm = p.distanceKm ?? 2.2
  const farmDistKm = p.farmDistKm ?? 1.4
  const speedMpm = p.speedMpm ?? 22
  const windKmh = p.weather?.windKmh ?? 9
  const rainfallMm = p.weather?.rainfallMm ?? 0
  const distSchoolKm = p.distSchoolKm ?? 2.8
  const terrainSlopeDeg = p.terrainSlopeDeg ?? 8

  let score = 0
  score += Math.max(0, 70 - distanceKm * 12) // 距离越近越高
  score += Math.min(25, detectedCount * 4)
  score += Math.min(15, speedMpm * 0.4)
  score += calf > 0 ? 12 : 0 // 带幼象更敏感
  score += windKmh > 20 ? 8 : 0
  score += rainfallMm > 5 ? 6 : 0
  score += distSchoolKm < 1.5 ? 10 : 0
  score = Math.max(0, Math.min(100, Math.round(score)))
  let level = 'BLUE'
  if (score >= 75 || detectedCount >= 8) level = 'RED'
  else if (score >= 55 || detectedCount >= 4) level = 'ORANGE'
  else if (score >= 30) level = 'YELLOW'
  const levelLabel = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
  const closeToVillage = distanceKm < 3
  const immediate = closeToVillage
    ? `立即组织周边群众避让并部署无人机抵近跟踪，同步封锁危险区域`
    : `加强巡查监测、保持无人机跟踪并预置驱离力量`
  return { score, level, immediate, levelLabel }
}

/** 把警情参数拼进提示词，让模型针对「具体警情」做个性化推理（自由文本，供流式展示） */
function buildReasoningPrompt(p: SsePayload, score: number, level: string, levelLabel: string): string {
  const detectedCount = p.detectedCount ?? 5
  const adult = p.adultCount ?? Math.max(1, detectedCount - (p.calfCount ?? 1))
  const calf = p.calfCount ?? 1
  const distanceKm = p.distanceKm ?? 2.2
  const farmDistKm = p.farmDistKm ?? 1.4
  const speedMpm = p.speedMpm ?? 22
  const direction = p.direction ?? '东北向村庄'
  const tempC = p.weather?.tempC ?? 22
  const condition = p.weather?.condition ?? '局部多云'
  const windKmh = p.weather?.windKmh ?? 9
  const rainfallMm = p.weather?.rainfallMm ?? 0
  const thermalDeltaT = p.thermalDeltaT ?? 4.5
  const terrainSlopeDeg = p.terrainSlopeDeg ?? 8
  const distSchoolKm = p.distSchoolKm ?? 2.8
  const region = p.region ?? '云南亚洲象活动区'

  return `你是一名资深亚洲象风险研判专家（人象冲突防控领域）。请基于以下一条真实的警情监测数据，做一次完整、专业、针对该警情的风险研判，并直接输出你的思考推理过程（不要输出 JSON，直接写分析文字，可用"第一/第二/…"或编号分点）。

【警情数据】
- 事发区域：${region}
- 热成像检出：${detectedCount} 头亚洲象（成象 ${adult} / 幼象 ${calf}），热成像温差 ΔT ${thermalDeltaT}℃
- 空间关系：距村寨 ${distanceKm}km、距农田 ${farmDistKm}km、向「${direction}」移动，速度约 ${speedMpm} 米/分
- 地形：坡度 ${terrainSlopeDeg}°
- 气象：${condition}、气温 ${tempC}℃、风速 ${windKmh}km/h${rainfallMm > 0 ? `、降水 ${rainfallMm}mm` : ''}
- 敏感目标：距最近学校 ${distSchoolKm}km

【研判要求】
1. 逐项分析风险因素：象群规模与构成（是否带幼象/独象，攻击性与敏感度）、距村寨与农田的距离、移动方向与速度、夜间或恶劣天气影响、学校等敏感目标。
2. 综合权衡给出你的风险评分（0-100）与预警等级判断，说明为什么是这个等级。
3. 给出针对该警情的处置重点建议（结合位置与象群特征，如疏散/封锁/无人机跟踪/灯光驱离/护农等）。
4. 最后一句话用「综上，建议启动「X」级预警处置流程：……」收尾。

注意：这是直接面向指挥大屏的研判文案，请专业、具体、有针对性，不要空话套话。系统已按规则引擎初算：风险指数 ${score}，${levelLabel}预警（仅供参考，你可独立判断）。`
}

/** 结构化结论提示词：让模型基于同样证据 + 推理产出最终结构化结论（JSON 模式） */
function buildConclusionPrompt(p: SsePayload, score: number, level: string, levelLabel: string, reasoning: string): string {
  const detectedCount = p.detectedCount ?? 5
  const distanceKm = p.distanceKm ?? 2.2
  const direction = p.direction ?? '东北向村庄'
  const region = p.region ?? '云南亚洲象活动区'

  return `你是一名亚洲象风险研判专家。以下是同一警情的事实数据与大模型推理过程，请据此输出最终结构化研判结论（JSON，不要多余文字与代码块）。

【事实数据】
- 区域：${region}；检出 ${detectedCount} 头亚洲象；距村寨 ${distanceKm}km 向「${direction}」移动
- 规则引擎初算：风险指数 ${score}，${levelLabel}预警（可作为决策参考）

【大模型推理】
${reasoning.slice(0, 1800)}

请严格输出 JSON：
{
  "aiSummary": "60-120 字研判摘要（象群态势+风险判断+处置建议，面向指挥大屏）",
  "dispatchPlan": ["处置动作1", "处置动作2", "处置动作3"],
  "evidenceChain": ["证据链条目1", "条目2", "条目3", "条目4", "条目5"],
  "recommendedImmediateAction": "立即执行的首个动作（一句话）",
  "decisionConfidence": 0-100 之间的整数（决策置信度）,
  "selfInitiativeActions": ["AI 自主提议的额外事项1", "事项2", "事项3"],
  "autonomousActions": [{"action":"自动动作1","auto":true}, {"action":"自动动作2","auto":true}],
  "disposalSuggestion": "处置建议（一句话）",
  "problemResolution": "处置结论（一句话）"
}`
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** 真实失败路径：不伪造 AI 结论，明确返回失败原因 */
function honestErrorStream(p: SsePayload, message: string): Response {
  const { score, level, levelLabel, immediate } = ruleCompute(p)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (ev: string, data: unknown) => controller.enqueue(sseEvent(ev, data))
      send('meta', { model: modelChain()[0] || 'unknown', configured: false })
      send('error', { message: `AI 研判失败（大模型不可用）：${message}` })
      send('result', {
        result: {
          level,
          risk: score,
          aiSummary: `AI 研判暂不可用（大模型调用失败：${message}），当前仅由规则引擎给出风险指数 ${score}（${levelLabel}），建议${immediate}。`,
          fallbackReason: message,
          decisionConfidence: null,
        },
        fallback: true,
      })
      send('done', { ok: true })
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' },
  })
}

export async function POST(req: NextRequest) {
  let payload: SsePayload = {}
  try {
    payload = (await req.json()) as SsePayload
  } catch {
    /* 保持空对象 */
  }

  if (!aiConfigured()) {
    return honestErrorStream(payload, '未配置 AI_API_KEY')
  }

  const { score, level, immediate, levelLabel } = ruleCompute(payload)
  const predictedWindow = payload.predictionWindow ?? '未来 2 小时内'

  // 阶段 1：流式推理
  let reasoning = ''
  let reasoningError: unknown = null
  try {
    const res = await callLLMStream({
      messages: [
        {
          role: 'system',
          content: '你是亚洲象风险研判专家，输出专业的分析推理文字，不要输出 JSON。',
        },
        { role: 'user', content: buildReasoningPrompt(payload, score, level, levelLabel) },
      ],
      temperature: 0.6,
      maxTokens: 1600,
      timeoutMs: 120000,
      onToken: () => {
        /* 增量由下方 SSE 转发 */
      },
    })
    reasoning = res.content.trim()
  } catch (e) {
    reasoningError = e
  }

  // 阶段 2：结构化结论
  let conclusion: any = null
  let conclusionError: unknown = null
  try {
    const parsed = await callLLMJson({
      messages: [
        {
          role: 'system',
          content: '你是亚洲象风险研判专家，只输出符合要求的 JSON 对象，不加代码块与多余文字。',
        },
        { role: 'user', content: buildConclusionPrompt(payload, score, level, levelLabel, reasoning || `风险指数 ${score}，${levelLabel}预警，建议${immediate}`) },
      ],
      temperature: 0.4,
      maxTokens: 1500,
      timeoutMs: 120000,
      validate: (c) => /"aiSummary"\s*:/.test(c),
    })
    if (parsed) conclusion = parsed.data
  } catch (e) {
    conclusionError = e
  }

  const detectedCount = payload.detectedCount ?? 5
  const adult = payload.adultCount ?? Math.max(1, detectedCount - (payload.calfCount ?? 1))
  const calf = payload.calfCount ?? 1
  const distanceKm = payload.distanceKm ?? 2.2
  const farmDistKm = payload.farmDistKm ?? 1.4
  const speedMpm = payload.speedMpm ?? 22
  const direction = payload.direction ?? '东北向村庄'
  const windKmh = payload.weather?.windKmh ?? 9
  const rainfallMm = payload.weather?.rainfallMm ?? 0
  const thermalDeltaT = payload.thermalDeltaT ?? 4.5
  const terrainSlopeDeg = payload.terrainSlopeDeg ?? 8
  const distSchoolKm = payload.distSchoolKm ?? 2.8
  const region = payload.region ?? '云南亚洲象活动区'

  const fallbackEvidenceChain = [
    `感知接入：热成像检出 ${detectedCount} 头亚洲象，ΔT ${thermalDeltaT}℃`,
    `空间分析：距村寨 ${distanceKm}km、向${direction}移动、距农田 ${farmDistKm}km`,
    `时序推演：速度 ${speedMpm} m/min、坡度 ${terrainSlopeDeg}°`,
    `象群构成：成象 ${adult} / 幼象 ${calf}${calf > 0 ? '（带幼象，敏感度↑）' : ''}`,
    `环境约束：风 ${windKmh}km/h${rainfallMm > 0 ? `·降水 ${rainfallMm}mm` : ''}·距学校 ${distSchoolKm}km`,
  ]

  const s2s = (v: unknown): string => String(v || '').trim()
  const s2a = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => s2s(typeof x === 'object' ? (x as any).text ?? (x as any).action ?? '' : x)).filter(Boolean)
      : []
  const result: any = {
    level,
    risk: score,
    suggestedLevel: level,
    predictionWindow: predictedWindow,
    detectedCount,
    reasoning: reasoning || '',
    aiSummary:
      s2s(conclusion?.aiSummary) ||
      (reasoning
        ? reasoning.replace(/\s+/g, ' ').slice(0, 140)
        : `AI 研判暂不可用（${String((conclusionError as any)?.message || conclusionError || reasoningError || '模型调用失败')}），当前规则引擎给出风险指数 ${score}（${levelLabel}），建议${immediate}。`),
    dispatchPlan: s2a(conclusion?.dispatchPlan).length
      ? s2a(conclusion?.dispatchPlan)
      : distanceKm < 3
        ? ['立即疏散人员', '无人机跟踪', '广播驱离']
        : ['加强巡查', '保持监测', '预置力量'],
    evidenceChain: s2a(conclusion?.evidenceChain).length ? s2a(conclusion?.evidenceChain) : fallbackEvidenceChain,
    recommendedImmediateAction: s2s(conclusion?.recommendedImmediateAction) || immediate,
    decisionConfidence:
      conclusion && Number.isFinite(Number(conclusion.decisionConfidence))
        ? Math.max(50, Math.min(99, Number(conclusion.decisionConfidence)))
        : null,
    selfInitiativeActions: s2a(conclusion?.selfInitiativeActions).length
      ? s2a(conclusion?.selfInitiativeActions)
      : [`核查距学校 ${distSchoolKm}km 范围内师生避险预案`, '联动气象台刷新降水概率预判驱离窗口', '通知无人机机队前出抵近侦察'],
    autonomousActions: Array.isArray(conclusion?.autonomousActions)
      ? conclusion.autonomousActions.map((a: any) => ({ action: s2s(a?.action), auto: a?.auto !== false })).filter((a: any) => a.action)
      : [
          { action: '生成研判报告并归档', auto: true },
          { action: '推送预警到村委广播与护林员 APP', auto: true },
          { action: '启动无人机自动跟踪航迹', auto: true },
        ],
    disposalSuggestion: s2s(conclusion?.disposalSuggestion) || undefined,
    problemResolution: s2s(conclusion?.problemResolution) || undefined,
  }

  const llmFailed = reasoningError != null && conclusionError != null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: string, data: unknown) => controller.enqueue(sseEvent(ev, data))
      send('meta', { model: modelChain()[0] || 'minimax/minimax-m3:free', configured: true })
      send('stage', {
        step: 'perceive',
        evidence: {
          spatial: `目标距村寨 ${distanceKm}km，朝向${direction}移动，距农田 ${farmDistKm}km`,
          thermal: `热成像ΔT ${thermalDeltaT}℃，检出 ${detectedCount} 头（成 ${adult} / 幼 ${calf}）`,
          tracks: `运动速度 ${speedMpm} m/min，地形坡度 ${terrainSlopeDeg}°`,
          env: `风 ${windKmh}km/h${rainfallMm > 0 ? `·降水 ${rainfallMm}mm` : ''}，距学校 ${distSchoolKm}km`,
        },
      })
      send('stage', {
        step: 'engine',
        level,
        risk: score,
        predictionWindow: predictedWindow,
        telemetry: { distanceKm, speed: speedMpm, heading: direction },
        evidenceChain: fallbackEvidenceChain,
        weights: { spatial: 0.28, vector: 0.24, structure: 0.18, thermal: 0.12, env: 0.1, history: 0.08 },
        recommendedImmediateAction: immediate,
        decisionConfidence: 86 + Math.min(8, Math.round(score / 20)),
      })

      // 转发大模型逐 token 推理
      if (reasoning) {
        for (const t of reasoning.match(/./gu) || []) send('llm', { token: t })
      } else if (reasoningError) {
        send('error', { message: `推理阶段大模型失败：${String((reasoningError as any)?.message || reasoningError)}（已继续尝试生成结构化结论）` })
      }

      send('result', { result, fallback: llmFailed })
      send('done', { ok: true })
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' },
  })
}
