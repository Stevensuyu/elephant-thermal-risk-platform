'use client'

import { useState } from 'react'
import { CheckCircle2, ShieldCheck, Palette } from 'lucide-react'
import { ROLES, dataScopeLabel, accountOf, type RoleId } from '@/lib/auth/auth-role-permissions'

export default function GeneralSettingsPanel({
  currentRole,
  theme,
  onThemeChange,
}: {
  currentRole: RoleId
  theme: string
  onThemeChange: (t: string) => void
}) {
  const user = accountOf(currentRole)
  const roleDef = ROLES[currentRole]

  return (
    <div className="space-y-4">
      {/* 当前登录用户 / 角色 */}
      <section className="dv-panel flex flex-wrap items-center gap-5 p-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${user.grad} text-2xl font-black text-white shadow-lg`}>
          {user.avatarText}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100">{user.name}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-medium text-slate-200">
              <ShieldCheck size={12} /> {roleDef.name}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            登录账号：<span className="font-mono text-slate-300">{user.account}</span>
            <span className="mx-2 text-slate-600">|</span>
            数据范围：{dataScopeLabel(currentRole)}
          </div>
        </div>
        <div className="ml-auto hidden items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-400/30 sm:flex">
          <CheckCircle2 size={14} /> 已登录 · 状态正常
        </div>
      </section>

      {/* 外观主题 */}
      <section className="dv-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Palette size={18} className="text-violet-300" />
          <h3 className="text-base font-semibold text-slate-100">外观主题</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'dark', label: '深色', desc: '默认指挥大屏' },
            { id: 'light', label: '浅色', desc: '日间办公' },
            { id: 'system', label: '跟随系统', desc: '自动切换' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`rounded-lg border p-3 text-left transition ${
                theme === t.id
                  ? 'border-violet-400/60 bg-violet-500/10'
                  : 'border-slate-700/60 bg-slate-800/40 hover:border-violet-500/40'
              }`}
            >
              <div className="text-sm font-semibold text-slate-100">{t.label}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">{t.desc}</div>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}

