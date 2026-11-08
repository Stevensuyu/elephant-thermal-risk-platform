// 人员分级管理（RBAC）角色权限模型 —— 前后端共享的纯常量

export type RoleId = 'admin' | 'center' | 'street' | 'police'

export interface RoleDef {
  id: RoleId
  name: string
  desc: string
  /** 可见的页面 tab id 列表 */
  menus: string[]
  /** 数据访问范围：'all' 表示全部；否则为允许的地区/辖区名称列表 */
  dataScope: 'all' | string[]
}

export const ROLES: Record<RoleId, RoleDef> = {
  admin: {
    id: 'admin',
    name: '系统管理员',
    desc: '拥有全部菜单与数据权限，可管理人员与角色配置',
    menus: ['screen', 'dashboard', 'mytasks', 'monitor', 'judge', 'alerts', 'settings'],
    dataScope: 'all',
  },
  center: {
    id: 'center',
    name: '管理中心人员',
    desc: '可见态势总览、实时监控、预警研判与系统设置（后台），数据范围为全县',
    menus: ['screen', 'dashboard', 'mytasks', 'monitor', 'judge', 'alerts', 'settings'],
    dataScope: 'all',
  },
  street: {
    id: 'street',
    name: '街道干部',
    desc: '可见态势总览、实时监控、预警研判与系统设置（后台），数据范围限定为本街道',
    menus: ['screen', 'dashboard', 'mytasks', 'monitor', 'judge', 'alerts', 'settings'],
    dataScope: ['更戛乡'],
  },
  police: {
    id: 'police',
    name: '警员',
    desc: '可见实时监控与预警研判，数据范围限定为执勤区域',
    menus: ['screen', 'mytasks', 'monitor', 'judge', 'alerts'],
    dataScope: ['更戛乡'],
  },
}

export const ROLE_ORDER: RoleId[] = ['admin', 'center', 'street', 'police']

/** 默认演示角色（未选择时使用） */
export const DEFAULT_ROLE: RoleId = 'admin'

export function roleCanView(role: RoleId, tab: string): boolean {
  return ROLES[role].menus.includes(tab)
}

/** 当前角色的数据范围标签（用于界面展示） */
export function dataScopeLabel(role: RoleId): string {
  const scope = ROLES[role].dataScope
  return scope === 'all' ? '全县 / 全部数据' : scope.join('、')
}

/** 固定登录口令（前端写死，不可修改；与 mock/seed 共用） */
export const FIXED_PASSWORD = 'tyhx2026'

/** 系统内置登录账号（与通用设置页「当前登录用户」保持一致） */
export interface LoginAccount {
  role: RoleId
  name: string
  account: string
  avatarText: string
  grad: string
  desc: string
}

export const LOGIN_ACCOUNTS: LoginAccount[] = [
  { role: 'admin',   name: '李建国', account: 'admin',    avatarText: '李', grad: 'from-fuchsia-500 to-indigo-500', desc: '系统管理员 · 全局数据权限' },
  { role: 'center',  name: '王芳',   account: 'center01', avatarText: '王', grad: 'from-sky-500 to-blue-500',       desc: '管理中心 · 区域统筹研判' },
  { role: 'street',  name: '赵伟',   account: 'street01', avatarText: '赵', grad: 'from-amber-500 to-orange-500',   desc: '街道干部 · 一线处置调度' },
  { role: 'police',  name: '陈强',   account: 'police01', avatarText: '陈', grad: 'from-emerald-500 to-teal-500',   desc: '警员 · 现场秩序维护' },
]

export function accountOf(role: RoleId): LoginAccount {
  return LOGIN_ACCOUNTS.find((a) => a.role === role) ?? LOGIN_ACCOUNTS[0]
}
