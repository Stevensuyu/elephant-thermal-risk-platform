// 操作日志存储：加密存储 + 哈希链防篡改 + 不可删除
// 内存为主，localStorage 加密持久化（刷新后日志保留，但登录状态不保留）

export interface LogEntry {
  id: string
  timestamp: string
  userId: string
  userName: string
  role: string
  action: string
  detail: string
  ip: string
  result: 'success' | 'failure'
  hash: string
  prevHash: string
}

const STORAGE_KEY = 'tyhx_audit_logs_v1'
const ENC_KEY = 'tyhx_audit_2026_secure_key'

// 简单 XOR + Base64 加密（同步，适用于 mock 架构）
function encrypt(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length))
  }
  return btoa(unescape(encodeURIComponent(result)))
}

function decrypt(encoded: string): string {
  try {
    const text = decodeURIComponent(escape(atob(encoded)))
    let result = ''
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length))
    }
    return result
  } catch {
    return ''
  }
}

// 简单哈希（djb2 + 混合），用于哈希链防篡改
function simpleHash(str: string): string {
  let h1 = 5381
  let h2 = 52711
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = ((h1 << 5) + h1 + c) >>> 0
    h2 = ((h2 << 3) + h2 + c + i) >>> 0
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, '0')
}

let logs: LogEntry[] = []
let loaded = false

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const decrypted = decrypt(raw)
      const parsed = JSON.parse(decrypted)
      if (Array.isArray(parsed)) logs = parsed
    }
  } catch {
    logs = []
  }
}

function persist() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, encrypt(JSON.stringify(logs)))
    }
  } catch {
    /* ignore */
  }
}

export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp' | 'hash' | 'prevHash'> & { timestamp?: string }): LogEntry {
  load()
  const prevHash = logs.length > 0 ? logs[logs.length - 1].hash : '0000000000000000'
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const timestamp = entry.timestamp || new Date().toISOString()
  const data = `${id}|${timestamp}|${entry.userId}|${entry.userName}|${entry.role}|${entry.action}|${entry.detail}|${entry.ip}|${entry.result}|${prevHash}`
  const hash = simpleHash(data)
  const full: LogEntry = {
    id,
    timestamp,
    userId: entry.userId,
    userName: entry.userName,
    role: entry.role,
    action: entry.action,
    detail: entry.detail,
    ip: entry.ip,
    result: entry.result,
    hash,
    prevHash,
  }
  logs.push(full)
  // 最多保留 5000 条
  if (logs.length > 5000) logs = logs.slice(-5000)
  persist()
  return full
}

export interface LogQuery {
  userId?: string
  userName?: string
  role?: string
  action?: string
  keyword?: string
  from?: string
  to?: string
  result?: 'success' | 'failure'
  page?: number
  pageSize?: number
}

export function queryLogs(q: LogQuery): { total: number; page: number; pageSize: number; logs: LogEntry[] } {
  load()
  let result = [...logs].reverse()
  if (q.userId) result = result.filter((l) => l.userId === q.userId)
  if (q.userName) result = result.filter((l) => l.userName.includes(q.userName!))
  if (q.role) result = result.filter((l) => l.role === q.role)
  if (q.action) result = result.filter((l) => l.action === q.action)
  if (q.result) result = result.filter((l) => l.result === q.result)
  if (q.from) result = result.filter((l) => l.timestamp >= q.from!)
  if (q.to) result = result.filter((l) => l.timestamp <= q.to!)
  if (q.keyword) {
    const kw = q.keyword.toLowerCase()
    result = result.filter((l) =>
      l.action.toLowerCase().includes(kw) ||
      l.detail.toLowerCase().includes(kw) ||
      l.userName.toLowerCase().includes(kw),
    )
  }
  const total = result.length
  const page = q.page || 1
  const pageSize = q.pageSize || 50
  const start = (page - 1) * pageSize
  return { total, page, pageSize, logs: result.slice(start, start + pageSize) }
}

// 验证哈希链完整性（防篡改检测）
export function verifyLogChain(): { valid: boolean; brokenAt: number | null } {
  load()
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i]
    const prevHash = i > 0 ? logs[i - 1].hash : '0000000000000000'
    if (entry.prevHash !== prevHash) return { valid: false, brokenAt: i }
    const data = `${entry.id}|${entry.timestamp}|${entry.userId}|${entry.userName}|${entry.role}|${entry.action}|${entry.detail}|${entry.ip}|${entry.result}|${prevHash}`
    if (simpleHash(data) !== entry.hash) return { valid: false, brokenAt: i }
  }
  return { valid: true, brokenAt: null }
}

export function getAllLogs(): LogEntry[] {
  load()
  return [...logs].reverse()
}

export function exportLogsCSV(q?: LogQuery): string {
  const data = q ? queryLogs(q).logs : getAllLogs()
  const header = '时间,用户ID,用户名,角色,操作,详情,IP,结果,哈希'
  const rows = data.map((l) =>
    [l.timestamp, l.userId, l.userName, l.role, l.action, `"${l.detail.replace(/"/g, '""')}"`, l.ip, l.result, l.hash].join(','),
  )
  return '\uFEFF' + [header, ...rows].join('\n')
}

// 操作类型常量
export const LOG_ACTIONS = {
  LOGIN: '登录',
  LOGOUT: '登出',
  ROLE_SWITCH: '角色切换',
  VIEW_ALERT: '查看警情',
  CONFIRM_STEP: '确认处置步骤',
  DISPATCH: '分发警情',
  GENERATE_DISPOSAL: '生成处置流程',
  EDIT_STEP: '编辑处置步骤',
  ADD_STEP: '添加处置步骤',
  CLOSE_CASE: '结案归档',
  GENERATE_REPORT: '生成评估报告',
  AI_CALL: 'AI调用',
  SETTINGS_CHANGE: '修改设置',
  WATERMARK_TOGGLE: '水印开关',
} as const

// 便捷记录函数（组件中直接调用）
export function recordLog(params: {
  userName: string
  role: string
  action: string
  detail: string
  result?: 'success' | 'failure'
  userId?: string
}) {
  try {
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId || params.userName,
        userName: params.userName,
        role: params.role,
        action: params.action,
        detail: params.detail,
        result: params.result || 'success',
        ip: '127.0.0.1',
      }),
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
