import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { WarningLevel } from '@/lib/store'

export type PersonnelRole = 'ADMIN' | 'POLICE'

export interface PersonnelMember {
  id: string
  name: string
  role: PersonnelRole
  scope: string
  channels: string
  levels: WarningLevel[]
  duty: string
}

const root = process.cwd()
const storageDir = path.join(root, 'storage')
const personnelPath = path.join(storageDir, 'personnel.json')

const defaultPersonnel: PersonnelMember[] = [
  {
    id: 'admin-1',
    name: '值班管理员',
    role: 'ADMIN',
    scope: '全局配置、模型确认、任务审核',
    channels: '控制台 / 短信 / 企业微信',
    levels: ['RED', 'ORANGE', 'YELLOW', 'BLUE'],
    duty: '确认预警、调整规则、下发联动策略',
  },
  {
    id: 'police-1',
    name: '辖区民警',
    role: 'POLICE',
    scope: '接警、巡逻、现场核查',
    channels: '移动端 / 电话 / 短信',
    levels: ['RED', 'ORANGE', 'YELLOW'],
    duty: '接收预警、赶赴现场、回传处置结果',
  },
]

async function ensureStore() {
  await mkdir(storageDir, { recursive: true })
  try {
    await readFile(personnelPath, 'utf8')
  } catch {
    await writePersonnel(defaultPersonnel)
  }
}

export async function readPersonnel() {
  await ensureStore()
  const raw = await readFile(personnelPath, 'utf8')
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as PersonnelMember[]
  return Array.isArray(parsed) ? parsed : defaultPersonnel
}

export async function writePersonnel(members: PersonnelMember[]) {
  await mkdir(storageDir, { recursive: true })
  await writeFile(personnelPath, JSON.stringify(members, null, 2), 'utf8')
}

export async function createPersonnelMember(input: Omit<PersonnelMember, 'id'>) {
  const members = await readPersonnel()
  const next: PersonnelMember = {
    ...input,
    id: `member-${Date.now()}`,
    name: input.name.trim(),
    scope: input.scope.trim(),
    channels: input.channels.trim(),
    duty: input.duty.trim(),
  }
  members.push(next)
  await writePersonnel(members)
  return next
}

export async function deletePersonnelMember(id: string) {
  const members = await readPersonnel()
  const next = members.filter((item) => item.id !== id)
  if (next.length === members.length) return false
  await writePersonnel(next)
  return true
}
