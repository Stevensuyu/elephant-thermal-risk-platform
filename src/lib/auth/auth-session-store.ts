import type { RoleId } from '@/lib/auth/auth-role-permissions'

export interface AuthState {
  role: RoleId
  user: string
  name: string
}

// localStorage 持久化键
const STORAGE_KEY = 'tyhx_auth_state'
const ACTIVITY_KEY = 'tyhx_auth_last_activity'

// 从 localStorage 恢复认证状态（页面刷新后保持登录）
function loadAuthFromStorage(): AuthState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.role && parsed.user) {
      return { role: parsed.role as RoleId, user: parsed.user, name: parsed.name || parsed.user }
    }
  } catch {
    /* ignore */
  }
  return null
}

function saveAuthToStorage(a: AuthState | null) {
  if (typeof window === 'undefined') return
  try {
    if (a) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

function loadLastActivity(): number {
  if (typeof window === 'undefined') return Date.now()
  try {
    const v = localStorage.getItem(ACTIVITY_KEY)
    return v ? Number(v) : Date.now()
  } catch {
    return Date.now()
  }
}

function saveLastActivity(ts: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ACTIVITY_KEY, String(ts))
  } catch {
    /* ignore */
  }
}

// 初始化：从 localStorage 恢复（刷新页面后保持登录状态）
let auth: AuthState | null = loadAuthFromStorage()
const listeners = new Set<(a: AuthState | null) => void>()

// 会话超时：30分钟无操作自动登出
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
let lastActivity = loadLastActivity()
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

const resetTimer = () => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (auth) {
    timeoutTimer = setTimeout(() => {
      setAuth(null)
    }, SESSION_TIMEOUT_MS)
  }
}

// 监听用户活动（仅在客户端）
if (typeof window !== 'undefined') {
  ;['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, () => {
      lastActivity = Date.now()
      saveLastActivity(lastActivity)
      if (auth) resetTimer()
    }, { passive: true })
  })
}

// 启动时检查是否已超时
if (auth && Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
  auth = null
  saveAuthToStorage(null)
}

export const getAuth = (): AuthState | null => auth

export const setAuth = (a: AuthState | null) => {
  auth = a
  lastActivity = Date.now()
  saveAuthToStorage(a)
  saveLastActivity(lastActivity)
  resetTimer()
  listeners.forEach((l) => l(a))
}

export const subscribeAuth = (l: (a: AuthState | null) => void): (() => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// 登录失败锁定
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
let failedAttempts = 0
let lockoutUntil = 0

export const getLockoutStatus = () => {
  if (lockoutUntil > Date.now()) {
    return { locked: true, remainingMs: lockoutUntil - Date.now() }
  }
  if (lockoutUntil > 0 && lockoutUntil <= Date.now()) {
    lockoutUntil = 0
    failedAttempts = 0
  }
  return { locked: false, remainingMs: 0 }
}

export const recordFailedAttempt = () => {
  failedAttempts++
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutUntil = Date.now() + LOCKOUT_MS
    failedAttempts = 0
  }
}

export const resetFailedAttempts = () => {
  failedAttempts = 0
  lockoutUntil = 0
}
