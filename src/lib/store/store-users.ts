// 服务端用户数据存储（JSON文件持久化）
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

export interface ServerUser {
  id: string
  account: string
  name: string
  role: 'admin' | 'center' | 'street' | 'police'
  password: string // 明文存储（内部系统，后续可改bcrypt）
  phone?: string
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

// 默认用户（与rbac.ts中的固定账号一致）
const DEFAULT_USERS: ServerUser[] = [
  { id: 'user-admin', account: 'admin', name: '李建国', role: 'admin', password: 'tyhx2026', phone: '13800000001', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'user-center', account: 'center01', name: '王芳', role: 'center', password: 'tyhx2026', phone: '13800000002', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'user-street', account: 'street01', name: '赵伟', role: 'street', password: 'tyhx2026', phone: '13800000003', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'user-police', account: 'police01', name: '陈强', role: 'police', password: 'tyhx2026', phone: '13800000004', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
]

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readUsers(): ServerUser[] {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      ensureDir()
      fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf-8')
      return DEFAULT_USERS
    }
    const content = fs.readFileSync(USERS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return DEFAULT_USERS
  }
}

function writeUsers(users: ServerUser[]) {
  ensureDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
}

export function getUsers(): ServerUser[] {
  return readUsers()
}

export function getUserByAccount(account: string): ServerUser | null {
  return readUsers().find((u) => u.account === account) || null
}

export function createUser(user: Omit<ServerUser, 'id' | 'createdAt' | 'updatedAt'>): ServerUser {
  const users = readUsers()
  const now = new Date().toISOString()
  const newUser: ServerUser = {
    ...user,
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  }
  users.push(newUser)
  writeUsers(users)
  return newUser
}

export function updateUser(id: string, patch: Partial<ServerUser>): ServerUser | null {
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === id)
  if (idx < 0) return null
  users[idx] = { ...users[idx], ...patch, updatedAt: new Date().toISOString() }
  writeUsers(users)
  return users[idx]
}

export function deleteUser(id: string): boolean {
  const users = readUsers()
  const user = users.find((u) => u.id === id)
  if (!user || user.account === 'admin') return false // admin不可删除
  const filtered = users.filter((u) => u.id !== id)
  writeUsers(filtered)
  return true
}

export function verifyLogin(account: string, password: string): ServerUser | null {
  const user = readUsers().find((u) => u.account === account)
  if (!user) return null
  if (user.password !== password) return null
  if (user.status !== 'active') return null
  return user
}
