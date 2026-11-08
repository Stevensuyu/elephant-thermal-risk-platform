// ───────────────────────────────────────────────────────────────────────────
// 真·AI 处置工单生成：服务端路由（Next.js App Router Route Handler）
// ───────────────────────────────────────────────────────────────────────────
// 由真实大模型生成「处置方案（scenario）+ 处置总述（aiSummary）+ 动态处置依据
// （factors）+ 处置流程（steps 步骤序列）+ 初始 AI 处置监控建议」。
// 该端点替代原 mock/router.ts 中 buildDisposalWorkflow 的固定剧本表（五维拼接）。
// 服务端只做结构化校验/兜底归一化（type/role/id 白名单、等级规则补位），
// 所有文案一律来自真实 LLM；失败时返回 { ai:false, reason }，由调用方诚实标注。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import { callLLMJson, aiConfigured } from '@/lib/ai/ai-llm-client'
import { sortDisposalSteps } from '@/lib/utils/util-disposal-step-order'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 步骤类型白名单（与前端 DisposalStepType 一致，保证图标/标签可渲染） */
const TYPE_SET = new Set([
  'receive', 'monitor', 'verify', 'broadcast', 'dispatch', 'uav', 'deter', 'blockade',
  'traffic', 'evacuate', 'rescue', 'logistics', 'publicity', 'report', 'review', 'archive',
])
const ROLE_SET = new Set(['center', 'street', 'police', 'admin'])
const PRIORITY_SET = new Set(['high', 'normal', 'low'])

