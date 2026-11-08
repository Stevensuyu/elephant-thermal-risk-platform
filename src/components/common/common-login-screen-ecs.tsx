'use client'

import { useState } from 'react'
import { ShieldAlert, Radar, Eye, LogIn, Lock, User as UserIcon, Loader2, AlertTriangle, Thermometer } from 'lucide-react'
import type { RoleId } from '@/lib/auth/auth-role-permissions'

export interface LoginResult {
  role: RoleId
  user: string
  name: string
}

export default function LoginScreen({ onLogin }: { onLogin: (r: LoginResult) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        onLogin({ role: d.role as RoleId, user: d.user, name: d.name })
      } else {
        setError(d.error || '账号或密码错误')
      }
    } catch {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dv-grid-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* 动态光晕背景 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-[100px] animate-pulse" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-500/10 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-[80px]" />
      </div>

      {/* 热成像主题装饰 - 大象轮廓 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 opacity-[0.03]">
        <svg viewBox="0 0 800 200" className="h-full w-full" fill="currentColor" style={{ color: '#35f0ff' }}>
          <path d="M0,200 L0,160 Q50,140 80,150 Q100,100 150,110 Q180,80 220,90 Q260,60 300,80 Q340,50 380,70 Q420,40 460,60 Q500,30 540,55 Q580,35 620,60 Q660,45 700,70 Q740,55 800,80 L800,200 Z" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* 头部品牌 */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="dv-glow-cyan relative mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-sm">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-transparent" />
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="relative">
              <defs>
                <linearGradient id="tyhxLogin" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="21" r="17" stroke="url(#tyhxLogin)" strokeWidth="2.4" opacity="0.5" />
              <path d="M24 21 L24 4 A17 17 0 0 1 38 31 Z" fill="url(#tyhxLogin)" opacity="0.15" />
              <circle cx="24" cy="21" r="9" stroke="url(#tyhxLogin)" strokeWidth="2.2" />
              <circle cx="24" cy="21" r="3.6" fill="url(#tyhxLogin)" />
              <path d="M9 40 Q24 47 39 40" stroke="url(#tyhxLogin)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            {/* 扫描线效果 */}
            <div className="dv-scan absolute inset-0 overflow-hidden rounded-2xl" />
          </div>
          <h1 className="bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-3xl font-black tracking-[0.18em] text-transparent">
            天眼护象
          </h1>
          <p className="mt-2 text-sm tracking-[0.12em] text-slate-400">象群入侵风险智能研判与警情联动大屏</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/8 px-3 py-1 text-[11px] text-cyan-300/90">
            <Lock size={12} /> 请输入账号密码登录系统
          </div>
        </div>

        {/* 登录表单 - 玻璃拟态 */}
        <form
          onSubmit={handleSubmit}
          className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-7 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {/* 顶部光带 */}
          <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

          <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
            <UserIcon size={13} className="text-cyan-400/80" /> 账号
          </label>
          <div className="relative mb-4">
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入账号"
              className="dv-input w-full border-cyan-400/10 bg-slate-950/50 !pl-10 !pr-3 py-2.5 text-sm transition-all focus:border-cyan-400/40 focus:shadow-[0_0_0_3px_rgba(53,240,255,0.08)]"
            />
            <UserIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>

          <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
            <Lock size={13} className="text-cyan-400/80" /> 密码
          </label>
          <div className="relative mb-2">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="dv-input w-full border-cyan-400/10 bg-slate-950/50 !pl-10 !pr-3 py-2.5 text-sm transition-all focus:border-cyan-400/40 focus:shadow-[0_0_0_3px_rgba(53,240,255,0.08)]"
            />
            <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>

          {error && (
            <div className="dv-error-banner mb-3 mt-1">
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="dv-btn dv-btn-primary mt-3 w-full py-3 text-sm font-bold transition-all hover:shadow-[0_0_20px_rgba(53,240,255,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
            {loading ? '登录中…' : '登录系统'}
          </button>
        </form>

        {/* 底部特性标签 */}
        <div className="mt-6 flex items-center justify-center gap-5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5 transition hover:text-emerald-400">
            <Radar size={12} className="text-emerald-400/70" /> 感知接入
          </span>
          <span className="h-3 w-px bg-slate-700/50" />
          <span className="inline-flex items-center gap-1.5 transition hover:text-sky-400">
            <Eye size={12} className="text-sky-400/70" /> 实时监控
          </span>
          <span className="h-3 w-px bg-slate-700/50" />
          <span className="inline-flex items-center gap-1.5 transition hover:text-rose-400">
            <ShieldAlert size={12} className="text-rose-400/70" /> 预警研判
          </span>
          <span className="h-3 w-px bg-slate-700/50" />
          <span className="inline-flex items-center gap-1.5 transition hover:text-orange-400">
            <Thermometer size={12} className="text-orange-400/70" /> 热成像
          </span>
        </div>

        <div className="mt-4 text-center text-[10px] text-slate-600">
          版本 v2.0.0 · 天眼护象智能研判平台 © 2025
        </div>
      </div>
    </div>
  )
}
