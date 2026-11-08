// ───────────────────────────────────────────────────────────────────────────
// 真·AI 处置监控：服务端路由（Next.js App Router Route Handler）
// ───────────────────────────────────────────────────────────────────────────
// 前端处置时间线的「AI 处置监控」在加载时，会先把当前警情 + 处置工单快照 POST
// 到本路由（install.ts 已放行）。这里：
//   1) 读取服务端 .env 的 AI_API_KEY / AI_BASE_URL / AI_MODEL；
//   2) 真实调用大模型（OpenRouter 主模型 + 备用切换链，含 429 退避重试），
//      用 JSON 模式生成「下一步动态建议 + 处置评估报告」
//      （不同警情/不同进度 → 不同内容，非模板拼接）；
//   3) 无 Key / 全模型失败 → 返回 { ai:false, reason }，前端保持规则引擎监控并
//      明确标注「规则引擎监控（未连接大模型）」，绝不冒充 AI。
// 处置进度检测（超时/卡住）仍由浏览器端规则引擎负责（/api/disposal/ai-monitor），
// 本路由只负责「大模型驱动的建议与评估文案」。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { callLLMJson, aiConfigured } from '@/lib/ai/ai-llm-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* 保持空对象 */
  }

  // 未配置 Key → 诚实降级
  if (!aiConfigured()) {
    return Response.json({ ai: false, reason: '未配置 AI_API_KEY' })
  }

  const task = body.task || {}
  const wf = body.workflow || {}
  const steps: any[] = Array.isArray(wf.steps) ? wf.steps : []
  const doneCount = steps.filter((s: any) => s.status === 'done').length
  const total = steps.length
  const executing = steps.find((s: any) => s.status === 'executing')
  const pending = steps.find((s: any) => s.status === 'pending')
  const advanced = !!wf.advanced
  const place = [task.province, task.county, task.township].filter(Boolean).join('/') || '未知'

  const prompt = `你是一名亚洲象警情处置智能监控助手。以下是某警情当前处置工单的实时状态，请输出对该处置的下一步动态建议与整体评估（若已结案则输出结案处置评估报告）。

【警情】${task.name || '未命名'}｜类型：${task.alertType || '未知'}｜预警等级：${task.warningLevel || '未知'}｜象群：${task.detectedCount ?? '-'} 头｜位置：${place}
【动态处置依据】${Array.isArray(wf.factors) && wf.factors.length ? wf.factors.join('；') : '无'}
【进度】已完成 ${doneCount}/${total} 步${executing ? `；正在执行「${executing.title}」` : ''}${pending ? `；下一步待执行「${pending.title}」` : ''}
【步骤清单】${steps.map((s: any) => `${s.title}(${s.status === 'done' ? '已完成' : s.status === 'executing' ? '执行中' : '待执行'}${s.confirmedBy ? `·${s.confirmedBy}确认` : ''})`).join('、')}
【状态】${advanced ? '已结案归档' : '处置进行中'}

请严格输出 JSON（不要 markdown 代码块、不要多余文字），格式：
{"suggestions":["建议1","建议2","建议3"],"evaluation":{"summary":"一句话总体评估","stepsDone":0,"stepsTotal":0,"durationNote":"结案耗时/阶段说明"}}
要求：建议具体、可执行、贴合当前进度与动态依据；若已结案，suggestions 可给后续归档/复盘建议，evaluation 为结案评估报告。`

  try {
    const parsed = await callLLMJson({
      messages: [
        {
          role: 'system',
          content: '你是亚洲象警情处置监控助手，只输出符合要求的 JSON 对象，不加代码块与多余文字。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 1000,
      timeoutMs: 120000,
      validate: (c) => /"suggestions"/.test(c),
    })
    if (!parsed) {
      return Response.json({ ai: false, reason: '模型未返回合法 JSON' })
    }
    const d = parsed.data || {}
    const suggestions: any[] = (Array.isArray(d.suggestions) ? d.suggestions : [])
      .map((s: any) => ({ text: String(s) }))
      .filter((s: any) => s.text.length > 0)
    const ev = d.evaluation && typeof d.evaluation === 'object' ? d.evaluation : {}
    const monitor = {
      suggestions: suggestions.length
        ? suggestions
        : advanced
          ? [{ text: `处置已结案，已完成 ${doneCount}/${total} 步，建议完成归档与复盘留痕。` }]
          : [],
      evaluation: ev.summary
        ? {
            closed: advanced,
            summary: String(ev.summary),
            stepsDone: Number(ev.stepsDone ?? doneCount),
            stepsTotal: Number(ev.stepsTotal ?? total),
            durationNote: String(ev.durationNote || ''),
          }
        : null,
    }
    return Response.json({ ai: true, model: parsed.result.model, monitor })
  } catch (e: any) {
    return Response.json({ ai: false, reason: String(e?.message || e) })
  }
}
