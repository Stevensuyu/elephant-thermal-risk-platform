// ───────────────────────────────────────────────────────────────────────────
// 真·AI 研判摘要（处置总述）：服务端路由
// ───────────────────────────────────────────────────────────────────────────
// 输入一个警情快照，由真实大模型生成一段 AI 研判结论（aiSummary / 处置总述）。
// 用于：手动/自动警情入库时补全「AI 研判结论」字段（替换原 mock 的
// 「（前端模拟）已接入并生成研判结论…」假文案）。失败返回 { ai:false, reason }。
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
  const task = body.task || body
  const level = task.warningLevel || 'YELLOW'
  const label = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
  const region = [task.province, task.county, task.township].filter(Boolean).join('/') || '云南亚洲象活动区'
  const alertType = task.alertType || '象群入侵'
  const detectedCount = task.detectedCount ?? 1
  const risk = task.intrusionRisk ?? 0

  const prompt = `你是一名亚洲象风险研判专家。请为以下一条警情生成一段简明扼要的「AI 研判结论」（中文，60-120 字，直接陈述结论，不要开头称呼，不要客套）。

【警情】
- 名称：${task.name || '未命名'}｜类型：${alertType}｜预警级别：${label}（${level}）｜风险指数：${risk}
- 区域：${region}｜象群：${detectedCount} 头${task.aiSummary ? `\n- 已有研判：${task.aiSummary}` : ''}

输出要求：一段话，包含①象群态势描述 ②风险判断 ③处置建议，语气专业、面向指挥大屏。`

  try {
    const { content, model } = await callLLM({
      messages: [
        {
          role: 'system',
          content: '你是亚洲象风险研判专家，输出简短专业的研判结论，直接输出结论正文，不要 JSON。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      maxTokens: 400,
      timeoutMs: 90000,
    })
    const aiSummary = content.trim()
    if (!aiSummary) return Response.json({ ai: false, reason: '模型返回为空' })
    return Response.json({ ai: true, aiSummary, model })
  } catch (e: any) {
    return Response.json({ ai: false, reason: String(e?.message || e) })
  }
}
