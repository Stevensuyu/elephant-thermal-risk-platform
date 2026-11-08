// ───────────────────────────────────────────────────────────────────────────
// 真·AI 自主研判（auto-judge）：服务端路由
// ───────────────────────────────────────────────────────────────────────────
// 输入真实检测证据（检出数量/置信度/距离等）+ 规则引擎初算的风险指数与等级，
// 由真实大模型生成「AI 研判结论」（aiSummary）与研判依据。
// 风险指数/等级的数值本身是确定性计算（规则引擎，如实标注），AI 负责对具体
// 警情输出个性化的研判文案与解释，禁止模板拼接。失败返回 { ai:false, reason }。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { callLLM, aiConfigured } from '@/lib/ai/ai-llm-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* 保持空对象 */
  }
  if (!aiConfigured()) {
    return Response.json({ ai: false, reason: '未配置 AI_API_KEY' })
  }

  const count = Math.max(1, Number(body.detectedCount ?? body.count ?? 1))
  const rawConf = Number(body.confidence ?? body.maxConfidence ?? 80)
  const conf = rawConf > 1 ? rawConf / 100 : rawConf
  const distanceKm = Number(body.distanceKm ?? 2)
  // 规则引擎初算（确定性公式，如实标注规则引擎）
  const risk = Math.round(Math.min(99, Math.max(35, conf * 70 + Math.min(count, 10) * 3 + (distanceKm < 2 ? 10 : 0))))
  let level = 'BLUE'
  if (risk >= 85 || count >= 6) level = 'RED'
  else if (risk >= 65 || count >= 3) level = 'ORANGE'
  else if (risk >= 45) level = 'YELLOW'
  const label = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'

  const prompt = `你是一名亚洲象风险研判专家。基于以下实时检测证据，输出对该警情的 AI 研判结论（60-120 字）与研判要点（3 条）。
【检测证据】
- 检出 ${count} 头亚洲象，最高置信度 ${(conf * 100).toFixed(0)}%，目标距村寨 ${distanceKm}km
- 规则引擎初算风险指数 ${risk}（${label}预警，仅供参考，请结合证据独立判断）
请输出 JSON：{"aiSummary":"研判结论正文，含象群态势/风险判断/处置建议","points":["要点1","要点2","要点3"]}`

  try {
    const { content, model } = await callLLM({
      messages: [
        {
          role: 'system',
          content:
            '你是亚洲象风险研判专家，只输出 JSON 对象（含 aiSummary 与 points 两个字段），不要多余文字与代码块。',
        },
        { role: 'user', content: prompt },
      ],
      jsonMode: true,
      temperature: 0.4,
      maxTokens: 700,
      timeoutMs: 90000,
    })
    const parsed = (() => {
      try {
        return JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
      } catch {
        const m = content.match(/\{[\s\S]*\}/)
        return m ? JSON.parse(m[0]) : null
      }
    })()
    const aiSummary = String(parsed?.aiSummary || '').trim()
    if (!aiSummary) return Response.json({ ai: false, reason: '模型未返回研判结论' })
    const points: string[] = (Array.isArray(parsed?.points) ? parsed.points : [])
      .map((p: any) => String(p).trim())
      .filter(Boolean)
      .slice(0, 5)
    return Response.json({
      ok: true,
      ai: true,
      model,
      analysis: {
        level,
        risk,
        detectedCount: count,
        confidence: Number((conf * 100).toFixed(0)),
        distanceKm,
        aiSummary,
        points,
        evidence: { detectedCount: count, confidence: Number(conf.toFixed(2)), distanceKm },
        weights: { confidence: 0.7, count: 0.18, proximity: 0.12 },
      },
    })
  } catch (e: any) {
    return Response.json({ ai: false, reason: String(e?.message || e) })
  }
}
