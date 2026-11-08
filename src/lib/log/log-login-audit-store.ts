import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const LOGIN_LOGS_FILE = join(DATA_DIR, 'login_logs.json')

export interface LoginLog {
  id: string
  sessionId: string
  userId: string
  userName: string
  role: string
  ip: string
  location: string
  userAgent: string
  browser: string
  os: string
  deviceType: string
  success: boolean
  failReason?: string
  timestamp: string
  isNewDevice: boolean
  isNewLocation: boolean
  isSuspicious: boolean
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function getLoginLogs(): LoginLog[] {
  ensureDir()
  if (!existsSync(LOGIN_LOGS_FILE)) return []
  try {
    const raw = readFileSync(LOGIN_LOGS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveLoginLogs(logs: LoginLog[]) {
  ensureDir()
  writeFileSync(LOGIN_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8')
}

export function addLoginLog(log: Omit<LoginLog, 'id' | 'timestamp' | 'isNewDevice' | 'isNewLocation' | 'isSuspicious'>): LoginLog {
  const logs = getLoginLogs()
  const userLogs = logs.filter((l) => l.userId === log.userId && l.success)

  // 检测新设备
  const isNewDevice = !userLogs.some((l) => l.userAgent === log.userAgent)

  // 检测新地点
  const isNewLocation = log.location !== '未知' && !userLogs.some((l) => l.location === log.location)

  // 异常标记：新设备或新地点，或多次失败后成功
  const recentFails = logs.filter(
    (l) => l.userId === log.userId && !l.success && Date.now() - new Date(l.timestamp).getTime() < 15 * 60 * 1000,
  ).length
  const isSuspicious = isNewDevice || isNewLocation || (log.success && recentFails >= 3)

  const entry: LoginLog = {
    ...log,
    id: `LL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    isNewDevice,
    isNewLocation,
    isSuspicious,
  }
  logs.unshift(entry)
  // 最多保留5000条
  saveLoginLogs(logs.slice(0, 5000))
  return entry
}

/** 解析 User-Agent 获取浏览器、操作系统、设备类型 */
export function parseUserAgent(ua: string): { browser: string; os: string; deviceType: string } {
  if (!ua) return { browser: '未知', os: '未知', deviceType: '未知' }

  let browser = '未知'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera'

  let os = '未知'
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11'
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1'
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  let deviceType = '电脑'
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) deviceType = '手机'
  else if (ua.includes('iPad') || ua.includes('Tablet')) deviceType = '平板'

  return { browser, os, deviceType }
}

/** 简单 IP 地理位置解析（本地映射 + 免费API回退） */
export async function resolveIpLocation(ip: string): Promise<string> {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return '内网/本地'
  }
  try {
    // 使用免费的 ip-api.com（http，无需key，限制45次/分钟）
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, { signal: AbortSignal.timeout(3000) })
    const d = await res.json() as any
    if (d.status === 'success') {
      return `${d.country || ''} ${d.regionName || ''} ${d.city || ''}`.trim() || '未知'
    }
  } catch {
    // 静默失败，返回未知
  }
  return '未知'
}
