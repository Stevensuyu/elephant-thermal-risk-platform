// ───────────────────────────────────────────────────────────────────────────
// 前端模拟数据种子（纯前端，无后端）
// 所有数据均为演示用模拟数据，存于浏览器 localStorage，刷新不丢失；
// 由 mock/router.ts 通过拦截 fetch('/api/*') 提供给原有前端组件。
// ───────────────────────────────────────────────────────────────────────────
import type { TrainingTask, ModelStatus, WarningLevel } from '@/lib/utils/util-app-types'
import type { ApiDrone } from '@/lib/store/store-drone-registry'
import { LOGIN_ACCOUNTS, FIXED_PASSWORD, type RoleId } from '@/lib/auth/auth-role-permissions'

/** 固定登录口令（写死，前端不可修改） */
export const FRONTEND_PASSWORD = FIXED_PASSWORD

const T0 = Date.now()
const iso = (offsetMin = 0) => new Date(T0 - offsetMin * 60000).toISOString()

function mkStages(done = 3, total = 4): TrainingTask['stages'] {
  const names = ['感知接入', '实时检测', 'AI 研判', '预警分发']
  return names.map((name, i) => ({
    name,
    progress: i < done ? 100 : i === done ? 60 : 0,
    status: (i < done ? 'completed' : i === done ? 'running' : 'pending') as TrainingTask['stages'][number]['status'],
  }))
}

const ALERT_TYPES = ['象群入侵', '人象冲突', '农作物损毁', '闯入村庄', '道路预警']

function makeTask(
  i: number,
  name: string,
  level: WarningLevel,
  risk: number,
  alertType: string,
  lat: number,
  lng: number,
  triggeredBy: string,
): TrainingTask {
  const detected = 1 + (i % 9)
  const summary =
    level === 'RED'
      ? `象群（约 ${detected} 头，含幼象）已逼近村寨边缘，入侵风险指数 ${risk}，建议立即启动红色预警处置流程，组织人员疏散并部署无人机跟踪。`
      : level === 'ORANGE'
        ? `监测到象群活动（${detected} 头）向农田方向移动，入侵风险指数 ${risk}，建议橙色预警，加强巡查与广播驱离。`
        : level === 'YELLOW'
          ? `象群出现在监测区外围（${detected} 头），入侵风险指数 ${risk}，建议黄色预警，保持跟踪观测。`
          : `象群活动处于可控范围（${detected} 头），入侵风险指数 ${risk}，蓝色关注状态。`
  return {
    id: `TASK-${1000 + i}`,
    name,
    description: `自动研判任务 · ${alertType}`,
    status: level === 'BLUE' ? 'COMPLETED' : 'RUNNING',
    progress: level === 'BLUE' ? 100 : 72,
    warningLevel: level,
    intrusionRisk: risk,
    predictionWindow: level === 'RED' ? '30 分钟内' : level === 'ORANGE' ? '1 小时内' : '2 小时以上',
    aiSummary: summary,
    dispatchPlan:
      level === 'RED'
        ? ['立即疏散周边人员', '无人机抵近跟踪', '广播驱离', '通知林业与公安部门']
        : level === 'ORANGE'
          ? ['加强地面巡查', '广播预警', '准备无人机']
          : ['保持监测', '记录轨迹'],
    detectedCount: detected,
    needsModelConfirm: false,
    videoFileName: 'kaziranga_elephants.mpg',
    metrics: { mAP50: 0.912, precision: 0.94, recall: 0.89 },
    stages: mkStages(level === 'BLUE' ? 4 : 2),
    createdAt: iso(40 + i * 7),
    updatedAt: iso(i * 3),
    realInference: true,
    classCounts: { elephant: detected },
    triggeredBy,
    alertType,
    province: '云南省',
    city: '普洱市',
    county: i % 2 ? '澜沧拉祜族自治县' : '西盟佤族自治县',
    township: '糯扎渡镇',
    lat,
    lng,
    deviceName: triggeredBy === 'realtime-stream' ? '热成像相机-07' : '模拟画面检测',
    manual: triggeredBy === 'manual',
    autonomous: {
      evidenceChain: ['感知接入：热成像相机捕获象群目标', '空间分析：目标距村寨 0.8km', '推演：以 4.8km/h 朝村寨移动', '决策：达到橙色阈值'],
      autonomousActions: [
        { action: '自动生成处置工单', auto: true, done: true },
        { action: '智能分发至林业/公安/乡镇', auto: true, done: level !== 'RED' },
        { action: '升级为红色响应', auto: true, done: level === 'RED' },
      ],
      autoEscalated: level === 'RED',
      decisionConfidence: 86 + (i % 10),
      recommendedImmediateAction: '立即组织周边人员避让并部署无人机跟踪',
      problemResolution: '建议启动分级预案，优先保障人员人身安全。',
      aiModel: '规则引擎（演示）',
      riskReasoning: '综合空间距离、移动速度与历史走廊，判定未来 1 小时入侵概率显著上升。',
    },
  }
}

