'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BadgeCheck, Plus, Shield, Siren, Trash2 } from 'lucide-react'
import type { PersonnelMember, PersonnelRole } from '@/lib/personnel'
import type { WarningLevel } from '@/lib/store'

const levelOptions: WarningLevel[] = ['RED', 'ORANGE', 'YELLOW', 'BLUE']

export default function PersonnelManagement({ currentLevel }: { currentLevel: WarningLevel }) {
  const [members, setMembers] = useState<PersonnelMember[]>([])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<PersonnelMember>({
    id: '',
    name: '',
    role: 'POLICE',
    scope: '',
    channels: '',
    levels: ['YELLOW'],
    duty: '',
  })

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/personnel', { cache: 'no-store' })
      if (!response.ok) return
      setMembers(await response.json())
    })()
  }, [])

  const currentHandlers = useMemo(
    () => members.filter((item) => item.levels.includes(currentLevel)),
    [currentLevel, members],
  )

  const addMember = async () => {
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          role: draft.role,
          scope: draft.scope,
          channels: draft.channels,
          levels: draft.levels,
          duty: draft.duty,
        }),
      })
      if (!response.ok) return
      const next = (await response.json()) as PersonnelMember
      setMembers((current) => [...current, next])
      setDraft({
        id: '',
        name: '',
        role: 'POLICE',
        scope: '',
        channels: '',
        levels: ['YELLOW'],
        duty: '',
      })
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (id: string) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/personnel/${id}`, { method: 'DELETE' })
      if (!response.ok) return
      setMembers((current) => current.filter((item) => item.id !== id))
    } finally {
      setBusy(false)
    }
  }

  const toggleLevel = (level: WarningLevel) => {
    setDraft((current) => ({
      ...current,
      levels: current.levels.includes(level) ? current.levels.filter((item) => item !== level) : [...current.levels, level],
    }))
  }

  return (
    <section className="grid grid-cols-[.95fr_1.05fr] gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={20} className="text-emerald-700" />
          <h2 className="text-lg font-semibold text-slate-900">人员分层管理</h2>
        </div>

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">新增人员</div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="姓名" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
            <Select
              label="角色"
              value={draft.role}
              onChange={(role) => setDraft((current) => ({ ...current, role: role as PersonnelRole }))}
              options={[
                { value: 'ADMIN', label: '管理员' },
                { value: 'POLICE', label: '民警' },
              ]}
            />
            <Input label="管理范围" value={draft.scope} onChange={(scope) => setDraft((current) => ({ ...current, scope }))} />
            <Input label="通知渠道" value={draft.channels} onChange={(channels) => setDraft((current) => ({ ...current, channels }))} />
            <Input label="处置动作" value={draft.duty} onChange={(duty) => setDraft((current) => ({ ...current, duty }))} />
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">接收等级</div>
              <div className="flex flex-wrap gap-2">
                {levelOptions.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      draft.levels.includes(level) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void addMember()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Plus size={16} />
              添加人员
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <RoleBlock
            title="管理员"
            icon={BadgeCheck}
            description="负责配置、确认和升级决策"
            members={members.filter((item) => item.role === 'ADMIN')}
            onDelete={removeMember}
            busy={busy}
          />
          <RoleBlock
            title="民警"
            icon={Siren}
            description="负责接警、联动与现场处置"
            members={members.filter((item) => item.role === 'POLICE')}
            onDelete={removeMember}
            busy={busy}
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
                <div className="rounded-md bg-white p-2 md:col-span-2">通知渠道：{item.channels}</div>
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
  onDelete,
  busy,
}: {
  title: string
  description: string
  members: PersonnelMember[]
  icon: LucideIcon
  onDelete: (id: string) => void
  busy: boolean
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.scope}</div>
              </div>
              <button
                onClick={() => void onDelete(item.id)}
                disabled={busy}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-60"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </label>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label>
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
