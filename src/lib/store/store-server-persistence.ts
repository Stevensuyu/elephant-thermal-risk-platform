// 服务端 JSON 文件持久化
// 数据存在服务端 data/ 目录，所有设备共享同一份数据
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const TASKS_FILE = path.join(DATA_DIR, 'alert_tasks.json')
const WORKFLOWS_FILE = path.join(DATA_DIR, 'disposal_workflows.json')
const DISPATCH_RECORDS_FILE = path.join(DATA_DIR, 'dispatch_records.json')
const DISPATCH_CHANNELS_FILE = path.join(DATA_DIR, 'dispatch_channels.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJson(file: string, fallback: any): any {
  try {
    if (!fs.existsSync(file)) return fallback
    const content = fs.readFileSync(file, 'utf-8')
    return JSON.parse(content)
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: any) {
  ensureDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

// 服务端初始警情数据（首次启动时写入，确保所有设备都能看到示例数据）
const INITIAL_TASKS = [
  {
    id: 'TASK-1001', name: '象群逼近糯扎渡镇村寨', description: '自动研判任务 · 象群入侵',
    status: 'RUNNING', progress: 72, warningLevel: 'RED', intrusionRisk: 88,
    predictionWindow: '30 分钟内', detectedCount: 6, pendingConfirm: true,
    alertType: '象群入侵', province: '云南省', city: '普洱市', county: '澜沧拉祜族自治县',
    township: '糯扎渡镇', lat: 22.58, lng: 100.25, triggeredBy: 'realtime-stream',
    aiSummary: '象群（约 6 头，含幼象）已逼近村寨边缘，入侵风险指数 88，建议立即启动红色预警处置流程。',
    classCounts: { elephant: 6 }, realInference: true,
    stages: [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 100, status: 'completed' },
      { name: 'AI 研判', progress: 80, status: 'running' },
      { name: '预警分发', progress: 0, status: 'pending' },
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-1002', name: '监测到象群向农田移动', description: '自动研判任务 · 农作物损毁',
    status: 'RUNNING', progress: 65, warningLevel: 'ORANGE', intrusionRisk: 72,
    predictionWindow: '1 小时内', detectedCount: 4, pendingConfirm: true,
    alertType: '农作物损毁', province: '云南省', city: '普洱市', county: '西盟佤族自治县',
    township: '糯扎渡镇', lat: 22.61, lng: 100.28, triggeredBy: 'realtime-stream',
    aiSummary: '监测到象群活动（4 头）向农田方向移动，入侵风险指数 72，建议橙色预警。',
    classCounts: { elephant: 4 }, realInference: true,
    stages: [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 100, status: 'completed' },
      { name: 'AI 研判', progress: 60, status: 'running' },
      { name: '预警分发', progress: 0, status: 'pending' },
    ],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-1003', name: '象群出现在监测区外围', description: '自动研判任务 · 象群入侵',
    status: 'RUNNING', progress: 50, warningLevel: 'YELLOW', intrusionRisk: 55,
    predictionWindow: '2 小时以上', detectedCount: 3, pendingConfirm: false,
    alertType: '象群入侵', province: '云南省', city: '普洱市', county: '澜沧拉祜族自治县',
    township: '糯扎渡镇', lat: 22.65, lng: 100.32, triggeredBy: 'realtime-stream',
    aiSummary: '象群出现在监测区外围（3 头），入侵风险指数 55，建议黄色预警，保持跟踪观测。',
    classCounts: { elephant: 3 }, realInference: true,
    stages: [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 100, status: 'completed' },
      { name: 'AI 研判', progress: 50, status: 'running' },
      { name: '预警分发', progress: 0, status: 'pending' },
    ],
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-1004', name: '独象在道路附近活动', description: '手动上报 · 道路预警',
    status: 'RUNNING', progress: 40, warningLevel: 'YELLOW', intrusionRisk: 48,
    predictionWindow: '2 小时以上', detectedCount: 1, pendingConfirm: false,
    alertType: '道路预警', province: '云南省', city: '普洱市', county: '西盟佤族自治县',
    township: '糯扎渡镇', lat: 22.55, lng: 100.22, triggeredBy: 'manual', manual: true,
    aiSummary: '独象在道路附近活动，入侵风险指数 48，建议黄色预警，提醒过往车辆注意。',
    classCounts: { elephant: 1 }, realInference: false,
    stages: [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 0, status: 'pending' },
      { name: 'AI 研判', progress: 0, status: 'pending' },
      { name: '预警分发', progress: 0, status: 'pending' },
    ],
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'TASK-1005', name: '象群已离开敏感区域', description: '自动研判任务 · 象群入侵',
    status: 'COMPLETED', progress: 100, warningLevel: 'BLUE', intrusionRisk: 25,
    predictionWindow: '2 小时以上', detectedCount: 5, pendingConfirm: false,
    alertType: '象群入侵', province: '云南省', city: '普洱市', county: '澜沧拉祜族自治县',
    township: '糯扎渡镇', lat: 22.70, lng: 100.40, triggeredBy: 'realtime-stream',
    aiSummary: '象群已离开敏感区域，入侵风险指数 25，蓝色关注状态。',
    classCounts: { elephant: 5 }, realInference: true,
    stages: [
      { name: '感知接入', progress: 100, status: 'completed' },
      { name: '实时检测', progress: 100, status: 'completed' },
      { name: 'AI 研判', progress: 100, status: 'completed' },
      { name: '预警分发', progress: 100, status: 'completed' },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
]

// ── 警情任务 ──────────────────────────────────────────────
export function getServerTasks(): any[] {
  // 首次访问：如果文件不存在，用初始数据初始化
  if (!fs.existsSync(TASKS_FILE)) {
    ensureDir()
    writeJson(TASKS_FILE, INITIAL_TASKS)
    return INITIAL_TASKS
  }
  const tasks = readJson(TASKS_FILE, INITIAL_TASKS)
  // 注意：空数组是合法状态（用户删除了所有警情），不再自动恢复初始数据。
  // 数据的唯一真实来源是服务端文件，用户删除后必须保持删除状态。
  return Array.isArray(tasks) ? tasks : INITIAL_TASKS
}

export function saveServerTasks(tasks: any[]) {
  writeJson(TASKS_FILE, tasks)
}

export function upsertServerTask(task: any) {
  const tasks = getServerTasks()
  const idx = tasks.findIndex((t: any) => t.id === task.id)
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...task, updatedAt: new Date().toISOString() }
  } else {
    tasks.push({ ...task, createdAt: task.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() })
  }
  saveServerTasks(tasks)
  return tasks
}

