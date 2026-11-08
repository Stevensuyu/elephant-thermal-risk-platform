// ───────────────────────────────────────────────────────────────────────────
// 前端模拟 API 路由：拦截 fetch('/api/*') 的统一处理器
// 所有端点返回与原后端一致形状的数据（来自 store/seed），组件无需改动。
// ───────────────────────────────────────────────────────────────────────────
import type { TrainingTask, WarningLevel } from '@/lib/utils/util-app-types'
import {
  getTasks, setTasks, getDrones, setDrones, getPeople, setPeople,
  getAiModels, setAiModels, getDispatchChannels, setDispatchChannels,
  getVideoSources, setVideoSources, getVideoSourceConnectedId, setVideoSourceConnectedId, getDetectionConfig, setDetectionConfig,
  getRealtimeJudgeSettings, setRealtimeJudgeSettings,
  getLiveDetectionMode, setLiveDetectionMode,
  getDisposalWorkflows, setDisposalWorkflows,
  getDisposalConfig, setDisposalConfig,
  getDispatchRecords, setDispatchRecords,
  getLiveStateSim, getLiveStatusSim, setLiveRunning,
} from '@/lib/mock/mock-local-storage'
import { SEED_MODEL_STATUS, FRONTEND_PASSWORD, type MockPerson } from '@/lib/mock/mock-data-seeder'
import { FIXED_PASSWORD } from '@/lib/auth/auth-role-permissions'
import { buildClosureReport } from '@/lib/ai/ai-report-generator'
import { predictRollingRisk } from '@/lib/utils/util-risk-trend-predictor'
import { addLog, queryLogs, verifyLogChain, exportLogsCSV, type LogQuery } from '@/lib/log/log-operation-audit-store'

// 登录失败锁定（5次失败锁定15分钟）
let loginFailedAttempts = 0
let loginLockoutUntil = 0

// ── 真实服务端 AI 端点调用 ──────────────────────────────────────────────
// 经 install.ts 暴露的 window.__nativeFetch 直接请求真实 Next.js 服务端路由，
// 让 AI 相关能力（研判摘要/处置工单/评估报告/自主研判）走真实大模型，
// 禁止在 mock 内伪造「模拟 AI」文案。失败返回 null，由调用方诚实标注。
function callRealAI(path: string, body: unknown, timeoutMs = 180000): Promise<any> {
  const w = typeof window !== 'undefined' ? (window as any) : null
  const nf = w?.__nativeFetch
  if (typeof nf !== 'function') return Promise.resolve(null)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  return nf(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })
    .then(async (r: Response) => {
      let data: any = {}
      try {
        data = await r.json()
      } catch {
        /* ignore */
      }
      return { ok: r.ok, status: r.status, data }
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function parseBody(init?: RequestInit): Record<string, any> {
  const b = init?.body
  if (!b) return {}
  if (typeof b === 'string') {
    try { return JSON.parse(b) } catch { return {} }
  }
  if (typeof FormData !== 'undefined' && b instanceof FormData) {
    const o: Record<string, any> = {}
    b.forEach((v, k) => { o[k] = typeof (v as any)?.name === 'string' && (v as any).size != null ? (v as any).name : v })
    return o
  }
  if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) {
    const o: Record<string, any> = {}
    b.forEach((v, k) => (o[k] = v))
    return o
  }
  return {}
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

// 行政区真实中心坐标表（云南省象群活动主要州市/县/乡镇，近似真实中心，用于缺精确经纬度时的精准兜底）
// 与下方 /api/geocode/reverse 的逆查区间保持一致，保证「坐标 ↔ 行政区」往返自洽。
const ADMIN_CENTERS: Record<string, { lat: number; lng: number }> = {
  // 州市（州府/市政府所在地近似中心）
  '云南省': { lat: 25.0389, lng: 102.7183 }, // 省会昆明，作为仅知省级时的兜底
  '西双版纳傣族自治州': { lat: 22.0010, lng: 100.7975 },
  '普洱市': { lat: 22.7890, lng: 100.9727 },
  '临沧市': { lat: 23.8830, lng: 100.0830 },
  '玉溪市': { lat: 24.3503, lng: 102.5467 },
  '昆明市': { lat: 25.0389, lng: 102.7183 },
  // 县 / 区
  '景洪市': { lat: 22.0010, lng: 100.7975 },
  '勐海县': { lat: 21.9610, lng: 100.4320 },
  '勐腊县': { lat: 21.4910, lng: 101.5620 },
  '思茅区': { lat: 22.7890, lng: 100.9727 },
  '宁洱哈尼族彝族自治县': { lat: 23.0470, lng: 101.0450 },
  '澜沧拉祜族自治县': { lat: 22.5580, lng: 99.9340 },
  '西盟佤族自治县': { lat: 22.6280, lng: 99.4500 },
  '临翔区': { lat: 23.8830, lng: 100.0830 },
  '双江拉祜族佤族布朗族傣族自治县': { lat: 23.4530, lng: 99.8290 },
  '孟连傣族拉祜族佤族自治县': { lat: 22.3310, lng: 99.5770 },
  // 乡镇（更精准）
  '糯扎渡镇': { lat: 22.6170, lng: 100.4300 },
  '勐养镇': { lat: 22.1180, lng: 100.8900 },
  '普文镇': { lat: 22.3120, lng: 101.1200 },
  '象明乡': { lat: 22.0830, lng: 101.2600 },
  '易武镇': { lat: 21.9200, lng: 101.4300 },
  '惠民镇': { lat: 22.0830, lng: 99.9500 },
  '酒井乡': { lat: 22.5200, lng: 99.8700 },
  '谦六彝族乡': { lat: 22.7400, lng: 100.4800 },
}

// 极小确定性抖动（±0.015°），保证同一行政区内的不同警情不重叠，
// 但仍稳定落在该行政区的真实范围内（同 seed 永远得到同一点，非随机散布）。
function adminJitter(seed: string): { dLat: number; dLng: number } {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = ((h >>> 0) % 1000) / 1000
  const v = (((h >>> 10) >>> 0) % 1000) / 1000
  return { dLat: (u - 0.5) * 0.03, dLng: (v - 0.5) * 0.03 }
}

// 缺省坐标兜底：优先取该警情所填最具体的行政区（乡镇→县→市→省）真实中心，
// 保证缺坐标的警情也能精准上图、能被区域查询命中，而非在云南省全境随机散布。
type AdminCtx = { province?: string; city?: string; county?: string; township?: string }
function fallbackPosition(seed: string, admin?: AdminCtx): { lat: number; lng: number } {
  const keys = [admin?.township, admin?.county, admin?.city, admin?.province].filter(Boolean) as string[]
  let center: { lat: number; lng: number } | undefined
  for (const k of keys) {
    if (ADMIN_CENTERS[k]) { center = ADMIN_CENTERS[k]; break }
  }
  if (!center) center = ADMIN_CENTERS['云南省'] // 未知行政区 → 省会中心兜底
  const { dLat, dLng } = adminJitter(seed)
  return { lat: Number((center.lat + dLat).toFixed(4)), lng: Number((center.lng + dLng).toFixed(4)) }
}

// ── SSE 推演流（模拟 GLM-4 增强研判） ──────────────────────────
// 接收 SimulateAlertModal / 实时直播推演 传入的 scenario payload，
// 生成真正引用用户填入数值的感知证据 · 引擎研判 · 逐字推理 · 自我提议。
type SsePayload = {
  name?: string
  region?: string
  detectedClasses?: string
  detectedCount?: number
  maxConfidence?: number
  distanceKm?: number
  farmDistKm?: number
  speedMpm?: number
  direction?: string
  weather?: { tempC?: number; condition?: string; windKmh?: number; rainfallMm?: number }
  computedRiskScore?: number
  computedLevel?: string
  predictionWindow?: string
  ruleSummary?: string
  thermalDeltaT?: number
  terrainSlopeDeg?: number
  distSchoolKm?: number
  adultCount?: number
  calfCount?: number
}

function sseStream(payload: SsePayload | null): Response {
  const enc = new TextEncoder()
  const p = payload || {}
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
  const level = (p.computedLevel || 'ORANGE') as string
  const risk = Math.round(p.computedRiskScore ?? 68)
  const predictedWindow = p.predictionWindow ?? '未来 2 小时内'

  const levelLabel = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
  const closeToVillage = distanceKm < 3
  const immediate = closeToVillage ? '立即组织周边群众避让并部署无人机抵近跟踪' : '加强巡查监测、保持无人机跟踪并预置驱离力量'

  const reasoning =
    `接入${region}无人机热成像画面，确认检出 ${detectedCount} 头亚洲象（成象 ${adult} / 幼象 ${calf}），` +
    `热成像ΔT ${thermalDeltaT}℃。目标距村寨 ${distanceKm} 公里、向${direction}移动，速度约 ${speedMpm} 米/分，` +
    `距农田 ${farmDistKm} 公里；当前地形坡度 ${terrainSlopeDeg}°。\n` +
    `气象为${condition}、气温 ${tempC}℃、风速 ${windKmh} 公里/时${rainfallMm > 0 ? `、降水 ${rainfallMm} 毫米` : ''}，` +
    `距最近学校 ${distSchoolKm} 公里。结合历史活动走廊与移动向量，判定该象群${closeToVillage ? '已逼近人类活动区' : '有向人类活动区逼近趋势'}。\n` +
    `综合空间距离、移动向量、地形与学校距离等权重，输出风险指数 ${risk}，建议启动${levelLabel}预警处置流程：` +
    `${immediate}。`

  const evidenceChain = [
    `感知接入：热成像检出 ${detectedCount} 头亚洲象，ΔT ${thermalDeltaT}℃`,
    `空间分析：距村寨 ${distanceKm}km、向${direction}移动、距农田 ${farmDistKm}km`,
    `时序推演：速度 ${speedMpm} m/min、坡度 ${terrainSlopeDeg}°，历史走廊吻合`,
    `环境约束：${condition}·风 ${windKmh}km/h${rainfallMm > 0 ? `·降水 ${rainfallMm}mm` : ''}·距学校 ${distSchoolKm}km`,
    `决策输出：风险指数 ${risk} → ${levelLabel}预警`,
  ]

  const selfInitiativeActions = [
    `核查距学校 ${distSchoolKm} 公里范围内在校学生避险预案与放学路线`,
    `联动气象站刷新未来 2 小时降水概率，预判驱离作业窗口`,
    `通知最近无人机机队前出抵近侦察，确认幼象位置与移动意图`,
  ]
  const autonomousActions = [
    { action: '生成研判报告并归档', auto: true },
    { action: '推送预警到村委广播与护林员 APP', auto: true },
    { action: '启动无人机自动跟踪航迹', auto: true },
  ]
  const aiSummary =
    `${region}检出 ${detectedCount} 头亚洲象（成 ${adult}/幼 ${calf}），距村寨 ${distanceKm}km 向${direction}移动。` +
    `风险指数 ${risk}（${levelLabel}），建议${immediate}。`

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      send('meta', { model: '规则引擎', configured: false })
      send('notice', { message: '引擎自主研判（未连接大模型）：本路径仅作前端兜底，正常应走服务端真实 AI 研判。' })
      send('stage', {
        step: 'perceive',
        evidence: {
          spatial: `目标距村寨 ${distanceKm}km，朝向${direction}移动，距农田 ${farmDistKm}km`,
          thermal: `热成像ΔT ${thermalDeltaT}℃，检出 ${detectedCount} 头（成 ${adult} / 幼 ${calf}）`,
          tracks: `运动速度 ${speedMpm} m/min，地形坡度 ${terrainSlopeDeg}°`,
          env: `天气 ${condition} ${tempC}℃，风速 ${windKmh}km/h，降水 ${rainfallMm}mm，距学校 ${distSchoolKm}km`,
        },
      })
      send('stage', {
        step: 'engine',
        level,
        risk,
        predictionWindow: predictedWindow,
        telemetry: { distanceKm, speed: speedMpm, heading: direction },
        evidenceChain,
        weights: { spatial: 0.28, vector: 0.24, structure: 0.18, thermal: 0.12, env: 0.1, history: 0.08 },
        recommendedImmediateAction: immediate,
        decisionConfidence: 86 + Math.min(8, Math.round(risk / 20)),
      })
      for (const t of reasoning.match(/./gu) || []) send('llm', { token: t })
      send('result', {
        result: {
          level,
          risk,
          predictionWindow: predictedWindow,
          aiSummary,
          dispatchPlan: closeToVillage ? ['立即疏散人员', '无人机跟踪', '广播驱离'] : ['加强巡查', '保持监测', '预置力量'],
          detectedCount,
          recommendedImmediateAction: immediate,
          decisionConfidence: 86 + Math.min(8, Math.round(risk / 20)),
          evidenceChain,
          selfInitiativeActions,
          autonomousActions,
          reasoning,
        },
      })
      send('done', { ok: true })
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' },
  })
}