/** 规则补位：LLM 未给足等级时，按预警等级确定默认首步（只影响执行顺序/补位，不产生文案） */
function defaultFlowByLevel(level: string): { type: string; title: string; role: string }[] {
  const base = [
    { type: 'verify', title: '核实警情位置与象群动态', role: 'center' },
    { type: 'dispatch', title: '向属地警力与街道干部下发处置指令', role: 'police' },
    { type: 'uav', title: '无人机持续跟踪与态势监控', role: 'police' },
    { type: 'report', title: '处置反馈与记录归档', role: 'center' },
  ]
  if (level === 'RED' || level === 'ORANGE') {
    return [
      { type: 'receive', title: '接收红色预警并启动应急响应', role: 'center' },
      ...base.slice(0, 2),
      { type: 'blockade', title: '组织群众避让并封锁危险区域', role: 'street' },
      ...base.slice(2),
    ]
  }
  return base
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
  const template: string = body.template || 'auto' // auto|minimal|standard|emergency
  const level: string = task.warningLevel || 'YELLOW'
  const alertType: string = task.alertType || '象群入侵'
  const region: string = task.township || task.county || task.province || '事发区域'
  const total = task.detectedCount || 0
  const adult = task.sensor?.adultCount ?? (total > 0 ? total : 5)
  const calf = task.sensor?.calfCount ?? 0
  const hour = task.createdAt ? new Date(task.createdAt).getHours() : new Date().getHours()
  const isNight = hour >= 20 || hour < 6
  const place = `${task.province || ''}${task.county || ''}${task.township || ''}`
  const nearWater = /水|河|江|湖|塘|库|溪|泉/.test(place)
  const nearBorder = /边境|口岸|界桩|勐|打洛|磨憨|瑞丽|畹町|孟连|沧源|西盟/.test(place)
  const nearVillage = /村|寨|乡|镇|街道/.test(place)
  const levelLabel = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
  const aiSummaryOfTask = task.aiSummary || ''

  const stepRange = level === 'RED' ? '8-10' : level === 'ORANGE' ? '7-9' : level === 'YELLOW' ? '6-8' : '4-6'
  const templateHint = template === 'minimal' ? '【模板：最小化响应】仅保留最核心步骤，强调快速核实与监测，不主动驱离/疏散。' : template === 'standard' ? '【模板：常规响应】标准处置流程，包含核实、预警、调度、跟踪、反馈。' : template === 'emergency' ? '【模板：紧急响应】全要素处置，必须包含疏散、封锁、驱离、医疗待命、跨部门联动。' : '【模板：AI自主决策】根据警情等级与场景自主决定步骤详略。'
  const prompt = `你是一名亚洲象人象冲突处置专家。请为以下警情生成一套【动态处置方案】，做到一案一策、具体可执行，禁止套用固定模板。
${templateHint}

【警情】
- 名称：${task.name || '未命名'}｜类型：${alertType}｜预警级别：${levelLabel}（${level}）
- 区域：${region}
- 象群：${total} 头（成象 ${adult} / 幼象 ${calf}）${total === 1 ? '（独象，攻击性强，需专人盯防）' : ''}${calf > 0 ? '（带幼象，敏感易受惊）' : ''}
- 时刻：${isNight ? '夜间（20点-6点，能见度低，须启动热成像/红外设备）' : '白天'}
- 位置特征：${place}${nearWater ? '（近水域，象群可能饮水停留）' : ''}${nearBorder ? '（近边境/口岸，须联动边防）' : ''}${nearVillage ? '（邻近村寨/集镇，人员安全风险高）' : ''}
- 研判摘要：${aiSummaryOfTask || '—'}

【固定骨架步骤——必须包含，不可省略，按此顺序】
1. type=receive（接警受理，assignedRole=center，auto=true）
2. type=verify（核实研判，assignedRole=center）
…（中间为动态步骤，由你根据警情决定）
N-1. type=review（复盘留痕，assignedRole=admin）
N. type=archive（结案归档，assignedRole=admin，auto=true）

【动态可选步骤——根据警情等级/类型/场景决定是否包含，可合并相似步骤】
- monitor（监测锁定）：黄色以上独立成步；蓝色可合并到 verify 的描述中
- broadcast（预警通知）：黄色以上需要；将广播、灯光、APP推送、短信等多种预警手段合并为一条，具体手段写在 description 中（如"启动村广播高音喇叭+护林员APP推送+路口灯光警示"），不要拆成多条
- dispatch（人员调度）：橙色/红色需要；黄色视情况；蓝色可省略
- uav（无人机跟踪）：夜间/大群(≥6头)/橙色以上需要；独象场景在 description 中说明"专人盯防+无人机伴飞"；蓝色可省略
- deter（科学驱离）：橙色/红色/农作物损毁/闯入村庄需要；蓝色可省略
- blockade（封锁警戒）：橙色/红色/闯入村庄/道路预警需要；黄色可合并到 dispatch
- evacuate（群众疏散）：红色/闯入村庄/邻近村寨(<500m)需要；橙色视情况
- traffic（交通管制）：仅道路预警类型需要
- rescue（医疗救援）：人象冲突/闯入村庄/红色需要待命
- logistics（损失登记）：仅农作物损毁类型需要
- report（上报联动）：橙色/红色需要；黄色可合并到 review

【步数要求】本次警情为${levelLabel}预警，steps 总数必须为 ${stepRange} 步（含固定骨架4步）。蓝色最小化，红色全要素。

【步骤内容要求】
- 每个步骤的 title 和 description 必须贴合本次警情的具体场景（如夜间写"启动热成像无人机抵近跟踪"而非"无人机跟踪"；独象写"专人盯防独象轨迹"；近村寨写"组织邻近村寨群众有序疏散"）
- 每个步骤的 description 必须具体（不少于35字），包括：操作方法、参与人员、设备、注意事项或预期效果。禁止写"做好相关工作"等空洞表述
- assignedRole 只能取 center/street/police/admin，步骤负责角色要多样化（管理中心负责调度核实、警员负责现场处置、街道干部负责群众疏散、管理员负责审核归档）
- estimatedMinutes 根据步骤性质和等级调整（接警2-5分钟，驱离15-30分钟，疏散10-20分钟，监测30-60分钟）
- priority：红色/橙色关键步骤为 high，其余 normal；蓝色全 normal
- 第一步(receive) auto=true，最后一步(archive) auto=true，其余 auto=false

请严格输出 JSON（不要 markdown 代码块、不要多余文字），格式：
{
  "scenario": "一句话处置方案名称，如『夜间热成像跟踪+村寨预警+定点驱离』",
  "aiSummary": "处置方案总述，不少于120字，包括：警情分析（象群规模/位置/时间/威胁等级）、处置策略（整体思路与关键动作）、资源调度（人员/设备/部门协同）、风险评估（潜在风险与应对措施），须贴合本次警情具体场景，禁止通用模板",
  "factors": ["动态处置依据1", "动态处置依据2", "动态处置依据3"],
  "steps": [
    {"type":"receive","title":"接警受理","description":"...","assignedRole":"center","priority":"normal","auto":true,"estimatedMinutes":2}
  ],
  "monitorSuggestions": ["初始监控建议1（具体操作+时间要求+责任人）", "建议2", "建议3", "建议4"]
}
steps 数组按执行顺序排列，第一步必须是 receive，最后一步必须是 archive，倒数第二步必须是 review。`

  try {
    let parsed = await callLLMJson({
      messages: [
        {
          role: 'system',
          content:
            '你是亚洲象警情处置专家，只输出符合要求的 JSON 对象，不输出任何多余文字、不加 markdown 代码块。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 1800,
      timeoutMs: 60000,
      validate: (c) => /"steps"\s*:/.test(c),
    })
    if (!parsed) {
      // 二次重试：简化 prompt（限 5 步、短描述），避免长响应截断导致 JSON 解析失败
      const retryPrompt = `你是亚洲象人象冲突处置专家。请为以下警情生成处置方案，严格输出 JSON（不要 markdown、不要多余文字）。
【警情】${task.name || '未命名'}｜${levelLabel}预警｜${region}｜${total}头象｜${isNight ? '夜间' : '白天'}
固定骨架必须包含：第1步receive(接警受理,center,auto=true)、第2步verify(核实研判,center)、倒数第2步review(复盘留痕,admin)、最后1步archive(结案归档,admin,auto=true)。中间根据警情插入2-4个动态步骤（如监测预警、人员调度、无人机跟踪、科学驱离、封锁警戒、群众疏散等）。
请输出 JSON：{"scenario":"方案名","aiSummary":"3句总述","factors":["依据1","依据2","依据3"],"steps":[{"type":"receive","title":"接警受理","description":"指挥中心接收警情并建单","assignedRole":"center","priority":"normal","auto":true,"estimatedMinutes":2},{"type":"verify","title":"核实研判","description":"核实象群规模与威胁等级","assignedRole":"center","priority":"normal","auto":false,"estimatedMinutes":10},{"type":"dispatch","title":"人员调度","description":"调度属地力量赶赴现场","assignedRole":"street","priority":"normal","auto":false,"estimatedMinutes":10},{"type":"review","title":"复盘留痕","description":"复盘处置过程并留痕","assignedRole":"admin","priority":"low","auto":false,"estimatedMinutes":5},{"type":"archive","title":"结案归档","description":"工单结案归档","assignedRole":"admin","priority":"low","auto":true,"estimatedMinutes":2}],"monitorSuggestions":["建议1","建议2","建议3"]}
steps 必须为5-7步，第1步receive，最后1步archive，倒数第2步review。`
      const retryParsed = await callLLMJson({
        messages: [
          { role: 'system', content: '你是亚洲象警情处置专家，只输出符合要求的 JSON 对象，不输出任何多余文字、不加 markdown 代码块。' },
          { role: 'user', content: retryPrompt },
        ],
        temperature: 0.5,
        maxTokens: 1400,
        timeoutMs: 60000,
        validate: (c) => /"steps"\s*:/.test(c),
      })
      if (retryParsed) {
        // 用重试结果继续后续处理
        parsed = retryParsed as any
      }
    }
    if (!parsed) {
      return Response.json({ ai: false, reason: '模型未返回合法 JSON（含二次重试）' })
    }
    const d = parsed.data || {}
    const scenario = String(d.scenario || '').trim() || `${levelLabel}警情·象群处置方案`
    const aiSummary = String(d.aiSummary || '').trim()
    if (!aiSummary) {
      return Response.json({ ai: false, reason: '模型未返回处置总述' })
    }
    const factors: string[] = (Array.isArray(d.factors) ? d.factors : [])
      .map((f: any) => String(f).trim())
      .filter(Boolean)
    const steps: any[] = (Array.isArray(d.steps) ? d.steps : [])
      .map((s: any, i: number) => {
        const rawType = String(s.type || '').trim()
        const type = TYPE_SET.has(rawType) ? rawType : i === 0 ? 'verify' : 'dispatch'
        const validType = TYPE_SET.has(type) ? type : 'dispatch'
        const rawRole = String(s.assignedRole || '').trim()
        // member/drone 等非前端角色枚举 → 归一为 police（由 LLM 指定具体处置方，前端仅渲染四类角色）
        const role = ROLE_SET.has(rawRole) ? rawRole : rawRole === 'center' ? 'center' : rawRole === 'street' ? 'street' : 'police'
        return {
          id: `step-${i + 1}`,
          type: validType,
          title: String(s.title || '').trim() || `处置步骤 ${i + 1}`,
          description: String(s.description || '').trim() || '',
          assignedRole: role,
          priority: PRIORITY_SET.has(String(s.priority || '').trim()) ? String(s.priority).trim() : 'normal',
          auto: !!s.auto,
          estimatedMinutes: Number.isFinite(Number(s.estimatedMinutes)) ? Math.max(1, Number(s.estimatedMinutes)) : 15,
          status: 'pending',
          requireConfirm: !s.auto,
        }
      })
      .filter((s: any) => s.title.length > 0)
      .slice(0, 16)

    // 固定骨架安全网：确保 receive(首)、verify、review(倒2)、archive(末) 始终存在，AI不可省略
    const hasType = (t: string) => steps.some((s: any) => s.type === t)
    const mkStep = (id: string, type: string, title: string, role: string, opts: Partial<{ auto: boolean; est: number; priority: string; desc: string }> = {}) => ({
      id, type, title, assignedRole: role,
      priority: opts.priority || 'normal', auto: !!opts.auto,
      estimatedMinutes: opts.est ?? 15, description: opts.desc || '',
      status: 'pending' as const, requireConfirm: !opts.auto,
    })
    if (!hasType('receive')) steps.unshift(mkStep('step-receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '指挥中心接收警情并建单' }))
    if (!hasType('verify')) {
      const ri = steps.findIndex((s: any) => s.type === 'receive')
      steps.splice(ri + 1, 0, mkStep('step-verify', 'verify', '核实研判', 'center', { est: 10, desc: '核实象群规模、移动方向与威胁等级' }))
    }
    if (!hasType('archive')) steps.push(mkStep('step-archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '工单结案归档', priority: 'low' }))
    if (!hasType('review')) {
      const ai = steps.findIndex((s: any) => s.type === 'archive')
      steps.splice(ai, 0, mkStep('step-review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘处置过程并留痕', priority: 'low' }))
    }
    // 重新编号 id
    steps.forEach((s: any, i: number) => { s.id = `step-${i + 1}` })

    const effectiveSteps: any[] =
      steps.length >= 4
        ? steps
        : defaultFlowByLevel(level).map((f, i) => ({
            id: `step-${i + 1}`,
            type: f.type,
            title: f.title,
            description: '',
            assignedRole: f.role,
            priority: level === 'RED' || level === 'ORANGE' ? 'high' : 'normal',
            auto: false,
            estimatedMinutes: 15,
            status: 'pending',
            requireConfirm: true,
          }))
    if (effectiveSteps.length) effectiveSteps[0] = { ...effectiveSteps[0], status: 'done' }
    if (effectiveSteps.length > 1) effectiveSteps[1] = { ...effectiveSteps[1], status: 'executing' }

    const monitorSuggestions: string[] = (Array.isArray(d.monitorSuggestions) ? d.monitorSuggestions : [])
      .map((s: any) => String(s).trim())
      .filter(Boolean)
      .slice(0, 5)

    // 强制排序：确保上报联动(report)紧接核实研判(verify)之后，绑定死顺序
    const sortedSteps = sortDisposalSteps(effectiveSteps)

    return Response.json({
      ai: true,
      model: parsed.result.model,
      scenario,
      aiSummary,
      factors: factors.length ? factors : [`预警等级：${levelLabel}`, `象群：${total} 头`, `位置：${region}`],
      steps: sortedSteps,
      monitorSuggestions: monitorSuggestions.length
        ? monitorSuggestions
        : [
            '持续跟踪象群位置与移动方向',
            '关注气象变化对驱离作业的影响',
            '每 30 分钟汇总一次处置进度',
          ],
    })
  } catch (e: any) {
    return Response.json({ ai: false, reason: String(e?.message || e) })
  }
}