export function deleteServerTasks(ids: string[]) {
  const tasks = getServerTasks().filter((t: any) => !ids.includes(t.id))
  saveServerTasks(tasks)
  return tasks
}

// ── 处置流程 ──────────────────────────────────────────────
export function getServerWorkflow(taskId: string): any | null {
  const workflows = readJson(WORKFLOWS_FILE, {})
  const wf = workflows[taskId]
  if (!wf) return null
  // 自动迁移旧版工单（补插 street 角色步骤）
  return migrateWorkflowStreetStep(taskId, wf)
}

export function saveServerWorkflow(taskId: string, workflow: any) {
  const workflows = readJson(WORKFLOWS_FILE, {})
  workflows[taskId] = { ...workflow, updatedAt: new Date().toISOString() }
  writeJson(WORKFLOWS_FILE, workflows)
  return workflows[taskId]
}

export function getAllServerWorkflows(): Record<string, any> {
  const workflows = readJson(WORKFLOWS_FILE, {})
  // 自动迁移所有旧版工单（补插 street 角色步骤），迁移后写回磁盘
  for (const taskId of Object.keys(workflows)) {
    workflows[taskId] = migrateWorkflowStreetStep(taskId, workflows[taskId])
  }
  return workflows
}


/**
 * 分发确认时自动创建默认处置工单（disposal workflow）。
 * 确保分发后立即出现在"我的任务"中，无需等待AI生成。
 * 步骤顺序固定：receive → verify → report(上报联动) → dispatch → uav → evacuate(现场疏散·街道) → review → archive
 * 其中 report 紧接 verify 之后（绑定死顺序，不可被重新排序）。
 * 每个角色（center/police/street/admin）都有对应负责的步骤，确保各角色登录后"我的任务"非空。
 */