// ── 主处理器 ──────────────────────────────────────────────────
export async function mockHandle(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url, 'http://mock.local')
  const path = u.pathname.replace(/\/$/, '')
  const method = (init?.method || 'GET').toUpperCase()
  const q = u.searchParams
  const body = parseBody(init)

  // ── 鉴权（以人员库为准，支持每个账号独立口令）+ 登录失败5次锁定15分钟 ──
  if (path === '/api/auth/login' && method === 'POST') {
    if (loginLockoutUntil > Date.now()) {
      const remain = Math.ceil((loginLockoutUntil - Date.now()) / 60000)
      return json({ ok: false, error: `登录失败次数过多，请 ${remain} 分钟后再试` }, 429)
    }
    const acct = getPeople().find((a) => a.account === (body.username || '').trim())
    if (acct && body.password === (acct.password ?? FRONTEND_PASSWORD)) {
      loginFailedAttempts = 0
      return json({ ok: true, role: acct.role, user: acct.account, name: acct.name })
    }
    loginFailedAttempts++
    if (loginFailedAttempts >= 5) {
      loginLockoutUntil = Date.now() + 15 * 60 * 1000
      loginFailedAttempts = 0
      return json({ ok: false, error: '登录失败次数过多，账号已锁定15分钟' }, 429)
    }
    return json({ ok: false, error: `账号或密码错误（还可尝试 ${5 - loginFailedAttempts} 次）` }, 401)
  }

  // ── 操作日志（加密存储 + 哈希链 + 不可删除） ──
  if (path === '/api/logs' && method === 'POST') {
    const entry = addLog({
      userId: String(body.userId || 'unknown'),
      userName: String(body.userName || '未知'),
      role: String(body.role || 'unknown'),
      action: String(body.action || 'unknown'),
      detail: String(body.detail || ''),
      ip: String(body.ip || '127.0.0.1'),
      result: (body.result === 'failure' ? 'failure' : 'success') as 'success' | 'failure',
    })
    return json({ ok: true, log: entry })
  }
  if (path === '/api/logs' && method === 'GET') {
    const query: LogQuery = {
      userId: q.get('userId') || undefined,
      userName: q.get('userName') || undefined,
      role: q.get('role') || undefined,
      action: q.get('action') || undefined,
      keyword: q.get('keyword') || undefined,
      from: q.get('from') || undefined,
      to: q.get('to') || undefined,
      result: (q.get('result') as 'success' | 'failure') || undefined,
      page: Number(q.get('page') || 1),
      pageSize: Number(q.get('pageSize') || 50),
    }
    return json(queryLogs(query))
  }
  if (path === '/api/logs/export' && method === 'GET') {
    const csv = exportLogsCSV()
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit_logs.csv"' } })
  }
  if (path === '/api/logs/verify' && method === 'GET') {
    return json(verifyLogChain())
  }

  // ── 任务 / 警情 ──
  if (path === '/api/tasks' && method === 'GET') return json(getTasks())
  if (path === '/api/tasks' && method === 'POST') {
    const now = new Date().toISOString()
    const warningLevel = (body.warningLevel as WarningLevel) || 'YELLOW'
    const intrusionRisk = Number(body.intrusionRisk) || 40
    const levelLabel = warningLevel === 'RED' ? '红色' : warningLevel === 'ORANGE' ? '橙色' : warningLevel === 'YELLOW' ? '黄色' : '蓝色'
    // AI 研判结论：优先使用调用方传入（createAutoAlert 已走真实 AI 自动研判），
    // 否则调用真实服务端 /api/ai-analysis/summary 生成；AI 失败时诚实标注，绝不伪造。
    let aiSummary = typeof body.aiSummary === 'string' && body.aiSummary.trim() ? body.aiSummary.trim() : ''
    if (!aiSummary) {
      const ai = await callRealAI('/api/ai-analysis/summary', {
        task: {
          name: body.name, alertType: body.alertType, warningLevel,
          intrusionRisk, detectedCount: Number(body.detectedCount ?? 1),
          province: body.province, county: body.county, township: body.township,
          aiSummary: body.description,
        },
      })
      if (ai?.ok && ai.data?.ai === true && ai.data?.aiSummary) {
        aiSummary = String(ai.data.aiSummary)
      } else {
        const reason = ai?.data?.reason || '大模型调用失败'
        aiSummary = `（AI 研判暂不可用：${reason}）当前由规则引擎判定为${levelLabel}预警，风险指数 ${intrusionRisk}，建议按级别启动处置流程。`
      }
    }
    const task: TrainingTask = {
      id: newId('TASK'),
      name: body.name || '新建研判任务',
      description: body.description || '',
      status: 'RUNNING',
      progress: 12,
      warningLevel,
      intrusionRisk,
      predictionWindow: warningLevel === 'RED' ? '30 分钟内' : warningLevel === 'ORANGE' ? '1 小时内' : '2 小时以上',
      aiSummary,
      dispatchPlan: warningLevel === 'RED' ? ['立即疏散人员', '无人机跟踪', '广播驱离'] : ['加强巡查', '保持监测'],
      detectedCount: 1,
      needsModelConfirm: false,
      stages: [
        { name: '感知接入', progress: 100, status: 'completed' },
        { name: '实时检测', progress: 100, status: 'completed' },
        { name: 'AI 研判', progress: 80, status: 'running' },
        { name: '预警分发', progress: 0, status: 'pending' },
      ],
      createdAt: now,
      updatedAt: now,
      realInference: false,
      classCounts: { elephant: 1 },
      triggeredBy: body.manual ? 'manual' : 'realtime-stream',
      // 新警情默认进入「待人工确认」状态：触发弹窗 → 分配警员 → 确认后才分发/推进
      pendingConfirm: body.pendingConfirm != null ? !!body.pendingConfirm : true,
      alertType: body.alertType,
      province: body.province, city: body.city, county: body.county, township: body.township,
      ...(() => {
        const fb = body.lat != null && body.lng != null
          ? { lat: Number(body.lat), lng: Number(body.lng) }
          : fallbackPosition(body.name || 'task', { province: body.province, city: body.city, county: body.county, township: body.township })
        return { lat: fb.lat, lng: fb.lng }
      })(),
      manual: body.manual === true || body.manual === 'true',
      sourceDevice: body.sourceDevice,
      hasMedia: body.hasMedia === true || body.hasMedia === 'true',
    }
    const list = [task, ...getTasks()]
    setTasks(list)
    return json(task, 201)
  }
  if (path === '/api/tasks' && method === 'DELETE') {
    const ids: string[] = Array.isArray(body.ids) ? body.ids : []
    setTasks(getTasks().filter((t) => !ids.includes(t.id)))
    return json({ ok: true })
  }
  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/)
  if (taskMatch && method === 'GET') {
    const t = getTasks().find((x) => x.id === taskMatch[1])
    return t ? json(t) : json({ error: 'not found' }, 404)
  }
  if (taskMatch && method === 'PATCH') {
    const id = taskMatch[1]
    const list = getTasks()
    const idx = list.findIndex((t) => t.id === id)
    if (idx < 0) return json({ ok: false, error: '警情不存在' }, 404)
    const next = { ...list[idx], ...body, updatedAt: new Date().toISOString() }
    list[idx] = next
    setTasks(list)
    return json({ ok: true, task: next })
  }
  const aggMatch = path.match(/^\/api\/tasks\/([^/]+)\/aggregate$/)
  if (aggMatch && method === 'POST') return json({ ok: true })

  if (path === '/api/alerts' && method === 'GET') return json(getTasks())

  // ── 模型状态 ──
  if (path === '/api/model-status' && method === 'GET') return json(SEED_MODEL_STATUS)

  // ── 无人机 ──
  if (path === '/api/drones' && method === 'GET') return json({ drones: getDrones() })
  if (path === '/api/drones' && method === 'POST') {
    const d: any = { ...body, id: newId('UAV'), connection: 'connected', updatedAt: new Date().toISOString() }
    setDrones([...getDrones(), d])
    return json({ ok: true, drone: d }, 201)
  }
  // 批量删除（前端 registry 发 DELETE /api/drones，body 含 ids / id）。
  // 此前缺此分支 → 删除请求落到兜底、mock 仓库未真正删除 → useDroneFleet 每 5s
  // 轮询把全量种子写回前端镜像，已删无人机复活。此处真正落库并返回最新列表。
  if (path === '/api/drones' && method === 'DELETE') {
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : []
    if (ids.length) setDrones(getDrones().filter((d) => !ids.includes(d.id)))
    return json({ ok: true, drones: getDrones() })
  }
  const droneMatch = path.match(/^\/api\/drones\/([^/]+)$/)
  if (droneMatch && method === 'PUT') {
    const id = droneMatch[1]
    setDrones(getDrones().map((d) => (d.id === id ? { ...d, ...body } : d)))
    return json({ ok: true })
  }
  if (droneMatch && method === 'DELETE') {
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [droneMatch[1]]
    setDrones(getDrones().filter((d) => !ids.includes(d.id)))
    return json({ ok: true })
  }

  // ── 人员管理（可增删改，账号/密码/角色均可维护） ──
  if (path === '/api/people' && method === 'GET') return json(getPeople())
  if (path === '/api/people' && method === 'POST') {
    const now = new Date().toISOString()
    const account = (body.account || body.name || `user${Date.now() % 10000}`).trim()
    if (!account) return json({ ok: false, error: '账号不能为空' }, 400)
    if (getPeople().some((p) => p.account === account)) {
      return json({ ok: false, error: '账号已存在' }, 400)
    }
    const p: MockPerson = {
      id: newId('P'),
      name: body.name || '新人员',
      account,
      role: (body.role as MockPerson['role']) || 'police',
      region: body.region || '全县',
      phone: body.phone,
      password: body.password || FIXED_PASSWORD,
      createdAt: now,
      updatedAt: now,
    }
    setPeople([...getPeople(), p])
    return json(p, 201)
  }
  const peopleMatch = path.match(/^\/api\/people\/([^/]+)$/)
  if (peopleMatch && method === 'PUT') {
    const id = peopleMatch[1]
    const list = getPeople()
    const cur = list.find((p) => p.id === id)
    if (!cur) return json({ ok: false, error: '人员不存在' }, 404)
    const account = (body.account ?? cur.account).trim()
    if (account !== cur.account && list.some((p) => p.account === account)) {
      return json({ ok: false, error: '账号已存在' }, 400)
    }
    const next: MockPerson = {
      ...cur,
      ...body,
      account,
      // 口令为空时保留原口令（避免编辑其它字段误清空密码）
      password: body.password ? String(body.password) : cur.password,
      updatedAt: new Date().toISOString(),
    }
    setPeople(list.map((p) => (p.id === id ? next : p)))
    return json({ ok: true })
  }
  if (peopleMatch && method === 'DELETE') {
    const list = getPeople()
    if (list.length <= 1) return json({ ok: false, error: '至少保留一个账号' }, 400)
    setPeople(list.filter((p) => p.id !== peopleMatch[1]))
    return json({ ok: true })
  }
  if (path === '/api/admin/accounts' && method === 'GET') {
    return json(getPeople().map((p) => ({ ...p, username: p.account })))
  }

  // ── 直播（模拟） ──
  if (path === '/api/live-source' && method === 'GET') return json({ state: getLiveStateSim(), status: getLiveStatusSim() })
  if (path === '/api/live-source' && method === 'POST') {
    const action = body?.action
    if (action === 'stop') {
      setLiveRunning(false)
      return json({ success: true, running: false, state: null, status: getLiveStatusSim() })
    }
    // start（默认）
    setLiveRunning(true)
    return json({ success: true, running: true, state: getLiveStateSim(), status: getLiveStatusSim() })
  }
  // 直播检测：默认 'off' —— 未接入任何视频源，诚实返回「无检测」，绝不伪造真实检出。
  // 仅当用户主动开启 'demo'（推演演示）才返回模拟检测结果，且全程标注「推演演示，非真实视频」。
  if (path === '/api/live-detection' && method === 'GET') {
    const mode = getLiveDetectionMode()
    if (mode === 'demo') {
      // 结构化多目标 YOLO 检测结果（bbox_norm 为归一化 [x1,y1,x2,y2]，便于前端直接换算像素框）
      const detections = [
        { track_id: 1, class_name: 'elephant', score: 0.984, bbox_norm: [0.12, 0.1, 0.34, 0.42] },
        { track_id: 2, class_name: 'elephant', score: 0.951, bbox_norm: [0.46, 0.18, 0.3, 0.4] },
        { track_id: 3, class_name: 'elephant', score: 0.92, bbox_norm: [0.62, 0.52, 0.28, 0.38] },
      ]
      const maxConf = Math.max(...detections.map((d: any) => d.score))
      return json({
        connected: true,
        mode: 'demo',
        running: true,
        source: 'demo',
        detected: true,
        class_name: 'elephant',
        confidence: maxConf,
        max_confidence: maxConf,
        count: detections.length,
        detected_count: detections.length,
        bbox: detections[0].bbox_norm,
        detections,
        continuous_frames: 27,
        frame: Math.floor(Date.now() / 1000) % 100000,
        timestamp: new Date().toISOString(),
        note: '推演演示（非真实视频源，仅用于流程演示，请勿当作真实警情）',
      })
    }
    return json({
      connected: false,
      mode: 'off',
      running: false,
      detected: false,
      note: '未接入真实视频流',
    })
  }
  if (path === '/api/live-detection' && method === 'POST') {
    const next: 'off' | 'demo' = body?.mode === 'demo' ? 'demo' : 'off'
    setLiveDetectionMode(next)
    return json({ ok: true, mode: next, connected: next === 'demo' })
  }
  if (path === '/api/live-feed' && method === 'GET') {
    const bytes = Uint8Array.from(atob(PNG_1PX), (c) => c.charCodeAt(0))
    return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  }

  // ── AI 模型 / 推演 ──
  // 厂商模板（供 AI 配置中心「一键填入」）
  const AI_TEMPLATES = [
    { provider: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'minimax/minimax-m3:free', hint: 'OpenRouter 聚合平台，免费模型 minimax/minimax-m3:free' },
    { provider: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: '智谱 GLM-4 系列，OpenAI 兼容' },
    { provider: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '深度求索 DeepSeek-V3/R1' },
    { provider: 'Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '月之暗面 Kimi 长上下文' },
    { provider: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max', hint: '阿里云通义千问' },
    { provider: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: 'OpenAI 官方兼容端点' },
  ]
  // 归一化模型形状：兼容旧种子（vendor/enabled/endpoint）与新写入（provider/active/baseURL）
  const normModel = (m: any) => ({
    id: m.id || newId('MDL'),
    name: m.name || m.model || '未命名模型',
    provider: m.provider || m.vendor || '自定义',
    baseURL: m.baseURL || m.endpoint || '',
    model: m.model || '',
    apiKey: m.apiKey ?? '',
    active: m.active ?? m.enabled ?? false,
    createdAt: m.createdAt || new Date().toISOString(),
  })
  if (path === '/api/ai-models' && method === 'GET') {
    return json({ models: getAiModels().map(normModel), templates: AI_TEMPLATES })
  }
  if (path === '/api/ai-models' && method === 'POST') {
    const list = getAiModels().map(normModel)
    const nm = normModel({ ...body, id: newId('MDL') })
    // 同一时刻仅启用一个模型：启用新模型时其余自动停用
    const next = (body.active ? list.map((x) => ({ ...x, active: false })) : list)
    next.push(nm)
    setAiModels(next)
    return json({ success: true, model: nm })
  }
  if (path === '/api/ai-models' && method === 'PATCH') {
    const list = getAiModels().map(normModel)
    const idx = list.findIndex((m: any) => m.id === body.id)
    if (idx < 0) return json({ success: false, error: '模型不存在' }, 404)
    const updated = normModel({ ...list[idx], ...body, id: body.id })
    let next = list.map((m) => (m.id === body.id ? updated : m))
    if (body.active) next = next.map((m) => (m.id === body.id ? m : { ...m, active: false }))
    setAiModels(next)
    return json({ success: true, model: updated })
  }
  if (path === '/api/ai-models' && method === 'DELETE') {
    const id = q.get('id') || body.id
    setAiModels(getAiModels().filter((m: any) => m.id !== id))
    return json({ success: true })
  }
  if (path === '/api/ai-models/test' && method === 'POST') {
    // 连接测试已由服务端真实路由 /api/ai-models/test 处理（install.ts 已放行到真实服务）。
    // 若本处被直接调用（未安装 mock 放行的环境），不再伪造「模拟握手成功」，明确告知必须走真实服务端。
    return json({ ok: false, error: '连接测试必须在服务端进行（/api/ai-models/test 已放行真实鉴权握手）；当前未执行真实连接，不伪造连通结果。' })
  }
  if (path === '/api/ai-analysis/stream' && method === 'POST') {
    // 该端点已在 install.ts 白名单放行到真实服务端路由（真实 LLM 流式研判）。
    // 若在未安装 mock 放行的环境下被本处拦截，则透传到真实服务端，绝不伪造模拟 AI 内容。
    const w0 = typeof window !== 'undefined' ? (window as any) : null
    const nf0 = w0?.__nativeFetch
    if (typeof nf0 === 'function') {
      return nf0('/api/ai-analysis/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
        .catch(() => new Response(JSON.stringify({ error: 'AI 流式服务不可用' }), { status: 502, headers: { 'Content-Type': 'application/json' } }))
    }
    return json({ error: '真实 AI 流式研判必须在服务端进行（/api/ai-analysis/stream 已放行真实 LLM）；当前未执行，不伪造模拟 AI 内容。' }, 502)
  }
  // 自主研判：转发到真实服务端 /api/ai-analysis/auto-judge（真实 LLM 生成研判结论）。
  // 仅在真实 AI 不可用时，返回明确标注 ai:false 的规则引擎结果，绝不冒充 AI。
  if (path === '/api/ai-auto-judge' && method === 'POST') {
    const ai = await callRealAI('/api/ai-analysis/auto-judge', body)
    if (ai?.ok && ai.data?.ai === true && ai.data?.analysis) {
      return json({ ...ai.data, ok: true, ai: true })
    }
    const count = Math.max(1, Number(body.detectedCount ?? body.count ?? 1))
    const rawConf = Number(body.confidence ?? 80)
    const conf = rawConf > 1 ? rawConf / 100 : rawConf
    const distanceKm = Number(body.distanceKm ?? 2)
    const risk = Math.round(Math.min(99, Math.max(35, conf * 70 + Math.min(count, 10) * 3 + (distanceKm < 2 ? 10 : 0))))
    let level: WarningLevel = 'BLUE'
    if (risk >= 85 || count >= 6) level = 'RED'
    else if (risk >= 65 || count >= 3) level = 'ORANGE'
    else if (risk >= 45) level = 'YELLOW'
    const label = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
    return json({
      ok: true,
      ai: false,
      reason: ai?.data?.reason || '真实 AI 服务不可用',
      analysis: {
        level,
        risk,
        detectedCount: count,
        confidence: Number((conf * 100).toFixed(0)),
        distanceKm,
        aiSummary: `（AI 研判暂不可用：${ai?.data?.reason || '大模型调用失败'}）当前由规则引擎研判为${label}预警，风险指数 ${risk}，建议按级别启动处置流程。`,
        evidence: { detectedCount: count, confidence: Number(conf.toFixed(2)), distanceKm },
        weights: { confidence: 0.7, count: 0.18, proximity: 0.12 },
      },
    })
  }

  // ── 处置 / 调度（端到端模拟，真实落库，驱动面板流程阶段推导） ──
  // 六类使用终端（与 AlarmLinkagePanel TERMINAL_ICONS 一一对应）
  const DISPATCH_TERMINALS: { id: string; via: string; label: string }[] = [
    { id: 'Police_Gis_Dashboard', via: 'SSE 站内广播', label: '公安 GIS 态势大屏' },
    { id: 'Command_Dashboard', via: 'SSE 站内广播', label: '指挥中心大屏' },
    { id: 'Ranger_App_FCM', via: 'HTTP Webhook', label: '护林员 APP 推送' },
    { id: 'Village_GPIO_Broadcaster', via: 'HTTP 桥(MQTT)', label: '村广播高音号' },
    { id: 'UAV_Autopilot_Gateway', via: 'UDP / MAVLink', label: '无人机自动航线网关' },
    { id: 'SMS_Gateway', via: 'HTTP Webhook', label: '应急短信网关' },
  ]
  // 各预警级别实际下发的终端：体现「按实际情况优化分发」，非全通道盲发
  function planDispatch(level: string): Record<string, 'sent' | 'skipped'> {
    const plan: Record<string, 'sent' | 'skipped'> = {
      Police_Gis_Dashboard: 'sent',
      Command_Dashboard: 'sent',
      Ranger_App_FCM: 'sent',
      Village_GPIO_Broadcaster: 'skipped',
      UAV_Autopilot_Gateway: 'skipped',
      SMS_Gateway: 'sent',
    }
    if (level === 'RED' || level === 'ORANGE') {
      plan.Village_GPIO_Broadcaster = 'sent'
      plan.UAV_Autopilot_Gateway = 'sent'
    }
    if (level === 'BLUE') {
      plan.Ranger_App_FCM = 'skipped'
      plan.Village_GPIO_Broadcaster = 'skipped'
      plan.UAV_Autopilot_Gateway = 'skipped'
    }
    return plan
  }
  function buildDispatchRecords(task: TrainingTask): any[] {
    const level = task.warningLevel || 'BLUE'
    const plan = planDispatch(level)
    const now = new Date().toISOString()
    const stamp = now.slice(0, 10).replace(/-/g, '')
    return DISPATCH_TERMINALS.map((t, i) => {
      const st = plan[t.id]
      return {
        dispatchId: `DSP-${stamp}-${String(i + 1).padStart(2, '0')}`,
        taskId: task.id,
        taskName: task.name,
        level,
        risk: task.intrusionRisk ?? 0,
        target: t.id,
        targetLabel: t.label,
        protocol: t.via,
        kind: 'terminal',
        description: st === 'sent' ? `${t.label}：已送达` : `${t.label}：未达预警级别，暂不分发`,
        status: st,
        statusCode: st === 'sent' ? 200 : undefined,
        attempts: st === 'sent' ? 1 : 0,
        ts: now,
      }
    })
  }
  // ─────────────────────────────────────────────────────────────────────────
  // 动态处置流程：不再返回固定剧本，而是按「警情类型 + 风险等级 + 象群规模/构成 +
  // 昼夜时段 + 事发位置」五维动态组合差异化步骤，并生成 AI 监控初始建议。
  // ─────────────────────────────────────────────────────────────────────────
  function buildDisposalWorkflow(task: TrainingTask, officer?: string): any {
    const level: string = task.warningLevel || 'YELLOW'
    const alertType: string = task.alertType || '象群入侵'
    const region: string = task.township || task.county || '事发区域'
    const now = new Date().toISOString()
    const high = level === 'RED'
    // 象群构成
    const total = task.detectedCount || 0
    const adult = task.sensor?.adultCount ?? (total > 0 ? total : 5)
    const calf = task.sensor?.calfCount ?? 0
    const soloMale = total === 1 // 独象：攻击性强
    const hasCalf = calf > 0 // 带幼象：敏感易受惊
    const bigHerd = total >= 6 // 大群：多点行动
    // 昼夜
    const hour = task.createdAt ? new Date(task.createdAt).getHours() : new Date().getHours()
    const isNight = hour >= 20 || hour < 6
    // 位置
    const place = `${task.province || ''}${task.county || ''}${task.township || ''}`
    const nearWater = /水|河|江|湖|塘|库|溪|泉/.test(place)
    const nearBorder = /边境|口岸|界桩|勐|打洛|磨憨|瑞丽|畹町|孟连|沧源|西盟/.test(place)
    const nearVillage = /村|寨|庄/.test(place) || ((task as any).distanceKm != null && (task as any).distanceKm < 3)
    // 步骤工厂：补齐 DisposalStep 全字段（assignedRole/estimatedMinutes/priority/auto/requireConfirm/description/aiReasoning）
    const S = (
      id: string, type: string, title: string, assignedRole: string,
      opts: Partial<{ priority: 'high' | 'normal' | 'low'; auto: boolean; requireConfirm: boolean; est: number; desc: string; reason: string }> = {},
    ) => ({
      id, type, title, assignedRole,
      priority: opts.priority || 'normal',
      auto: opts.auto || false,
      requireConfirm: opts.requireConfirm !== undefined ? opts.requireConfirm : !opts.auto,
      estimatedMinutes: opts.est ?? 15,
      description: opts.desc || '',
      aiReasoning: opts.reason || '',
      status: 'pending' as const,
    })
    const playbooks: Record<string, { scenario: string; steps: any[] }> = {
      象群入侵: {
        scenario: `象群向人类活动区移动，存在人象冲突与农作物受损风险（${region}）`,
        steps: [
          S('receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '指挥中心接收警情并建单', reason: '系统自动建单' }),
          S('monitor', 'monitor', '监测锁定', 'center', { auto: true, est: 5, desc: '多源视频/无人机锁定象群位置与数量', reason: '热成像+可见光持续跟踪' }),
          S('verify', 'verify', '核实研判', 'center', { est: 10, desc: '核实象群规模、移动方向与威胁等级', reason: '结合地形与历史走廊确认风险' }),
          S('broadcast', 'broadcast', '预警广播', 'center', { est: 5, desc: '向村委广播与护林员APP推送预警', reason: '橙色以上强制广播' }),
          S('dispatch', 'dispatch', '人员调度', 'street', { est: 10, desc: `调度${region}内警员与街道干部赶赴现场`, reason: '按事发区域就近调度' }),
          S('uav', 'uav', '无人机抵近跟踪', 'center', { est: 8, desc: '无人机抵近跟踪并回传实时画面', reason: '提供空中态势感知' }),
          S('deter', 'deter', '科学驱离', 'police', { priority: high ? 'high' : 'normal', est: 20, desc: '采用非杀伤方式（声光/驱赶）科学驱离象群', reason: '避免人象正面冲突' }),
          S('blockade', 'blockade', '封锁警戒', 'police', { est: 10, desc: '封锁危险路段与核心区，设置警戒', reason: '防止群众误入' }),
          S('evacuate', 'evacuate', '群众疏散', 'street', { priority: high ? 'high' : 'normal', est: 15, desc: '组织危险区域群众有序避让', reason: '优先保障人身安全' }),
          S('report', 'report', '上报联动', 'street', { est: 8, desc: '上报林业/公安并联动周边乡镇', reason: '跨层级协同' }),
          S('review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘处置过程并留痕', reason: '积累处置经验' }),
          S('archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '工单结案归档', reason: '系统自动归档' }),
        ],
      },
      人象冲突: {
        scenario: `已发生人象近距离遭遇，需立即现场处置与医疗救援（${region}）`,
        steps: [
          S('receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '接收冲突警情并建单', reason: '系统自动建单' }),
          S('monitor', 'monitor', '监测锁定', 'center', { auto: true, est: 5, desc: '锁定冲突位置与象群分布', reason: '实时回传态势' }),
          S('verify', 'verify', '核实研判', 'center', { est: 8, desc: '核实是否有人员伤亡与象群动向', reason: '优先确认人身安全' }),
          S('rescue', 'rescue', '医疗救援', 'police', { priority: 'high', est: 12, desc: '对受伤人员实施急救与送医', reason: '人象冲突易致伤' }),
          S('broadcast', 'broadcast', '预警广播', 'center', { est: 5, desc: '广播提醒周边群众避让', reason: '防止群众聚集围观' }),
          S('blockade', 'blockade', '封锁警戒', 'police', { priority: 'high', est: 10, desc: '封锁冲突区域，设置安全隔离', reason: '避免二次冲突' }),
          S('deter', 'deter', '科学驱离', 'police', { priority: 'high', est: 20, desc: '由专业力量科学驱离象群', reason: '降低再冲突概率' }),
          S('dispatch', 'dispatch', '人员调度', 'street', { est: 10, desc: `调度${region}警员与干部支援`, reason: '就近增援' }),
          S('report', 'report', '上报联动', 'street', { est: 8, desc: '上报伤情与处置进展', reason: '跨部门协同' }),
          S('review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘冲突处置并留痕', reason: '经验沉淀' }),
          S('archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '结案归档', reason: '系统自动归档' }),
        ],
      },
      农作物损毁: {
        scenario: `象群进入农田取食，需驱离并登记损失（${region}）`,
        steps: [
          S('receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '接收农作物受损警情', reason: '系统自动建单' }),
          S('monitor', 'monitor', '监测锁定', 'center', { auto: true, est: 5, desc: '确认象群位置与取食范围', reason: '无人机/视频锁定' }),
          S('verify', 'verify', '核实研判', 'center', { est: 8, desc: '核实受损面积与象群数量', reason: '评估损失等级' }),
          S('deter', 'deter', '科学驱离', 'police', { priority: 'high', est: 20, desc: '非杀伤方式驱离象群离开农田', reason: '降低损失与冲突' }),
          S('broadcast', 'broadcast', '预警广播', 'center', { est: 5, desc: '提醒农户暂离田间', reason: '保障农户安全' }),
          S('logistics', 'logistics', '损失登记与后勤', 'street', { est: 15, desc: '登记受损作物并协调保险/补偿', reason: '民生保障' }),
          S('dispatch', 'dispatch', '人员调度', 'street', { est: 10, desc: `调度${region}干部到场处置`, reason: '就近处置' }),
          S('report', 'report', '上报联动', 'street', { est: 8, desc: '上报农业与林业部门', reason: '跨部门协同' }),
          S('review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘处置并留痕', reason: '经验沉淀' }),
          S('archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '结案归档', reason: '系统自动归档' }),
        ],
      },
      闯入村庄: {
        scenario: `象群闯入村庄核心区，直接威胁居民安全（${region}）`,
        steps: [
          S('receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '接收闯村警情并建单', reason: '系统自动建单' }),
          S('monitor', 'monitor', '监测锁定', 'center', { auto: true, est: 5, desc: '锁定象群在村内的精确位置', reason: '实时回传' }),
          S('verify', 'verify', '核实研判', 'center', { est: 8, desc: '核实居民分布与象群动向', reason: '确认安全威胁' }),
          S('evacuate', 'evacuate', '群众疏散', 'street', { priority: 'high', est: 15, desc: '组织村民有序撤离至安全点', reason: '最高优先级保障人身安全' }),
          S('rescue', 'rescue', '医疗救援', 'police', { priority: 'high', est: 12, desc: '医疗力量待命并处置伤员', reason: '以防突发伤情' }),
          S('broadcast', 'broadcast', '预警广播', 'center', { est: 5, desc: '村内广播高频预警', reason: '强制疏散提醒' }),
          S('blockade', 'blockade', '封锁警戒', 'police', { priority: 'high', est: 10, desc: '封锁村口与危险院落', reason: '防止误入' }),
          S('uav', 'uav', '无人机侦察', 'center', { est: 8, desc: '无人机村内低空侦察引导', reason: '提供室内外衔接态势' }),
          S('deter', 'deter', '科学驱离', 'police', { priority: 'high', est: 20, desc: '将象群引出村庄并驱离', reason: '恢复村落安全' }),
          S('dispatch', 'dispatch', '人员调度', 'street', { est: 10, desc: `调度${region}全部可用力量`, reason: '集中处置' }),
          S('report', 'report', '上报联动', 'street', { est: 8, desc: '上报并联动周边村镇', reason: '跨域协同' }),
          S('review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘处置并留痕', reason: '经验沉淀' }),
          S('archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '结案归档', reason: '系统自动归档' }),
        ],
      },
      道路预警: {
        scenario: `象群横穿公路，威胁交通安全（${region}）`,
        steps: [
          S('receive', 'receive', '接警受理', 'center', { auto: true, est: 2, desc: '接收道路预警并建单', reason: '系统自动建单' }),
          S('monitor', 'monitor', '监测锁定', 'center', { auto: true, est: 5, desc: '确认象群与道路交叉点', reason: '视频/无人机锁定' }),
          S('verify', 'verify', '核实研判', 'center', { est: 8, desc: '核实车流与象群穿越时机', reason: '评估通行风险' }),
          S('traffic', 'traffic', '交通管制', 'police', { priority: 'high', est: 10, desc: '对相关路段实施临时管制', reason: '防止人车象混行' }),
          S('blockade', 'blockade', '封锁警戒', 'police', { est: 10, desc: '设置警示与物理隔离', reason: '引导绕行' }),
          S('broadcast', 'broadcast', '预警广播', 'center', { est: 5, desc: '广播与导航提示绕行', reason: '信息发布' }),
          S('uav', 'uav', '无人机航路巡查', 'center', { est: 8, desc: '无人机巡航监控象群穿越进度', reason: '空中态势' }),
          S('deter', 'deter', '科学驱离', 'police', { est: 20, desc: '加速象群完成穿越并离开路面', reason: '尽快恢复通行' }),
          S('dispatch', 'dispatch', '人员调度', 'street', { est: 10, desc: `调度${region}交警与干部`, reason: '现场管控' }),
          S('report', 'report', '上报联动', 'street', { est: 8, desc: '上报交通与林业部门', reason: '跨部门协同' }),
          S('review', 'review', '复盘留痕', 'admin', { est: 5, desc: '复盘处置并留痕', reason: '经验沉淀' }),
          S('archive', 'archive', '结案归档', 'admin', { auto: true, est: 2, desc: '结案归档', reason: '系统自动归档' }),
        ],
      },
    }
    const pb = playbooks[alertType] || playbooks['象群入侵']
    let steps = pb.steps.map((s: any, i: number) => ({
      ...s,
      status: i === 0 ? 'done' : i === 1 ? 'executing' : 'pending',
    }))
    const factors: string[] = []
    const levelLabel = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'
    const insertAfter = (anchorId: string, step: any) => {
      const idx = steps.findIndex((s) => s.id === anchorId)
      if (idx >= 0) steps.splice(idx + 1, 0, step)
      else steps.push(step)
    }
    const insertBefore = (anchorId: string, step: any) => {
      const idx = steps.findIndex((s) => s.id === anchorId)
      if (idx >= 0) steps.splice(idx, 0, step)
      else steps.push(step)
    }

    // ── ① 风险等级：决定响应强度与优先级 ──
    if (level === 'RED') {
      factors.push('红色预警：全要素紧急响应（无人机+公安+林草+消防多部门联合）')
      for (const t of ['blockade', 'evacuate', 'rescue', 'deter', 'dispatch', 'verify']) {
        const s = steps.find((x) => x.type === t)
        if (s) s.priority = 'high'
      }
      if (!steps.some((s) => s.type === 'rescue')) {
        insertBefore('deter', S('red_rescue', 'rescue', '医疗力量待命', 'police', { priority: 'high', est: 8, desc: '组织急救力量与车辆在最近点位待命', reason: '红色预警需医疗兜底' }))
      }
    } else if (level === 'ORANGE') {
      factors.push('橙色预警：重点响应')
      for (const t of ['blockade', 'evacuate', 'deter']) {
        const s = steps.find((x) => x.type === t)
        if (s) s.priority = 'high'
      }
    } else if (level === 'BLUE') {
      factors.push('蓝色预警：关注监测（最小化响应）')
      // 蓝色仅保留观察/核实/上报/归档，不铺开处置力量
      const keep = ['receive', 'monitor', 'verify', 'report', 'archive']
      steps = steps.filter((s) => keep.includes(s.type))
      // 蓝色下默认跳过广播、封锁、疏散等重动作（避免过度响应）
    } else {
      factors.push('黄色预警：常规响应')
    }

    // ── ② 象群规模 / 构成：决定盯防策略 ──
    if (soloMale) {
      factors.push('独象（攻击性强）：专人盯防 + 优先避险')
      insertAfter('monitor', S('solo_guard', 'monitor', '独象专人盯防', 'police', { priority: 'high', est: 15, desc: `对${region}独象设专人连续盯防，实时掌握其位置与情绪`, reason: '独象攻击性强，需专人盯防' }))
    } else if (hasCalf) {
      factors.push('带幼象群（敏感易受惊）：避免刺激 + 耐心引导')
      const deter = steps.find((s) => s.type === 'deter')
      if (deter) {
        deter.description = '采用低刺激方式耐心引导带幼象群缓慢离开，严禁大声驱赶、烟火惊扰'
        deter.priority = 'high'
      }
      insertBefore('deter', S('calf_guide', 'deter', '耐心引导避让', 'police', { priority: 'high', est: 25, desc: '以食物诱引+声光缓驱引导带幼象群离开人类活动区', reason: '带幼象群易受惊，需避免刺激' }))
    } else if (bigHerd) {
      factors.push(`大群（${total} 头，多点行动）：多点布防 + 包围驱离`)
      insertAfter('dispatch', S('herd_multi', 'blockade', '多点布防', 'police', { priority: high ? 'high' : 'normal', est: 15, desc: `在${region}象群可能扩散方向设置多点布防与预警点`, reason: '大群行动路径分散，需多点布防' }))
      insertBefore('deter', S('herd_encircle', 'deter', '包围式驱离', 'police', { priority: high ? 'high' : 'normal', est: 25, desc: '多方位协同包围，将大群整体驱离出人类活动区', reason: '大群需整体协同驱离，防个体分散' }))
    }

    // ── ③ 昼夜：决定感知与预警手段 ──
    if (isNight) {
      factors.push('夜间作业：灯光预警 + 无人机热成像跟踪')
      insertAfter('broadcast', S('night_light', 'broadcast', '灯光预警', 'street', { priority: high ? 'high' : 'normal', est: 5, desc: '启动村寨灯光预警，提醒夜间出行村民避让', reason: '夜间视线差，需灯光预警' }))
      const uav = steps.find((s) => s.type === 'uav')
      if (uav) uav.description = `${uav.description}（夜间启用热成像挂载）`
    } else {
      factors.push('白天作业：可见光巡查为主')
      const uav = steps.find((s) => s.type === 'uav')
      if (uav) uav.description = `${uav.description}（白天可见光巡查）`
    }

    // ── ④ 位置：决定重点布防方向 ──
    if (nearWater) {
      factors.push('临近水源地：重点值守')
      insertAfter('dispatch', S('water_guard', 'monitor', '水源地重点值守', 'street', { est: 20, desc: `对象群常驻水源地（${task.township || task.county || '附近'}）设置值守点，观察取水时段并预警`, reason: '水源地人象交集概率高，需值守' }))
    }
    if (nearBorder) {
      factors.push('边境方向：边防联合 + 跨境联防')
      insertBefore('report', S('border_joint', 'report', '边防联合防控', 'police', { est: 12, desc: '联动边防检查站开展跨境联防，共享象群跨境动态', reason: '靠近边境，需跨境协同' }))
    }
    if (nearVillage) {
      factors.push('邻近村寨：疏散优先')
      const ev = steps.find((s) => s.type === 'evacuate')
      if (ev) ev.priority = 'high'
      if (!steps.some((s) => s.type === 'evacuate')) {
        insertAfter('verify', S('village_evac', 'evacuate', '群众疏散', 'street', { priority: 'high', est: 15, desc: '组织邻近村寨群众有序避让', reason: '临近村寨，疏散优先' }))
      }
    }

    // 去重（同一 id 只保留一个）
    const seen = new Set<string>()
    steps = steps.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))

    // 动态 AI 总述：把五维因素都写进文案
    const herdDesc = soloMale ? '1 头独象' : hasCalf ? `${total || adult} 头（含幼象）` : bigHerd ? `${total} 头大群` : `${total || adult} 头`
    const timeDesc = isNight ? '夜间' : '白天'
    const aiSummary =
      `研判为${levelLabel}预警：${region}检测到${herdDesc}亚洲象活动（${timeDesc}作业）。` +
      `关键因素——${factors.join('；')}。` +
      `建议按以下差异化流程处置，重点保障人身安全、科学驱离、跨部门联动。`
    const scenario = `${pb.scenario}${factors.length ? ` · ${factors.join(' · ')}` : ''}`

    // AI 监控：初始动态建议（随处置进展由 /api/disposal/ai-monitor 持续刷新）
    const aiMonitor = {
      enabled: true,
      updatedAt: now,
      factors,
      suggestions: buildMonitorSuggestions(task, steps, { isNight, nearWater, nearBorder, nearVillage }),
    }

    return {
      taskId: task.id,
      level,
      scenario,
      aiSummary,
      generatedBy: 'rule',
      generatedAt: now,
      updatedAt: now,
      requireConfirm: true,
      advanced: false,
      officer: officer || '待分配',
      recipients: [],
      steps,
      factors,
      aiMonitor,
    }
  }
  // AI 监控：根据当前警情参数 + 步骤状态，生成下一步动态建议（规则驱动 + AI 措辞）
  function buildMonitorSuggestions(
    task: TrainingTask,
    steps: any[],
    ctx: { isNight: boolean; nearWater: boolean; nearBorder: boolean; nearVillage: boolean },
  ): any[] {
    const pending = steps.find((s) => s.status === 'pending')
    const executing = steps.find((s) => s.status === 'executing')
    const doneCount = steps.filter((s) => s.status === 'done').length
    const total = steps.length
    const region = task.township || task.county || '事发区域'
    const suggestions: any[] = []
    if (pending) {
      suggestions.push({ type: 'next', text: `下一步：执行「${pending.title}」——${pending.description || pending.aiReasoning || ''}` })
    }
    if (executing) {
      suggestions.push({ type: 'watch', text: `正在推进「${executing.title}」，建议保持 ${executing.estimatedMinutes || 15} 分钟内完成并回传结果` })
    }
    if (ctx.isNight) {
      suggestions.push({ type: 'risk', text: '当前为夜间作业，视线受限，请确保无人机热成像挂载开启并启用灯光预警' })
    }
    if (ctx.nearBorder) {
      suggestions.push({ type: 'risk', text: '临近边境，务必联动边防检查站共享跨境动态，防止象群出境引发涉外事件' })
    }
    if (ctx.nearVillage) {
      suggestions.push({ type: 'risk', text: '邻近村寨，疏散与警戒同步进行，优先保障群众人身安全' })
    }
    if (doneCount >= Math.max(1, total - 2)) {
      suggestions.push({ type: 'finish', text: '主要处置步骤基本完成，建议尽快完成复盘留痕并进入结案归档' })
    }
    return suggestions
  }
  // AI 监控实时评估：根据工单当前状态计算「动态建议 + 超时提醒 + 结案评估报告」
  function buildAiMonitor(task: TrainingTask, wf: any): any {
    const nowTs = Date.now()
    const steps: any[] = wf.steps || []
    const suggestions: any[] = []
    const warnings: any[] = []
    // 超时检测：执行中步骤超过预计时长
    for (const s of steps) {
      if (s.status === 'executing' && s.startedAt) {
        const elapsedMin = (nowTs - new Date(s.startedAt).getTime()) / 60000
        const est = s.estimatedMinutes || 15
        if (elapsedMin > est) {
          warnings.push({
            stepId: s.id,
            step: s.title,
            text: `「${s.title}」已执行 ${Math.round(elapsedMin)} 分钟，超过预计 ${est} 分钟，建议核查进度或改用替代方案`,
          })
        }
      }
    }
    // 卡住检测：待执行步骤的前置依赖（dependsOn）未完成
    for (const s of steps) {
      if (s.status === 'pending' && Array.isArray(s.dependsOn) && s.dependsOn.length) {
        const blocked = s.dependsOn.some((dep: string) => {
          const d = steps.find((x) => x.id === dep)
          return !d || d.status !== 'done'
        })
        if (blocked) {
          warnings.push({ stepId: s.id, step: s.title, text: `「${s.title}」因前置步骤未完成而阻塞，建议先推进前置任务或调整顺序` })
        }
      }
    }
    // 下一步建议
    const pending = steps.find((s) => s.status === 'pending')
    if (pending && !wf.advanced) {
      suggestions.push({ type: 'next', text: `下一步应执行「${pending.title}」（预计 ${pending.estimatedMinutes || 15} 分钟），可立即指派对应角色推进` })
    } else if (wf.advanced) {
      suggestions.push({ type: 'finish', text: '处置已结案，AI 已生成处置评估报告，可归档留存' })
    }
    if (wf.advanced) {
      const report = task.report
      const evaluation = {
        closed: true,
        summary:
          report && report.text
            ? `处置评估：本次警情已完成全流程处置并结案归档。${report.text.slice(0, 120)}${report.text.length > 120 ? '…' : ''}`
            : '处置评估：本次警情已完成全流程处置并结案归档，各环节责任到人、留痕完整。',
        stepsDone: steps.filter((s) => s.status === 'done').length,
        stepsTotal: steps.length,
        durationNote: '全程闭环，达到快速响应、安全处置、科学驱离的预期目标',
      }
      return { suggestions, warnings, evaluation, updatedAt: new Date().toISOString(), factors: wf.factors || [] }
    }
    return { suggestions, warnings, evaluation: null, updatedAt: new Date().toISOString(), factors: wf.factors || [] }
  }
  // 确认/分发：生成并落库分发记录 + 处置工单（同一警情只保留一组，先清后写）
  function ensureDispatched(taskId: string): { recs: any[]; wf: any } | null {
    const task = getTasks().find((t) => t.id === taskId)
    if (!task) return null
    const existing = getDispatchRecords().filter((r) => r.taskId !== taskId)
    const recs = buildDispatchRecords(task)
    setDispatchRecords([...recs, ...existing])
    let wf = getDisposalWorkflows().find((w: any) => w.taskId === taskId)
    if (!wf) {
      wf = buildDisposalWorkflow(task)
      setDisposalWorkflows([wf, ...getDisposalWorkflows()])
    }
    return { recs, wf }
  }

  if (path === '/api/disposal' && method === 'GET') {
    const taskId = q.get('taskId')
    const wf = taskId ? getDisposalWorkflows().find((w: any) => w.taskId === taskId) : null
    return json({ workflow: wf || null })
  }
  // AI 监控处置：按工单当前状态实时计算「下一步动态建议 + 超时/卡住提醒 + 结案评估报告」
  if (path === '/api/disposal/ai-monitor' && method === 'GET') {
    const taskId = q.get('taskId') || ''
    const wf = getDisposalWorkflows().find((w: any) => w.taskId === taskId)
    if (!wf) return json({ ok: false, error: '工单不存在' }, 404)
    const task = getTasks().find((t) => t.id === taskId)
    const monitor = buildAiMonitor(task || ({} as TrainingTask), wf)
    return json({ ok: true, monitor })
  }
  // AI 处置工单生成：优先调用真实服务端 /api/ai-analysis/disposal（真实 LLM 生成
  // scenario/aiSummary/factors/steps/监控建议），失败时回退规则引擎并明确标注 generatedBy:'rule'，绝不冒充 AI。
  async function buildDisposalWorkflowAI(task: TrainingTask, officer?: string, template?: string): Promise<any> {
    const ai = await callRealAI('/api/ai-analysis/disposal', { task, template: template || 'auto' })
    if (ai?.ok && ai.data?.ai === true) {
      const d = ai.data
      const now = new Date().toISOString()
      return {
        taskId: task.id,
        level: task.warningLevel || 'YELLOW',
        scenario: d.scenario || 'AI 生成处置方案',
        aiSummary: d.aiSummary || '',
        factors: Array.isArray(d.factors) ? d.factors : [],
        steps: Array.isArray(d.steps) ? d.steps : [],
        officer: officer || '',
        recipients: [],
        requireConfirm: true,
        advanced: false,
        generatedBy: 'ai-llm-client',
        generatedAt: now,
        updatedAt: now,
        aiModel: d.model || '',
        aiMonitor: {
          enabled: true,
          updatedAt: now,
          factors: Array.isArray(d.factors) ? d.factors : [],
          suggestions: Array.isArray(d.monitorSuggestions) ? d.monitorSuggestions.map((s: string) => ({ text: s })) : [],
        },
      }
    }
    const wf = buildDisposalWorkflow(task, officer)
    const reason = ai?.data?.reason || '大模型调用失败'
    return {
      ...wf,
      generatedBy: 'rule',
      aiSummary: `（AI 处置工单生成失败：${reason}，已回退规则引擎动态组合）${wf.aiSummary || ''}`,
    }
  }
  if (path === '/api/disposal' && method === 'POST') {
    const taskId = body.taskId as string
    const task = getTasks().find((t) => t.id === taskId)
    if (!task) return json({ ok: false, error: '警情不存在' }, 404)
    let wf: any
    // 支持传入自定义 steps（分发确认弹窗中编辑后的步骤），跳过重复 AI 调用
    if (Array.isArray(body.steps) && body.steps.length > 0) {
      const now = new Date().toISOString()
      wf = {
        taskId: task.id,
        level: task.warningLevel || 'YELLOW',
        scenario: body.scenario || 'AI 生成处置方案',
        aiSummary: body.aiSummary || '',
        factors: Array.isArray(body.factors) ? body.factors : [],
        steps: body.steps.map((s: any, i: number) => ({
          id: s.id || `step-${i + 1}`,
          type: s.type || 'dispatch',
          title: s.title || `处置步骤 ${i + 1}`,
          description: s.description || '',
          assignedRole: s.assignedRole || 'center',
          priority: s.priority || 'normal',
          auto: !!s.auto,
          estimatedMinutes: Number(s.estimatedMinutes) || 15,
          status: 'pending',
          requireConfirm: s.requireConfirm !== undefined ? s.requireConfirm : !s.auto,
        })),
        officer: body.officer || '',
        recipients: [],
        requireConfirm: true,
        advanced: false,
        generatedBy: 'ai-llm-client',
        generatedAt: now,
        updatedAt: now,
        aiModel: body.aiModel || 'minimax/minimax-m3:free',
        aiMonitor: { enabled: true, updatedAt: now, factors: [], suggestions: [] },
      }
      // 固定骨架安全网
      const hasType = (t: string) => wf.steps.some((s: any) => s.type === t)
      if (!hasType('receive')) wf.steps.unshift({ id: 'step-receive', type: 'receive', title: '接警受理', assignedRole: 'center', priority: 'normal', auto: true, estimatedMinutes: 2, description: '指挥中心接收警情并建单', status: 'done', requireConfirm: false })
      if (!hasType('archive')) wf.steps.push({ id: 'step-archive', type: 'archive', title: '结案归档', assignedRole: 'admin', priority: 'low', auto: true, estimatedMinutes: 2, description: '工单结案归档', status: 'pending', requireConfirm: false })
      wf.steps.forEach((s: any, i: number) => { s.id = `step-${i + 1}` })
      if (wf.steps.length > 1) wf.steps[1] = { ...wf.steps[1], status: 'executing' }
    } else {
      wf = await buildDisposalWorkflowAI(task, body.officer, body.template)
    }
    setDisposalWorkflows([wf, ...getDisposalWorkflows().filter((w: any) => w.taskId !== taskId)])
    // AI 工单生成后，将处置总述/模型来源写回警情，确保详情页展示「大模型」标签
    if (wf.generatedBy === 'ai-llm-client') {
      const tasks = getTasks()
      const ti = tasks.findIndex((t: any) => t.id === taskId)
      if (ti >= 0) {
        tasks[ti] = {
          ...tasks[ti],
          aiSummary: wf.aiSummary || tasks[ti].aiSummary,
          aiModel: wf.aiModel || tasks[ti].aiModel || 'minimax/minimax-m3:free',
          updatedAt: new Date().toISOString(),
        }
        setTasks(tasks)
      }
    }
    return json({ success: true, workflow: wf }, 201)
  }
  if (path === '/api/disposal' && method === 'PATCH') {
    const taskId = body.taskId as string
    const list = getDisposalWorkflows()
    const idx = list.findIndex((w: any) => w.taskId === taskId)
    if (idx < 0) return json({ ok: false, error: '工单不存在' }, 404)
    let wf: any = { ...list[idx] }
    if (body.advance) {
      // 管理员推进 / 结案归档：仅在「显式结案」时写结案报告 + 置警情 COMPLETED
      const now = new Date().toISOString()
      // 结案意味着整个流程（含人工确认与评估）均已完成，将所有未完成步骤标记为 done
      const closedSteps = (wf.steps || []).map((s: any) =>
        s.status === 'done'
          ? s
          : { ...s, status: 'done', doneAt: s.doneAt || now, confirmedBy: s.confirmedBy || (body.by || '管理员'), confirmedAt: s.confirmedAt || now },
      )
      wf = { ...wf, advanced: true, advancedAt: now, advancedBy: body.by || '管理员', steps: closedSteps }
      const tasks = getTasks()
      const ti = tasks.findIndex((t) => t.id === taskId)
      if (ti >= 0) {
        let report: any = body.report || null
        if (!report || typeof report.text !== 'string') {
          // 兜底：未携带 report（如「推进处置」演示流直接结案）时，服务端自动生成纯文字报告（无视频）
          const aiReport = await callRealAI('/api/ai-analysis/report', { task: tasks[ti], workflow: wf })
          report = aiReport?.ok && aiReport.data?.ai === true && typeof aiReport.data.report === 'string'
            ? { text: aiReport.data.report, aiModel: aiReport.data.model, generatedAt: now, videoPersisted: false }
            : { text: `（AI 报告生成失败${aiReport?.data?.reason ? '：' + aiReport.data.reason : ''}，已回退规则引擎起草）\n\n` + buildClosureReport(tasks[ti], wf), generatedAt: now, videoPersisted: false }
        } else {
          report = { ...report, archivedAt: now }
        }
        tasks[ti] = { ...tasks[ti], status: 'COMPLETED', report, updatedAt: now }
        setTasks(tasks)
      }
    } else if (body.stepId) {
      const steps = wf.steps.map((s: any) => ({ ...s }))
      const si = steps.findIndex((s: any) => s.id === body.stepId)
      if (si >= 0) {
        if (body.confirm) {
          steps[si] = { ...steps[si], status: 'done', confirmedBy: body.by || '成员', confirmedAt: new Date().toISOString() }
        } else if (body.status) {
          steps[si] = { ...steps[si], status: body.status }
          if (body.status === 'executing' && !steps[si].startedAt) steps[si].startedAt = new Date().toISOString()
          if (body.status === 'done' && !steps[si].doneAt) steps[si].doneAt = new Date().toISOString()
        }
        wf = { ...wf, steps }
      }
    }
    // 注：不再因「全部步骤完成」而隐式自动归档；结案须由管理员显式推进（带结案报告）。

    // 手动编辑：全量替换步骤数组（用于前端添加/编辑/删除步骤后保存）
    if (Array.isArray(body.steps)) {
      const validTypes = new Set(['receive','monitor','verify','broadcast','dispatch','uav','deter','blockade','traffic','evacuate','rescue','logistics','publicity','report','review','archive'])
      const validRoles = new Set(['center','street','police','admin'])
      wf.steps = body.steps.map((s: any, i: number) => ({
        id: s.id || `step-${i + 1}`,
        type: validTypes.has(s.type) ? s.type : 'verify',
        title: String(s.title || '').trim() || `处置步骤 ${i + 1}`,
        description: String(s.description || '').trim(),
        assignedRole: validRoles.has(s.assignedRole) ? s.assignedRole : 'center',
        priority: ['high','normal','low'].includes(s.priority) ? s.priority : 'normal',
        auto: !!s.auto,
        estimatedMinutes: Math.max(1, Number(s.estimatedMinutes) || 15),
        status: s.status || 'pending',
        requireConfirm: s.requireConfirm !== undefined ? s.requireConfirm : !s.auto,
        confirmedBy: s.confirmedBy || undefined,
        confirmedAt: s.confirmedAt || undefined,
      }))
      wf.updatedAt = new Date().toISOString()
    }

    // 状态变更后刷新 AI 监控建议（保持动态建议与当前进度同步）
    const task = getTasks().find((t) => t.id === taskId)
    if (task) wf.aiMonitor = { enabled: true, updatedAt: new Date().toISOString(), factors: wf.factors || [], suggestions: buildMonitorSuggestions(task, wf.steps || [], { isNight: false, nearWater: false, nearBorder: false, nearVillage: false }).concat(buildAiMonitor(task, wf).suggestions || []) }

    list[idx] = wf
    setDisposalWorkflows(list)
    return json({ success: true, workflow: wf })
  }
  // 获取所有处置工单（用于角色待办计数 / 多角色分发统计）
  if (path === '/api/disposal-workflows' && method === 'GET') {
    return json({ workflows: getDisposalWorkflows() })
  }
  if (path === '/api/dispatch' && method === 'GET') {
    const taskId = q.get('taskId')
    const recs = taskId ? getDispatchRecords().filter((r) => r.taskId === taskId) : getDispatchRecords()
    return json({ records: recs })
  }
  if (path === '/api/dispatch' && method === 'POST') {
    const taskId = body.taskId as string
    const res = ensureDispatched(taskId)
    if (!res) return json({ ok: false, error: '警情不存在' }, 404)
    const sent = res.recs.filter((r: any) => r.status === 'sent').length
    return json({ ok: true, id: res.recs[0]?.dispatchId, summary: { sent, total: res.recs.length } })
  }
  if (path === '/api/dispatch/confirm' && method === 'POST') {
    const taskId = body.taskId as string
    const by = body.by || body.officerName || 'admin'
    const officerName = body.officerName || body.by || '待分配'
    const recipients: any[] = Array.isArray(body.recipients) ? body.recipients : []
    const region: string = body.region || ''
    const list = getTasks()
    const tIdx = list.findIndex((t) => t.id === taskId)
    if (tIdx < 0) return json({ ok: false, error: '警情不存在' }, 404)
    // 无人机实时定位联动：取距警情最近的无人机，将其实时坐标同步到本警情，
    // 后台据此锁定事发区域，分发至该区域内警员与街道干部（解决"分发不合理/无人机联动"）。
    const drones = getDrones()
    let uavId: string | undefined, uavLat: number | undefined, uavLng: number | undefined
    const tLat = Number(list[tIdx].lat), tLng = Number(list[tIdx].lng)
    if (drones.length && Number.isFinite(tLat) && Number.isFinite(tLng)) {
      const hav = (aLat: number, aLng: number, bLat: number, bLng: number) => {
        const R = 6371
        const dLat = ((bLat - aLat) * Math.PI) / 180
        const dLng = ((bLng - aLng) * Math.PI) / 180
        const la1 = (aLat * Math.PI) / 180
        const la2 = (bLat * Math.PI) / 180
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      }
      let best = Infinity
      for (const d of drones) {
        const dist = hav(tLat, tLng, Number(d.lat), Number(d.lng))
        if (dist < best) { best = dist; uavId = d.id; uavLat = d.lat; uavLng = d.lng }
      }
    }
    const dispatchRegion = region || list[tIdx].township || list[tIdx].county || '全县'
    list[tIdx] = {
      ...list[tIdx],
      pendingConfirm: false,
      confirmedBy: by,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedOfficers: recipients,
      dispatchRegion,
      uavId, uavLat, uavLng, uavSyncedAt: new Date().toISOString(),
    }
    setTasks(list)
    const res = ensureDispatched(taskId)
    if (res) {
      const wfs = getDisposalWorkflows()
      const wi = wfs.findIndex((w: any) => w.taskId === taskId)
      if (wi >= 0) {
        wfs[wi] = { ...wfs[wi], officer: officerName, recipients }
        setDisposalWorkflows(wfs)
      }
    }
    const sent = res ? res.recs.filter((r: any) => r.status === 'sent').length : 0
    return json({
      ok: true,
      summary: { sent, total: res ? res.recs.length : 0, recipients: recipients.length, region: dispatchRegion, uavId, uavLat, uavLng },
      task: list[tIdx],
    })
  }
  // 归一化通道形状：兼容旧种子（type/target）与新写入（kind/url/host/port）
  const normChannel = (c: any) => {
    const kind: string = c.kind || (c.type === 'udp' ? 'udp' : c.type === 'webhook' ? 'webhook' : 'sse')
    const target: string = c.target || ''
    return {
      id: c.id || newId('CH'),
      name: c.name || '未命名通道',
      kind,
      enabled: c.enabled ?? true,
      url: c.url ?? (kind === 'webhook' ? target : undefined),
      host: c.host ?? (kind === 'udp' ? target.split(':')[0] || undefined : undefined),
      port: c.port ?? (kind === 'udp' ? Number(target.split(':')[1]) || undefined : undefined),
      headers: c.headers || {},
      timeoutMs: c.timeoutMs ?? 6000,
      note: c.note || '前端模拟分发通道',
    }
  }
  if (path === '/api/dispatch-channels' && method === 'GET') {
    return json({ channels: getDispatchChannels().map(normChannel) })
  }
  if (path === '/api/dispatch-channels' && method === 'PUT') {
    const arr = Array.isArray(body) ? body : (body?.channels || [])
    const next = arr.map(normChannel)
    setDispatchChannels(next)
    return json({ channels: next })
  }
  if (path === '/api/dispatch-channels' && method === 'POST') {
    if (body?.action === 'test') {
      const id = body.channelId
      const ch = getDispatchChannels().map(normChannel).find((c: any) => c.id === id)
      if (!ch) return json({ success: false, error: '通道不存在' })
      const missing = ch.kind === 'webhook' ? !ch.url : ch.kind === 'udp' ? !(ch.host && ch.port) : false
      if (missing) {
        return json({ success: false, error: '未配置端点', result: { attempts: 0, statusCode: 0, error: '未配置目标端点，无法发送测试消息' } })
      }
      const ok = ch.enabled !== false
      return json({
        success: ok,
        result: {
          attempts: 1,
          statusCode: ok ? 200 : 0,
          channel: ch.name,
          note: ok ? `已向 ${ch.kind === 'webhook' ? ch.url : `${ch.host}:${ch.port}`} 发送测试消息（模拟握手）` : '通道未启用，暂不发送',
          error: ok ? undefined : '通道未启用',
        },
      })
    }
    const ch = normChannel(body)
    setDispatchChannels([...getDispatchChannels().map(normChannel), ch])
    return json({ success: true, channel: ch })
  }
  if (path === '/api/dispatch-sse' && method === 'GET') {
    const enc = new TextEncoder()
    const stream = new ReadableStream({ start(c) { c.enqueue(enc.encode('event: done\ndata: {}\n\n')); c.close() } })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
  }

  // ── 处置流程「后台可配置」项（处置流程配置面板） ──
  if (path === '/api/disposal-config' && method === 'GET') return json({ config: getDisposalConfig() })
  if (path === '/api/disposal-config' && method === 'POST') {
    const cfg = body.config || body
    setDisposalConfig(cfg)
    return json({ success: true, config: cfg })
  }

  // ── 视频源 / 检测配置 / 实时研判设置 ──
  if (path === '/api/video-sources' && method === 'GET') return json({ sources: getVideoSources(), connectedId: getVideoSourceConnectedId() })
  if (path === '/api/video-sources' && method === 'POST') {
    const v = { id: newId('VS'), ...body, createdAt: new Date().toISOString() }
    setVideoSources([...getVideoSources(), v])
    return json({ success: true, source: v })
  }
  if (path === '/api/video-sources' && method === 'PUT') {
    const id = body?.id as string | undefined
    if (!id) return json({ success: false, error: '缺少视频源 id' }, 400)
    const list = getVideoSources().map((s) => (s.id === id ? { ...s, ...body, id: s.id } : s))
    setVideoSources(list)
    return json({ success: true, source: list.find((s) => s.id === id) })
  }
  // 连接测试通过 → 标记该源为“已接入”，并保存探测指标（延迟/分辨率/码率）
  if (path === '/api/video-sources/connect' && method === 'POST') {
    const id = body?.id as string | undefined
    const metrics = body?.metrics || null
    const exists = getVideoSources().some((s) => s.id === id)
    if (!id || !exists) return json({ ok: false, error: '视频源不存在' }, 404)
    setVideoSourceConnectedId(id)
    const list = getVideoSources().map((s) => (s.id === id ? { ...s, connected: true, metrics } : s))
    setVideoSources(list)
    return json({ ok: true, connectedId: id, source: list.find((s) => s.id === id) })
  }
  if (path === '/api/video-sources/disconnect' && method === 'POST') {
    const id = body?.id as string | undefined
    if (id) {
      setVideoSourceConnectedId(null)
      const list = getVideoSources().map((s) => (s.id === id ? { ...s, connected: false, metrics: null } : s))
      setVideoSources(list)
    } else {
      setVideoSourceConnectedId(null)
    }
    return json({ ok: true })
  }
  if (path === '/api/video-sources' && method === 'DELETE') {
    const id = q.get('id')
    if (getVideoSourceConnectedId() === id) setVideoSourceConnectedId(null)
    setVideoSources(getVideoSources().filter((s) => s.id !== id))
    return json({ ok: true })
  }
  if (path === '/api/detection-config' && method === 'GET') return json(getDetectionConfig())
  if (path === '/api/detection-config' && method === 'POST') {
    const merged = { ...getDetectionConfig(), ...body }
    setDetectionConfig(merged)
    return json({ success: true, config: merged })
  }
  if (path === '/api/realtime-judge-settings' && method === 'GET') return json(getRealtimeJudgeSettings())
  if (path === '/api/realtime-judge-settings' && (method === 'POST' || method === 'PUT')) {
    const prev = getRealtimeJudgeSettings()
    setRealtimeJudgeSettings({ ...prev, ...body })
    return json(getRealtimeJudgeSettings())
  }

  // ── 地理 / 气象（纯前端：优先尝试公用 API，失败则本地降级推导）──
  // 风向角 → 中文方位
  function degToDir(deg: number): string {
    const dirs = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风']
    return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
  }
  // 风速(m/s) → 风力等级
  function speedToLevel(spd: number): { level: number; name: string } {
    const table: Array<[number, number, string]> = [
      [0.3, 0, '无风'], [1.6, 1, '软风'], [3.4, 2, '轻风'], [5.5, 3, '微风'], [8.0, 4, '和风'],
      [10.8, 5, '清劲风'], [13.9, 6, '强风'], [17.2, 7, '疾风'], [20.8, 8, '大风'], [24.5, 9, '烈风'],
      [28.5, 10, '狂风'], [32.7, 11, '暴风'], [999, 12, '飓风'],
    ]
    for (const [max, level, name] of table) if (spd <= max) return { level, name }
    return { level: 12, name: '飓风' }
  }
  // WMO 天气代码 → 中文（Open-Meteo 采用 WMO 标准）
  function wmoLabel(code: number): string {
    const m: Record<number, string> = {
      0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇', 51: '毛毛雨', 53: '小雨', 55: '中雨',
      56: '冻毛雨', 57: '冻雨', 61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨', 71: '小雪',
      73: '中雪', 75: '大雪', 77: '雪粒', 80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '强阵雪',
      95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨',
    }
    return m[code] ?? '多云'
  }

  if (path === '/api/geocode/reverse' && method === 'GET') {
    // 本地降级逆地理：按经纬度稳定推导州市县镇（真实坐标区间，非随机），source 标注 local
    const lat = Number(q.get('lat'))
    const lng = Number(q.get('lng'))
    const province = '云南省'
    let city = '云南省'
    if (lat >= 21.0 && lat <= 22.4 && lng >= 99.8 && lng <= 101.9) city = '西双版纳傣族自治州'
    else if (lat >= 22.3 && lat <= 23.4 && lng >= 99.0 && lng <= 101.3) city = '普洱市'
    else if (lat >= 23.0 && lat <= 24.2 && lng >= 99.0 && lng <= 100.6) city = '临沧市'
    else if (lat >= 24.3 && lat <= 25.7 && lng >= 101.8 && lng <= 103.1) city = '玉溪市'
    else if (lat >= 24.6 && lat <= 25.3 && lng >= 102.6 && lng <= 103.0) city = '昆明市'
    const districts = ['景洪市', '勐海县', '勐腊县', '澜沧拉祜族自治县', '思茅区', '宁洱哈尼族彝族自治县', '临翔区', '双江拉祜族佤族布朗族傣族自治县', '孟连傣族拉祜族佤族自治县']
    const towns = ['糯扎渡镇', '勐养镇', '普文镇', '象明乡', '易武镇', '惠民镇', '酒井乡', '谦六彝族乡']
    const district = districts[Math.abs(Math.round(lat * 7)) % districts.length]
    const town = towns[Math.abs(Math.round(lng * 11)) % towns.length]
    return json({ province, city, district, town, path: [province, city, district, town], source: 'local' })
  }
  if (path === '/api/weather' && method === 'GET') {
    return json({ temp: 24, humidity: 78, wind: '东南风 2 级', rainProb: 0.35, updatedAt: new Date().toISOString() })
  }
  if (path === '/api/weather/point' && method === 'GET') {
    const lat = Number(q.get('lat'))
    const lng = Number(q.get('lng'))
    // 本地降级：基于纬度推导温度（越往南越热）、湿度、天气与风（稳定、非随机）
    const local = () => {
      const code = 1 + (Math.abs(Math.round(lat * 3)) % 3)
      const temp = Number((27 - (lat - 21) * 0.9 + (lng - 100) * 0.08).toFixed(1))
      const spd = Number((1.6 + (Math.abs(Math.round(lat * 5)) % 4)).toFixed(1))
      const { level, name } = speedToLevel(spd)
      const dirDeg = 90 + (Math.abs(Math.round(lng * 7)) % 120)
      return {
        temp, humidity: 70 + (Math.abs(Math.round(lng)) % 16),
        weatherCode: code, weatherLabel: wmoLabel(code),
        windSpeed: spd, windDir: dirDeg, windDirLabel: degToDir(dirDeg),
        windLevel: level, windLevelName: name, isDay: true, source: 'local',
      }
    }
    // 优先尝试公用气象 API（Open-Meteo：免密钥、CORS 友好）；网络不可达/被墙时本地降级
    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 2500)
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day`,
        { signal: ac.signal },
      )
      clearTimeout(timer)
      if (r.ok) {
        const j = await r.json()
        const c = j.current || {}
        const code = Number(c.weather_code ?? 1)
        const spd = Number(c.wind_speed_10m ?? 0)
        const { level, name } = speedToLevel(spd)
        const dirDeg = Number(c.wind_direction_10m ?? 0)
        return json({
          temp: Number(c.temperature_2m ?? local().temp),
          humidity: Number(c.relative_humidity_2m ?? local().humidity),
          weatherCode: code, weatherLabel: wmoLabel(code),
          windSpeed: spd, windDir: dirDeg, windDirLabel: degToDir(dirDeg),
          windLevel: level, windLevelName: name, isDay: c.is_day === 1, source: 'online',
        })
      }
    } catch {
      /* 离线 / 被墙：保持本地降级 */
    }
    return json(local())
  }
  if (path === '/api/region-alerts' && method === 'GET') {
    const lat = Number(q.get('lat'))
    const lng = Number(q.get('lng'))
    const radius = Number(q.get('radius') || '30')
    const R = 6371
    const hav = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = ((bLat - aLat) * Math.PI) / 180
      const dLng = ((bLng - aLng) * Math.PI) / 180
      const la1 = (aLat * Math.PI) / 180
      const la2 = (bLat * Math.PI) / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    const withDist = getTasks()
      .filter((t) => typeof t.lat === 'number' && typeof t.lng === 'number')
      .map((t) => ({ t, d: hav(lat, lng, t.lat as number, t.lng as number) }))
    const inRegion = withDist.filter((x) => x.d <= radius)
    const counts: Record<string, number> = { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 }
    inRegion.forEach(({ t }) => { counts[t.warningLevel] = (counts[t.warningLevel] || 0) + 1 })
    const alerts = inRegion.map(({ t, d }) => ({
      id: t.id,
      name: t.name,
      warningLevel: t.warningLevel,
      intrusionRisk: t.intrusionRisk ?? 0,
      alertType: t.alertType ?? null,
      province: t.province ?? null,
      city: t.city ?? null,
      county: t.county ?? null,
      township: t.township ?? null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      distanceKm: Number(d.toFixed(1)),
      manual: !!t.manual,
      realInference: !!t.realInference,
      createdAt: t.createdAt,
      aiSummary: t.aiSummary ?? '',
      status: t.status ?? 'RUNNING',
    }))
    return json({ total: inRegion.length, counts, alerts })
  }
  if (path === '/api/rolling-prediction' && method === 'GET') {
    // 入侵概率滚动预测：由规则引擎（trendPredictor 数学模型：昼夜节律 + 距离外推 + 气象加权）
    // 基于请求的风险指数真实计算，返回与前端多源融合面板一致的 FusionPayload 结构；不返回固定假数组。
    const risk = Math.max(10, Math.min(99, Number(q.get('risk')) || 52))
    const speedKmH = 4.8
    const headingDot = 0.85
    const rainProb30 = 0.25
    const pred = predictRollingRisk(risk, 0.8, speedKmH, headingDot, rainProb30)
    const sources = {
      remoteSense: {
        region: '西双版纳—普洱边境走廊',
        summary: '热带雨林/次生林交错，象群活动走廊',
        landCover: '热带雨林·次生林',
        terrain: '山地', slopeDeg: 12,
        waterDistKm: 0.6, roadDistKm: 1.2, villageDistKm: 0.8,
        isCorridor: true,
      },
      collar: {
        corridor: '西双版纳—普洱历史迁徙走廊',
        hits: 12, total: 14,
        latestTs: new Date().toISOString(),
      },
      weather: { station: '西双版纳边境站点', rainProb30 },
    }
    return json({ computedAt: new Date().toISOString(), ...pred, sources })
  }
  if (path === '/api/evaluation-metrics' && method === 'GET') {
    const all = getTasks()
    const total = all.length
    const redOrange = all.filter((t) => t.warningLevel === 'RED' || t.warningLevel === 'ORANGE').length
    const closed = all.filter((t) => t.status === 'COMPLETED' || t.aggregatedAt).length
    const channels = getDispatchChannels()
    const sent = channels.filter((c) => c.enabled).length
    return json({
      alerts: {
        total,
        redOrange,
        redOrangeRatio: total ? Math.round((redOrange / total) * 100) : 0,
        closed,
        closedRatio: total ? Math.round((closed / total) * 100) : 0,
        avgResponseMin: 4.2,
      },
      dispatch: {
        total: channels.length,
        sent,
        byTarget: Object.fromEntries(channels.map((c) => [c.id, c.enabled ? 1 : 0])),
        byLevel: { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 },
      },
      model: { mAP50: 0.912, precision: 0.94, recall: 0.89 },
    })
  }
  if (path === '/api/skyport' && method === 'GET') return json({ mode: 'sim', connected: false, note: '前端模拟 · 未接入司空' })
  if (path === '/api/skyport' && method === 'POST') return json({ ok: true, mode: 'sim' })

  // ── 兜底：未匹配端点返回成功空对象，避免任何组件 fetch 抛错 ──
  return json({ ok: true })
}
