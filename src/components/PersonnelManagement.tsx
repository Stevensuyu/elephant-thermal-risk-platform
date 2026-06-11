import { BadgeCheck, Shield, Siren } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WarningLevel } from '@/lib/store'

type PersonnelRole = 'ADMIN' | 'POLICE'

type PersonnelMember = {
  id: string
  name: string
  role: PersonnelRole
  scope: string
  channels: string[]
  levels: WarningLevel[]
  duty: string
}

const personnel: PersonnelMember[] = [
  {
    id: 'admin-1',
    name: '值班管理员',
    role: 'ADMIN',
    scope: '全局配置、模型确认、任务审核',
    channels: ['控制台', '短信', '企业微信'],
    levels: ['RED', 'ORANGE', 'YELLOW', 'BLUE'],
    duty: '确认预警、调整规则、下发联动策略',
  },
  {
    id: 'admin-2',
    name: '系统管理员',
    role: 'ADMIN',
    scope: '地图、AI、DJI、YOLO、三维分析接口管理',
    channels: ['控制台', '邮件'],
    levels: ['RED', 'ORANGE'],
    duty: '配置密钥、维护接入、审查留痕',
  },
  {
    id: 'police-1',
    name: '辖区民警',
    role: 'POLICE',
    scope: '接警、巡逻、现场核查',
    channels: ['移动端', '电话', '短信'],
    levels: ['RED', 'ORANGE', 'YELLOW'],
    duty: '接收预警、赶赴现场、回传处置结果',
  },
  {
    id: 'police-2',
    name: '联动民警',
    role: 'POLICE',
    scope: '交通协同、村寨联络、边界巡护',
    channels: ['移动端', '短信'],
    levels: ['ORANGE', 'YELLOW', 'BLUE'],
    duty: '执行联动、巡护跟踪、普通警情提醒',
  },
]

export default function PersonnelManagement({ currentLevel }: { currentLevel: WarningLevel }) {
  const currentHandlers = personnel.filter((item) =>
    item.levels.includes(currentLevel),
  )

  return (
    <section className="grid grid-cols-[.95fr_1.05fr] gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={20} className="text-emerald-700" />
          <h2 className="text-lg font-semibold text-slate-900">人员分层管理</h2>
        </div>
        <div className="space-y-3">
          <RoleBlock
            title="管理员"
            icon={BadgeCheck}
            description="负责配置、确认和升级决策"
            members={personnel.filter((item) => item.role === 'ADMIN')}
          />
          <RoleBlock
            title="民警"
            icon={Siren}
            description="负责接警、联动与现场处置"
            members={personnel.filter((item) => item.role === 'POLICE')}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BadgeCheck size={20} className="text-emerald-700" />
          <h2 className="text-lg font-semibold text-slate-900">当前预警分发</h2>
        </div>
        <div className="mb-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          当前等级：<strong>{currentLevel}</strong>。系统会将对应预警推送给相应等级的管理员和民警。
        </div>
        <div className="space-y-3">
          {currentHandlers.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.scope}</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {item.role === 'ADMIN' ? '管理员' : '民警'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                <div className="rounded-md bg-white p-2">接收等级：{item.levels.join(' / ')}</div>
                <div className="rounded-md bg-white p-2">处置动作：{item.duty}</div>
                <div className="rounded-md bg-white p-2 md:col-span-2">通知渠道：{item.channels.join(' / ')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RoleBlock({
  title,
  description,
  members,
  icon: Icon,
}: {
  title: string
  description: string
  members: PersonnelMember[]
  icon: LucideIcon
}) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-slate-700" />
        <div className="font-semibold text-slate-900">{title}</div>
      </div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
      <div className="mt-3 space-y-2">
        {members.map((item) => (
          <div key={item.id} className="rounded-md bg-white p-3 text-sm">
            <div className="font-semibold text-slate-900">{item.name}</div>
            <div className="mt-1 text-xs text-slate-500">{item.scope}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