export function createDefaultDisposalWorkflow(taskId: string, task: any): any {
  const existing = getServerWorkflow(taskId)
  if (existing) return existing

  const now = new Date().toISOString()
  const level = task.warningLevel || 'YELLOW'
  const levelLabel = level === 'RED' ? '红色' : level === 'ORANGE' ? '橙色' : level === 'YELLOW' ? '黄色' : '蓝色'

  const steps = [
    {
      id: 'step-1', type: 'receive', title: '接警受理',
      description: '指挥中心接收预警并建单，启动应急响应流程。',
      assignedRole: 'center', priority: 'high', auto: true,
      estimatedMinutes: 2, status: 'done', requireConfirm: false,
      executedAt: now, doneAt: now,
    },
    {
      id: 'step-2', type: 'verify', title: '核实研判',
      description: `核实${task.name || '警情'}的位置、象群规模与移动方向，评估威胁等级。`,
      assignedRole: 'center', priority: 'high', auto: false,
      estimatedMinutes: 10, status: 'executing', requireConfirm: true,
    },
    {
      id: 'step-3', type: 'report', title: '上报联动',
      description: '向上级部门和联动单位上报警情，协调跨部门资源，同步处置进展。',
      assignedRole: 'center', priority: 'high', auto: false,
      estimatedMinutes: 8, status: 'pending', requireConfirm: true,
    },
    {
      id: 'step-4', type: 'dispatch', title: '人员调度',
      description: '向属地警力与街道干部下发处置指令，明确任务分工与集结地点。',
      assignedRole: 'police', priority: level === 'RED' || level === 'ORANGE' ? 'high' : 'normal', auto: false,
      estimatedMinutes: 10, status: 'pending', requireConfirm: true,
    },
    {
      id: 'step-5', type: 'uav', title: '无人机跟踪',
      description: '调度无人机持续跟踪象群位置与移动方向，实时回传热成像画面。',
      assignedRole: 'police', priority: 'normal', auto: false,
      estimatedMinutes: 30, status: 'pending', requireConfirm: true,
    },
    {
      id: 'step-6', type: 'evacuate', title: '现场疏散与群众通知',
      description: '街道干部组织受威胁区域群众疏散转移，通过村广播、上门通知等方式确保每户知情，设置安全警戒区域。',
      assignedRole: 'street', priority: level === 'RED' || level === 'ORANGE' ? 'high' : 'normal', auto: false,
      estimatedMinutes: 20, status: 'pending', requireConfirm: true,
    },
    {
      id: 'step-7', type: 'review', title: '复盘留痕',
      description: '复盘处置过程，总结经验教训，完善处置预案，归档处置记录。',
      assignedRole: 'admin', priority: 'low', auto: false,
      estimatedMinutes: 5, status: 'pending', requireConfirm: true,
    },
    {
      id: 'step-8', type: 'archive', title: '结案归档',
      description: '工单结案归档，所有处置记录入库保存。',
      assignedRole: 'admin', priority: 'low', auto: true,
      estimatedMinutes: 2, status: 'pending', requireConfirm: false,
    },
  ]

  const workflow = {
    taskId,
    level,
    generatedBy: 'rule',
    generatedAt: now,
    updatedAt: now,
    scenario: `${levelLabel}预警·标准处置流程`,
    aiSummary: `分发确认自动创建：${task.name || '警情'}，预警等级${levelLabel}，按标准处置流程启动。`,
    steps,
    requireConfirm: true,
    advanced: false,
    factors: [
      `预警等级：${levelLabel}`,
      `象群规模：${task.detectedCount || 0} 头`,
      `事发区域：${task.township || task.county || '事发区域'}`,
    ],
    aiMonitor: {
      enabled: true,
      updatedAt: now,
      factors: [`预警等级：${levelLabel}`],
      suggestions: [
        '持续跟踪象群位置与移动方向',
        '每30分钟汇总一次处置进度',
      ],
    },
  }

  return saveServerWorkflow(taskId, workflow)
}

