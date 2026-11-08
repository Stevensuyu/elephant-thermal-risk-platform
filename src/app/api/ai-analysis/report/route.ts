// ───────────────────────────────────────────────────────────────────────────
// 真·AI 评估报告：服务端路由（Next.js App Router Route Handler）
// ───────────────────────────────────────────────────────────────────────────
// 由真实大模型（OpenRouter，minimax/minimax-m3:free 主模型 + 备用模型切换链）
// 根据「警情 + 处置工单全量快照」生成结案/处置评估报告，替换原 reportGen.ts 的
// 固定模板（其第 62 行曾是「处置方案总述（规则引擎）」）。
// 失败时返回 { ai:false, reason }，由调用方诚实标注「AI 生成失败」，绝不冒充 AI。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { callLLM, aiConfigured } from '@/lib/ai/ai-llm-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StepLike {
  title?: string
  status?: string
  confirmedBy?: string
  assignedRole?: string
  type?: string
  priority?: string
}

function descStep(s: StepLike): string {
  const st =
    s.status === 'done' ? '已完成' : s.status === 'executing' ? '执行中' : s.status === 'skipped' ? '已跳过' : '待执行'
  const who = s.confirmedBy ? `（${s.confirmedBy} 确认）` : ''
  const role = s.assignedRole ? `[${s.assignedRole}]` : ''
  return `- ${s.title || '未命名步骤'}${role}：${st}${who}`
}

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

  const task = body.task || {}
  const wf = body.workflow || {}
  const steps: StepLike[] = Array.isArray(wf.steps) ? wf.steps : []
  const doneCount = steps.filter((s) => s.status === 'done').length
  const skippedCount = steps.filter((s) => s.status === 'skipped').length
  const advanced = !!wf.advanced
  const region = [task.province, task.city, task.county, task.township].filter(Boolean).join('/') || '未知'
  const coord =
    task.lat != null && task.lng != null
      ? `${Number(task.lat).toFixed(4)}, ${Number(task.lng).toFixed(4)}`
      : '—'
  const officers: string =
    Array.isArray(task.assignedOfficers) && task.assignedOfficers.length
      ? task.assignedOfficers.map((o: any) => `${o.name}（${o.role || ''}）`).join('、')
      : '未指派'
  const uav = task.uavId ? `${task.uavId}` : '未联动'
  const now = new Date().toLocaleString('zh-CN')

  const prompt = `你是一名「亚洲象警情处置」资深评估专家。请针对以下一起已处置的警情，撰写一份专业、具体、有数据支撑的处置评估报告。报告必须基于给定的真实数据与工单执行情况展开，不要空话套话，不要编造不存在的数字与环节。

【警情信息】
- 警情编号：${task.id || '—'}
- 警情名称：${task.name || '未命名'}
- 类型：${task.alertType || '未知'}｜预警级别：${task.warningLevel || '未知'}｜风险指数：${task.intrusionRisk ?? '—'}
- 区域：${region}｜坐标：${coord}
- 象群：${task.detectedCount ?? '—'} 头｜研判摘要：${task.aiSummary || '—'}
- 指派人员：${officers}｜无人机联动：${uav}

【处置工单】
- 处置方案（scenario）：${wf.scenario || '—'}
- 处置方案总述：${wf.aiSummary || '—'}
- 动态处置依据：${Array.isArray(wf.factors) && wf.factors.length ? wf.factors.join('；') : '无'}
- 进度：已完成 ${doneCount}/${steps.length} 步（跳过 ${skippedCount} 步）${advanced ? '，已结案归档' : '，处置进行中'}
${steps.length ? '【执行步骤】\n' + steps.map(descStep).join('\n') : '（无步骤记录）'}

【报告要求】
请严格按照以下 Markdown 结构输出（不要输出 JSON，直接输出 Markdown 文本）：

# 警情处置评估报告

**警情编号**：${task.id || '—'}　**归档时间**：${now}

## 一、警情概况
（结合名称/类型/级别/象群/区域，概述这是一起什么性质的警情及其风险背景）

## 二、处置过程评估
（结合处置方案、总述、动态依据与各执行步骤的完成情况，评估处置是否及时、有序、闭环，指出亮点与可改进处）

## 三、量化小结
- 完成步骤：${doneCount}/${steps.length}
- 跳过步骤：${skippedCount}
- 结案状态：${advanced ? '已闭环归档' : '正在处置'}
- 总体评估：约 1-2 句定性结论

## 四、经验与改进建议
（3-5 条，具体、可落地）

---
*本报告由「天眼护象」AI 研判引擎基于真实处置数据自动生成。*`

  try {
    const { content, model } = await callLLM({
      messages: [
        {
          role: 'system',
          content: '你是亚洲象警情处置评估专家，输出简洁专业、结构化的 Markdown 中文报告，禁止输出 JSON。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 1800,
      timeoutMs: 120000,
    })
    const reportText = content.trim()
    if (reportText.length < 40) {
      return Response.json({ ai: false, reason: '模型返回内容过短' })
    }
    return Response.json({ ai: true, report: reportText, model, now })
  } catch (e: any) {
    return Response.json({ ai: false, reason: String(e?.message || e) })
  }
}