export const SEED_TASKS: TrainingTask[] = [
  makeTask(0, '象群逼近糯扎渡镇村寨', 'RED', 88, '象群入侵', 22.58, 100.25, 'realtime-stream'),
  makeTask(1, '监测到象群向农田移动', 'ORANGE', 72, '农作物损毁', 22.61, 100.28, 'realtime-stream'),
  makeTask(2, '象群出现在监测区外围', 'YELLOW', 55, '象群入侵', 22.65, 100.32, 'realtime-stream'),
  makeTask(3, '独象在道路附近活动', 'YELLOW', 48, '道路预警', 22.55, 100.22, 'manual'),
  makeTask(4, '象群已离开敏感区域', 'BLUE', 25, '象群入侵', 22.70, 100.40, 'realtime-stream'),
]

export const SEED_MODEL_STATUS: ModelStatus = {
  version: 'YOLOv8n-elephant-thermal',
  status: '在线',
  datasetImages: 24860,
  classes: 1,
  map50: 0.912,
  elephantMap50: 0.928,
  precision: 0.94,
  recall: 0.89,
  source: '本地模型 · 前端演示',
  lastUpdated: iso(15),
}

function mkDrone(i: number, name: string, status: ApiDrone['status'], lat: number, lng: number): ApiDrone {
  return {
    id: `UAV-${200 + i}`,
    name,
    model: i % 2 ? 'M300 RTK' : 'Mavic 3T',
    connection: 'connected',
    homeLat: lat,
    homeLng: lng,
    skyport: { deviceSn: `SN-${8000 + i}` },
    streamUrl: 'frontend-sim://thermal',
    hasThermal: true,
    notes: '前端模拟遥测',
    createdAt: iso(600),
    lat,
    lng,
    altitude: 120 + i * 30,
    speed: 6 + i,
    heading: (i * 57) % 360,
    battery: 70 + ((i * 7) % 30),
    signal: 80 + ((i * 5) % 20),
    temperature: 36 + (i % 4),
    status,
    gpsLocked: true,
    updatedAt: iso(0),
    searchMode: (['螺旋扫描', 'ROI锁定', '自适应变焦', '返航', '待命'] as const)[i % 5],
    gimbalStable: true,
    trackingTargets: i % 3,
    trackingFrames: 30 + i * 12,
    occlusionRecovery: i % 2,
    payload: '热成像 + 可见光',
  }
}

export const SEED_DRONES: ApiDrone[] = [
  mkDrone(0, '巡检无人机-01', '飞行中', 22.48, 100.78),
  mkDrone(1, '巡检无人机-02', '巡航', 22.31, 100.45),
  mkDrone(2, '巡检无人机-03', '待命', 22.62, 99.46),
  mkDrone(3, '巡检无人机-04', '返航', 23.41, 101.68),
  mkDrone(4, '巡检无人机-05', '充电中', 22.0, 100.8),
]

export interface MockPerson {
  id: string
  name: string
  account: string
  role: RoleId
  region: string
  phone?: string
  /** 登录口令（纯前端演示，可在人员管理内增删改）；缺省回退 FIXED_PASSWORD */
  password?: string
  createdAt: string
  updatedAt: string
}

export const SEED_PEOPLE: MockPerson[] = LOGIN_ACCOUNTS.map((a, i) => ({
  id: `P-${100 + i}`,
  name: a.name,
  account: a.account,
  role: a.role,
  region: a.role === 'street' ? '更戛乡' : '全县',
  phone: `1380000${(1000 + i * 111).toString().slice(-4)}`,
  password: FIXED_PASSWORD,
  createdAt: iso(4000 + i * 10),
  updatedAt: iso(100 + i),
}))

export const SEED_AI_MODELS = [
  {
    id: 'openrouter-minimax-m3',
    name: 'OpenRouter (MiniMax M3)',
    provider: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'minimax/minimax-m3:free',
    apiKey: '', // 密钥不入库:统一由 .env.local 或「设置→AI 配置」面板提供
    active: true,
    createdAt: '2026-08-28T00:00:00.000Z',
  },
]

export const SEED_DISPATCH_CHANNELS = [
  { id: 'forestry', name: '林业和草原局', type: 'webhook' as const, target: 'https://example.gov/notify', enabled: true },
  { id: 'police', name: '公安指挥中心', type: 'udp' as const, target: '10.0.0.9:9900', enabled: true },
  { id: 'town', name: '乡镇值班室', type: 'sse' as const, target: 'frontend-sim', enabled: true },
]

export const SEED_VIDEO_SOURCES = [
  { id: 'local', name: '本地象群样本', source: 'local', note: '内置演示样本', createdAt: iso(9999) },
  { id: 'yt-1', name: '特姆贝水坑直播', source: 'https://www.youtube.com/watch?v=y6120QOlsfU', note: '公开直播（需 Cookie）', createdAt: iso(9998) },
]

export const SEED_DETECTION_CONFIG = { confidenceThreshold: 0.5, fps: 8, minStreak: 3, cooldownSec: 5, autoDispatch: true, nightModeStrict: false }

export const SEED_REALTIME_JUDGE_SETTINGS = { enabled: false, autoDispatch: true, levelThreshold: 'ORANGE' as WarningLevel }