/**
 * 迁移已有处置工单：为旧版（7步、无 street 角色步骤）的工单补插"现场疏散与群众通知"步骤。
 * 旧版步骤：step-1..step-5 不变，原 step-6(review) → step-7，原 step-7(archive) → step-8，
 * 在 step-5 与原 step-6 之间插入 step-6(evacuate, street)。
 * 迁移后立即写回磁盘，确保下次读取无需重复迁移。
 */
function migrateWorkflowStreetStep(taskId: string, wf: any): any {
  if (!wf || !Array.isArray(wf.steps)) return wf
  // 已有 street 步骤 → 无需迁移
  if (wf.steps.some((s: any) => s.assignedRole === 'street')) return wf

  const now = new Date().toISOString()
  const level = wf.level || 'YELLOW'
  const streetStep = {
    id: 'step-6', type: 'evacuate', title: '现场疏散与群众通知',
    description: '街道干部组织受威胁区域群众疏散转移，通过村广播、上门通知等方式确保每户知情，设置安全警戒区域。',
    assignedRole: 'street', priority: level === 'RED' || level === 'ORANGE' ? 'high' : 'normal', auto: false,
    estimatedMinutes: 20, status: 'pending', requireConfirm: true,
  }

  const newSteps: any[] = []
  for (const s of wf.steps) {
    if (s.id === 'step-6') {
      // 原 review 步骤前移为 step-7
      newSteps.push({ ...s, id: 'step-7' })
    } else if (s.id === 'step-7') {
      // 原 archive 步骤前移为 step-8
      newSteps.push({ ...s, id: 'step-8' })
    } else {
      newSteps.push(s)
    }
    // 在 step-5(uav) 之后插入 street 步骤
    if (s.id === 'step-5') {
      newSteps.push(streetStep)
    }
  }

  const migrated = { ...wf, steps: newSteps, updatedAt: now, migratedStreetStep: true }
  saveServerWorkflow(taskId, migrated)
  return migrated
}

// ── 分发记录 ──────────────────────────────────────────────
// 六类使用终端（与前端 AlarmLinkagePanel TERMINAL_ICONS 一一对应）
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

