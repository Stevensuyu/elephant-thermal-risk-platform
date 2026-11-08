'use client'

import { useEffect, useState } from 'react'
import { BarChart3, ScanSearch, BrainCircuit, LogOut, ShieldCheck, BellRing, Settings2, ClipboardList, MonitorPlay, ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react'
import { ROLES, dataScopeLabel, accountOf, type RoleId } from '@/lib/auth/auth-role-permissions'

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  currentRole: RoleId
  currentUser: string
  currentName: string
  onLogout: () => void
  pendingCount?: number
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const COLLAPSE_KEY = 'elephant_sidebar_collapsed'

export default function Sidebar({ activeTab, onTabChange, currentRole, currentUser, currentName, onLogout, pendingCount = 0, mobileOpen = false, onMobileClose }: SidebarProps) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  // 桌面端可收回:收起后仅保留图标列;移动端抽屉行为不变
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
    }
  }, [])

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('zh-CN', { hour12: false }))
      setDate(now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }))
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  const menuItems = [
    { id: 'screen',   label: '数据大屏', icon: MonitorPlay,  color: 'from-cyan-500 to-blue-400' },
    { id: 'dashboard', label: '态势总览', icon: BarChart3,   color: 'from-blue-500 to-cyan-400' },
    { id: 'mytasks',   label: '我的任务', icon: ClipboardList, color: 'from-violet-500 to-purple-400' },
    { id: 'monitor',   label: '实时监控', icon: ScanSearch,  color: 'from-emerald-500 to-teal-400' },
    { id: 'judge',     label: '警情研判', icon: BrainCircuit, color: 'from-violet-500 to-purple-400' },
    { id: 'alerts',    label: '警情中心', icon: BellRing,     color: 'from-amber-500 to-orange-400' },
    { id: 'settings',  label: '系统设置', icon: Settings2,     color: 'from-slate-500 to-slate-400' },
  ]

  // 手机端:点击菜单项后关闭抽屉
  const handleTabChange = (tab: string) => {
    onTabChange(tab)
    if (onMobileClose) onMobileClose()
  }

  const acc = accountOf(currentRole)
  const isCollapsed = collapsed

  return (
    <>
      {/* 手机端遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-blue-800/50 transition-all duration-300 md:static md:z-auto md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-[68px]' : 'md:w-[248px]'} w-[260px]`}
        style={{ background: 'rgba(30, 58, 138, 0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
      {/* Logo */}
      <div className={`relative mx-3 mt-4 mb-5 overflow-hidden rounded-xl border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-900/40 backdrop-blur-sm ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`relative ${isCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-3'}`}>
          {/* 天眼护下 徽标:天眼（雷达环+瞳孔）+ 护盾弧 */}
          <svg width={isCollapsed ? 34 : 42} height={isCollapsed ? 34 : 42} viewBox="0 0 48 48" fill="none" className="shrink-0">
            <defs>
              <linearGradient id="tyhxGrad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                <stop stopColor="#22d3ee" />
                <stop offset="1" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            <circle cx="24" cy="21" r="17" stroke="url(#tyhxGrad)" strokeWidth="2.4" opacity="0.5" />
            <path d="M24 21 L24 4 A17 17 0 0 1 38 31 Z" fill="url(#tyhxGrad)" opacity="0.15" />
            <circle cx="24" cy="21" r="9" stroke="url(#tyhxGrad)" strokeWidth="2.2" />
            <circle cx="24" cy="21" r="3.6" fill="url(#tyhxGrad)" />
            <path d="M9 40 Q24 47 39 40" stroke="url(#tyhxGrad)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
          {!isCollapsed && (
            <div className="leading-tight">
              <div
                className="bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-[21px] font-black tracking-[0.22em] text-transparent"
                style={{ fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' }}
              >
                天眼护象
              </div>
            </div>
          )}
          {/* 收回/展开按钮 */}
          <button
            onClick={toggleCollapse}
            title={isCollapsed ? '展开侧边栏' : '收回侧边栏'}
            className={`hidden cursor-pointer items-center justify-center rounded-md border border-slate-700/60 p-1 text-slate-400 transition hover:bg-slate-700/50 hover:text-cyan-200 md:flex ${
              isCollapsed ? '' : 'ml-auto'
            }`}
          >
            {isCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        </div>
        {!isCollapsed && (
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-slate-300">{time}</span>
            <span className="text-[11px] text-slate-500">{date}</span>
          </div>
        )}
      </div>

      {/* 当前登录用户信息 */}
      <div className={`mx-3 mb-3 rounded-xl border border-slate-800/40 bg-slate-800/20 ${isCollapsed ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col gap-2' : ''}`}>
          {/* 头像占位 */}
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${acc.grad} text-lg font-black text-white shadow-lg ${isCollapsed ? 'h-9 w-9 text-sm' : ''}`} title={isCollapsed ? `${currentName}（${ROLES[currentRole].name}）` : undefined}>
            {acc.avatarText}
          </div>
          {!isCollapsed && (
            <>
              {/* 名字 + 账号/角色副标题 */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold leading-tight text-slate-100">{currentName}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                    <ShieldCheck size={10} /> {ROLES[currentRole].name}
                  </span>
                  <span className="truncate text-[11px] text-slate-500">{currentUser}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-600">{dataScopeLabel(currentRole)}</div>
              </div>
              {/* 退出登录 */}
              <button
                onClick={onLogout}
                title="退出登录"
                className="shrink-0 cursor-pointer rounded-md border border-slate-700/60 p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
              >
                <LogOut size={15} />
              </button>
            </>
          )}
        </div>
        {isCollapsed && (
          <button
            onClick={onLogout}
            title="退出登录"
            className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-md border border-slate-700/60 p-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
          >
            <LogOut size={13} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {menuItems.filter((m) => ROLES[currentRole].menus.includes(m.id)).map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`group relative flex w-full items-center rounded-lg text-left text-sm transition-all duration-200 ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              {isActive && (
                <div className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b ${item.color}`} />
              )}
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                isActive ? `bg-gradient-to-br ${item.color} shadow-lg` : 'bg-slate-800/50 group-hover:bg-slate-700/50'
              }`}>
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} />
              </div>
              {!isCollapsed && <span className="font-medium">{item.label}</span>}
              {item.id === 'mytasks' && pendingCount > 0 && (
                isCollapsed ? (
                  <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                ) : (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )
              )}
            </button>
          )
        })}
      </nav>

      {!isCollapsed && (
        <div className="mx-3 mb-4 rounded-xl border border-slate-800/40 bg-slate-800/20 p-3.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="dv-dot-online" />
            <span className="font-medium text-slate-300">系统运行正常</span>
          </div>
        </div>
      )}
    </aside>
    </>
  )
}