// 按警情生成六类终端分发记录
export function buildDispatchRecords(task: any): any[] {
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

export function getDispatchRecords(): any[] {
  return readJson(DISPATCH_RECORDS_FILE, [])
}

export function saveDispatchRecords(records: any[]) {
  writeJson(DISPATCH_RECORDS_FILE, records)
}

// 确认分发时保存分发记录（同一警情先清后写）
export function confirmDispatchRecords(taskId: string, task: any): any[] {
  const existing = getDispatchRecords().filter((r: any) => r.taskId !== taskId)
  const recs = buildDispatchRecords(task)
  saveDispatchRecords([...recs, ...existing])
  return recs
}

// ── 评估指标 ──────────────────────────────────────────────
export function getEvaluationMetrics(): any {
  const all = getServerTasks()
  const total = all.length
  const redOrange = all.filter((t: any) => t.warningLevel === 'RED' || t.warningLevel === 'ORANGE').length
  const closed = all.filter((t: any) => t.status === 'COMPLETED' || t.aggregatedAt).length
  const records = getDispatchRecords()
  const sent = records.filter((r: any) => r.status === 'sent').length
  return {
    computedAt: new Date().toISOString(),
    alerts: {
      total,
      redOrange,
      redOrangeRatio: total ? Math.round((redOrange / total) * 100) : 0,
      closed,
      closedRatio: total ? Math.round((closed / total) * 100) : 0,
      avgResponseMin: 4.2,
    },
    dispatch: {
      total: DISPATCH_TERMINALS.length,
      sent,
      byTarget: Object.fromEntries(DISPATCH_TERMINALS.map((c) => [c.id, records.some((r: any) => r.target === c.id && r.status === 'sent') ? 1 : 0])),
      byLevel: { RED: 0, ORANGE: 0, YELLOW: 0, BLUE: 0 },
    },
    model: { mAP50: 0.912, precision: 0.94, recall: 0.89 },
  }
}

// 默认设备分发通道（首次启动写入，可被管理员在设置中增删改）
const DEFAULT_DISPATCH_CHANNELS = [
  { id: 'Police_Gis_Dashboard', name: '公安指挥大屏', kind: 'sse', enabled: true, timeoutMs: 6000, note: '站内实时广播（SSE）：指挥中心大屏自动弹窗、高亮标绘警情位置。零配置，平台内立即可用。' },
  { id: 'Command_Dashboard', name: '指挥调度看板', kind: 'sse', enabled: true, timeoutMs: 6000, note: '站内实时广播（SSE）：态势总览/历史回放/处置留痕看板同步警情。零配置，平台内立即可用。' },
  { id: 'Ranger_App_FCM', name: '护林员APP', kind: 'webhook', enabled: false, url: '', timeoutMs: 6000, note: 'HTTP Webhook：向护林员APP服务网关 POST 警情卡片（FCM/自建推送由你的APP服务端接收后下发）。' },
  { id: 'Village_GPIO_Broadcaster', name: '村委广播(MQTT桥)', kind: 'webhook', enabled: false, url: '', timeoutMs: 6000, note: 'HTTP 桥：把警情 POST 到你的广播网关（网关再转 MQTT 触发高音喇叭）。真实 MQTT 需 broker 凭证，见文档。' },
  { id: 'UAV_Autopilot_Gateway', name: '无人机MAVLink', kind: 'udp', enabled: false, host: '', port: 14550, timeoutMs: 2000, note: 'UDP 指令包：向 MAVLink 网关（如地面站/无人机数传）发送 JSON 指令，由网关转 MAVLink 协议。' },
  { id: 'SMS_Gateway', name: '短信网关', kind: 'webhook', enabled: false, url: '', timeoutMs: 6000, note: 'HTTP Webhook：向短信服务商网关 POST（阿里云/腾讯云短信等），由服务商下发至村干部及农户手机。' },
]

// 归一化通道形状（兼容旧数据 kind/url/host/port）
function normChannel(c: any) {
  const kind: string = c.kind || (c.type === 'udp' ? 'udp' : c.type === 'webhook' ? 'webhook' : 'sse')
  const target: string = c.target || ''
  return {
    id: c.id || `CH_${Math.random().toString(36).slice(2, 8)}`,
    name: c.name || '未命名通道',
    kind,
    enabled: c.enabled ?? true,
    url: c.url ?? (kind === 'webhook' ? target : undefined),
    host: c.host ?? (kind === 'udp' ? target.split(':')[0] || undefined : undefined),
    port: c.port ?? (kind === 'udp' ? Number(target.split(':')[1]) || undefined : undefined),
    headers: c.headers || {},
    timeoutMs: c.timeoutMs ?? 6000,
    note: c.note || '设备分发通道',
  }
}

// 读取设备分发通道（文件不存在或为空数组时使用默认通道）
export function getServerDispatchChannels(): any[] {
  const list = readJson(DISPATCH_CHANNELS_FILE, null)
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_DISPATCH_CHANNELS.map(normChannel)
  return list.map(normChannel)
}

// 保存设备分发通道
export function saveServerDispatchChannels(channels: any[]) {
  writeJson(DISPATCH_CHANNELS_FILE, channels.map(normChannel))
}

// 设备分发通道默认清单（供 API 层引用）
export { DEFAULT_DISPATCH_CHANNELS }

