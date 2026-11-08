'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Shield, FileText, Users, Download, RefreshCw, CheckCircle2,
  AlertTriangle, Eye, Clock, UserCheck, Lock, Plus,
} from 'lucide-react'
import { isWatermarkEnabled, setWatermarkEnabled } from '@/components/common/common-watermark-layer'
import type { WatermarkConfig } from '@/lib/store/store-watermark-config'
import { LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'
import LoginLogsPanel from '@/components/settings/settings-login-logs-panel'
import CommonPagination from '@/components/common/common-pagination'

interface LogEntry {
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
}

interface LogQueryResult {
  total: number
  page: number
  pageSize: number
  logs: LogEntry[]
}

const ROLE_LABEL: Record<string, string> = {
  admin: '系统管理员', center: '管理中心', street: '街道干部', police: '警员',
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'logs' | 'loginLogs' | 'watermark' | 'users'>('logs')
  // 日志
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [actionFilter, setActionFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; brokenAt: number | null } | null>(null)
  const [detailLog, setDetailLog] = useState<LogEntry | null>(null)
  // 水印
  const [wmEnabled, setWmEnabled] = useState(true)
  const [wmConfig, setWmConfig] = useState<WatermarkConfig>({
    enabled: true, content: 'username_time', customText: '', fontSize: 14,
    fontFamily: 'monospace', opacity: 12, direction: 'diagonal25', density: 320,
    color: 'gray',
  })
  const [wmSaving, setWmSaving] = useState(false)
  // 用户
  const [users, setUsers] = useState<any[]>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [userForm, setUserForm] = useState({ account: '', name: '', role: 'police' as 'admin'|'center'|'street'|'police', password: '', phone: '' })
  const [userSaving, setUserSaving] = useState(false)
  const [userMsg, setUserMsg] = useState<{ type: 'success'|'error', text: string } | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/logs?page=1&pageSize=10000', { cache: 'no-store' })
      const d: LogQueryResult = await r.json()
      setLogs(d.logs || [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 客户端预过滤（操作类型/角色）+ 时间倒序
  const filteredLogs = useMemo(() => {
    let result = logs
    if (actionFilter) result = result.filter((l) => l.action === actionFilter)
    if (roleFilter) result = result.filter((l) => l.role === roleFilter)
    return [...result].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  }, [logs, actionFilter, roleFilter])

  useEffect(() => {
    if (activeTab === 'logs') fetchLogs()
    if (activeTab === 'watermark') { setWmEnabled(isWatermarkEnabled()); loadWmConfig() }
    if (activeTab === 'users') {
      fetch('/api/users', { cache: 'no-store' }).then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => setUsers([]))
    }
  }, [activeTab, fetchLogs])

  const exportCSV = async () => {
    try {
      const r = await fetch('/api/logs/export', { cache: 'no-store' })
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }

  const verifyChain = async () => {
    try {
      const r = await fetch('/api/logs/verify', { cache: 'no-store' })
      const d = await r.json()
      setVerifyResult(d)
    } catch {
      setVerifyResult({ valid: false, brokenAt: -1 })
    }
  }

  const toggleWatermark = () => {
    const next = !wmEnabled
    setWmEnabled(next)
    setWatermarkEnabled(next)
    window.dispatchEvent(new StorageEvent('storage', { key: 'tyhx_watermark_enabled' }))
    // 同步到服务端
    fetch('/api/watermark-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {})
  }

  // 加载水印配置
  const loadWmConfig = () => {
    fetch('/api/watermark-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.config) { setWmConfig(d.config); setWmEnabled(d.config.enabled) } })
      .catch(() => {})
  }

  // 保存水印配置
  const saveWmConfig = async (patch: Partial<WatermarkConfig>) => {
    if (!wmConfig) return
    const next = { ...wmConfig, ...patch }
    setWmConfig(next)
    setWmSaving(true)
    try {
      await fetch('/api/watermark-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (patch.enabled !== undefined) {
        setWatermarkEnabled(patch.enabled)
        window.dispatchEvent(new StorageEvent('storage', { key: 'tyhx_watermark_enabled' }))
      }
    } catch { /* ignore */ } finally {
      setWmSaving(false)
      // 通知Watermark组件配置已更新，实时刷新
      window.dispatchEvent(new CustomEvent('watermark-config-updated'))
    }
  }

  // 提取隐藏水印（当前页面零宽字符）


  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-800/40 p-1">
        {[
          { key: 'logs', label: '操作日志', icon: FileText },
          { key: 'loginLogs', label: '登录日志', icon: Clock },
          { key: 'watermark', label: '水印设置', icon: Shield },
          { key: 'users', label: '用户管理', icon: Users },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition ${
              activeTab === t.key ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* 操作日志 */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value) }} className="rounded-md border border-slate-600/60 bg-slate-800/60 px-2 py-1.5 text-[12px] text-white outline-none">
              <option value="">全部操作</option>
              {Object.values(LOG_ACTIONS).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value) }} className="rounded-md border border-slate-600/60 bg-slate-800/60 px-2 py-1.5 text-[12px] text-white outline-none">
              <option value="">全部角色</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={fetchLogs} className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 px-2.5 py-1.5 text-[12px] text-slate-300 hover:bg-slate-700/40">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
            </button>
            <button onClick={exportCSV} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-500/20">
              <Download size={12} /> 导出CSV
            </button>
            <button onClick={verifyChain} className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/10 px-2.5 py-1.5 text-[12px] text-sky-200 hover:bg-sky-500/20">
              <Shield size={12} /> 哈希校验
            </button>
          </div>

          {verifyResult && (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${verifyResult.valid ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
              {verifyResult.valid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {verifyResult.valid ? '日志哈希链完整，未被篡改' : `日志可能被篡改（位置：${verifyResult.brokenAt}）`}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-slate-400">
              <RefreshCw size={16} className="mr-2 animate-spin" /> 加载操作日志…
            </div>
          ) : (
            <CommonPagination
              items={filteredLogs}
              searchKeys={['userName', 'action', 'detail', 'role', 'timestamp']}
              pageSize={10}
              searchPlaceholder="搜索操作日志..."
              emptyText="暂无日志记录"
            >
              {(pageItems) => (
                <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-800/60 text-slate-400">
                        <th className="px-3 py-2 text-left font-medium">时间</th>
                        <th className="px-3 py-2 text-left font-medium">用户</th>
                        <th className="px-3 py-2 text-left font-medium">角色</th>
                        <th className="px-3 py-2 text-left font-medium">操作</th>
                        <th className="px-3 py-2 text-left font-medium">详情</th>
                        <th className="px-3 py-2 text-left font-medium">结果</th>
                        <th className="px-3 py-2 text-left font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((log) => (
                        <tr key={log.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2 text-slate-200">{log.userName}</td>
                          <td className="px-3 py-2"><span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{ROLE_LABEL[log.role] || log.role}</span></td>
                          <td className="px-3 py-2 text-slate-300">{log.action}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[300px] truncate">{log.detail}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${log.result === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                              {log.result === 'success' ? <CheckCircle2 size={9} /> : <AlertTriangle size={9} />}
                              {log.result === 'success' ? '成功' : '失败'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => setDetailLog(log)} className="rounded p-1 text-slate-400 hover:bg-slate-700/40 hover:text-sky-300" title="查看详情">
                              <Eye size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CommonPagination>
          )}
        </div>
      )}

      {/* 登录日志 */}
      {activeTab === 'loginLogs' && <LoginLogsPanel />}

      {/* 水印设置 */}
      {activeTab === 'watermark' && (
        <div className="space-y-5 rounded-lg border border-slate-700/50 bg-slate-800/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-violet-300" />
              <span className="text-sm font-semibold text-slate-100">全局水印配置</span>
              {wmSaving && <span className="text-[10px] text-violet-400">保存中...</span>}
            </div>
            <button
              onClick={() => saveWmConfig({ enabled: !wmConfig.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${wmConfig.enabled ? 'bg-violet-600' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${wmConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* 水印内容 */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400">水印内容</label>
              <div className="flex gap-2">
                <button
                  onClick={() => saveWmConfig({ content: 'username_time' })}
                  className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition ${wmConfig.content === 'username_time' ? 'border-violet-500/50 bg-violet-500/15 text-violet-200' : 'border-slate-600/50 bg-slate-800/40 text-slate-400 hover:border-slate-500'}`}
                >用户名+时间</button>
                <button
                  onClick={() => saveWmConfig({ content: 'custom' })}
                  className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition ${wmConfig.content === 'custom' ? 'border-violet-500/50 bg-violet-500/15 text-violet-200' : 'border-slate-600/50 bg-slate-800/40 text-slate-400 hover:border-slate-500'}`}
                >自定义文字</button>
              </div>
              {wmConfig.content === 'custom' && (
                <input
                  type="text"
                  value={wmConfig.customText || ''}
                  onChange={(e) => setWmConfig({ ...wmConfig, customText: e.target.value })}
                  onBlur={() => saveWmConfig({ customText: wmConfig.customText })}
                  placeholder="输入自定义水印文字"
                  className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
                />
              )}
            </div>

            {/* 字体大小 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-400">字体大小</label>
                <span className="text-[11px] text-violet-300">{wmConfig.fontSize || 14}px</span>
              </div>
              <input
                type="range" min={12} max={72} value={wmConfig.fontSize || 14}
                onChange={(e) => setWmConfig({ ...wmConfig, fontSize: Number(e.target.value) })}
                onMouseUp={() => saveWmConfig({ fontSize: wmConfig.fontSize })}
                className="w-full accent-violet-500"
              />
            </div>

            {/* 字体 */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400">字体</label>
              <select
                value={wmConfig.fontFamily || 'monospace'}
                onChange={(e) => saveWmConfig({ fontFamily: e.target.value })}
                className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="monospace">等宽字体</option>
                <option value="SimSun">宋体</option>
                <option value="SimHei">黑体</option>
                <option value="Microsoft YaHei">微软雅黑</option>
                <option value="Arial">Arial</option>
              </select>
            </div>

            {/* 透明度 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-400">透明度</label>
                <span className="text-[11px] text-violet-300">{wmConfig.opacity || 12}%</span>
              </div>
              <input
                type="range" min={1} max={100} value={wmConfig.opacity || 12}
                onChange={(e) => setWmConfig({ ...wmConfig, opacity: Number(e.target.value) })}
                onMouseUp={() => saveWmConfig({ opacity: wmConfig.opacity })}
                className="w-full accent-violet-500"
              />
            </div>

            {/* 方向/倾斜角度 */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400">方向/倾斜角度</label>
              <div className="flex gap-1">
                {[
                  { v: 'horizontal', l: '水平' },
                  { v: 'diagonal25', l: '-25°' },
                  { v: 'diagonal45', l: '-45°' },
                  { v: 'vertical', l: '垂直' },
                ].map((d) => (
                  <button
                    key={d.v}
                    onClick={() => saveWmConfig({ direction: d.v })}
                    className={`flex-1 rounded border px-1 py-1 text-[10px] transition ${wmConfig.direction === d.v ? 'border-violet-500/50 bg-violet-500/15 text-violet-200' : 'border-slate-600/50 bg-slate-800/40 text-slate-400 hover:border-slate-500'}`}
                  >{d.l}</button>
                ))}
              </div>
            </div>

            {/* 密度/间距 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-400">平铺密度</label>
                <span className="text-[11px] text-violet-300">{wmConfig.density || 320}px</span>
              </div>
              <input
                type="range" min={120} max={500} value={wmConfig.density || 320}
                onChange={(e) => setWmConfig({ ...wmConfig, density: Number(e.target.value) })}
                onMouseUp={() => saveWmConfig({ density: wmConfig.density })}
                className="w-full accent-violet-500"
              />
            </div>

            {/* 颜色 */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400">水印颜色</label>
              <div className="flex gap-2">
                {[
                  { v: 'gray', c: '#9ca3af', l: '灰' },
                  { v: 'white', c: '#ffffff', l: '白' },
                  { v: 'black', c: '#000000', l: '黑' },
                  { v: 'red', c: '#ef4444', l: '红' },
                ].map((c) => (
                  <button
                    key={c.v}
                    onClick={() => saveWmConfig({ color: c.v })}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] transition ${wmConfig.color === c.v ? 'border-violet-400 scale-110' : 'border-slate-600 hover:border-slate-400'}`}
                    style={{ backgroundColor: c.c, color: c.v === 'white' || c.v === 'gray' ? '#000' : '#fff' }}
                  >{c.l}</button>
                ))}
              </div>
            </div>
          </div>


          <div className={`flex items-center gap-2 text-[12px] ${wmConfig.enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
            {wmConfig.enabled ? <CheckCircle2 size={14} /> : <Lock size={14} />}
            {wmConfig.enabled ? '水印已启用，所有修改实时生效' : '水印已关闭'}
          </div>
        </div>
      )}

      {/* 用户管理 */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-cyan-300" />
              <span className="text-sm font-semibold text-slate-100">用户管理</span>
              <span className="text-[11px] text-slate-500">共 {users.length} 个用户</span>
            </div>
            <button
              onClick={() => { setEditingUser(null); setUserForm({ account: '', name: '', role: 'police', password: '', phone: '' }); setShowUserForm(true); setUserMsg(null) }}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600/80 px-3 py-1.5 text-[12px] text-white hover:bg-cyan-500 transition"
            ><Plus size={14} /> 添加用户</button>
          </div>

          {userMsg && (
            <div className={`rounded-lg px-3 py-2 text-[12px] ${userMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/30'}`}>
              {userMsg.text}
            </div>
          )}

          {/* 添加/编辑用户表单 */}
          {showUserForm && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-200">{editingUser ? '编辑用户' : '添加用户'}</span>
                <button onClick={() => setShowUserForm(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">账号 *</label>
                  <input type="text" value={userForm.account} onChange={(e) => setUserForm({ ...userForm, account: e.target.value })} placeholder="登录账号" className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-cyan-500/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">姓名 *</label>
                  <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="用户姓名" className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-cyan-500/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">角色 *</label>
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })} className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-cyan-500/50 focus:outline-none">
                    <option value="admin">管理员</option>
                    <option value="center">管理中心</option>
                    <option value="street">街道干部</option>
                    <option value="police">警员</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">密码 {editingUser ? '(留空不修改)' : '*'}</label>
                  <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser ? '留空不修改' : '登录密码'} className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-cyan-500/50 focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">联系电话</label>
                  <input type="text" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="手机号码" className="w-full rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200 focus:border-cyan-500/50 focus:outline-none" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={userSaving}
                  onClick={async () => {
                    if (!userForm.account || !userForm.name) { setUserMsg({ type: 'error', text: '账号和姓名为必填' }); return }
                    if (!editingUser && !userForm.password) { setUserMsg({ type: 'error', text: '密码为必填' }); return }
                    setUserSaving(true)
                    try {
                      const body: any = { account: userForm.account, name: userForm.name, role: userForm.role, phone: userForm.phone }
                      if (userForm.password) body.password = userForm.password
                      const url = editingUser ? '/api/users' : '/api/users'
                      const method = editingUser ? 'PATCH' : 'POST'
                      if (editingUser) body.id = editingUser.id
                      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                      const d = await r.json()
                      if (d.success) {
                        setUserMsg({ type: 'success', text: editingUser ? '用户已更新' : '用户已添加，可使用该账号登录' })
                        setShowUserForm(false)
                        fetch('/api/users', { cache: 'no-store' }).then((r) => r.json()).then((d) => setUsers(d.users || []))
                      } else {
                        setUserMsg({ type: 'error', text: d.error || '操作失败' })
                      }
                    } catch { setUserMsg({ type: 'error', text: '网络错误' }) }
                    finally { setUserSaving(false) }
                  }}
                  className="rounded bg-cyan-600/80 px-4 py-1.5 text-[12px] text-white hover:bg-cyan-500 transition disabled:opacity-50"
                >{userSaving ? '保存中...' : (editingUser ? '保存修改' : '确认添加')}</button>
                <button onClick={() => setShowUserForm(false)} className="rounded border border-slate-600/50 px-4 py-1.5 text-[12px] text-slate-400 hover:bg-slate-700/40 transition">取消</button>
              </div>
            </div>
          )}

          {/* 用户列表 */}
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/60 text-slate-400">
                  <th className="px-3 py-2 text-left font-medium">账号</th>
                  <th className="px-3 py-2 text-left font-medium">姓名</th>
                  <th className="px-3 py-2 text-left font-medium">角色</th>
                  <th className="px-3 py-2 text-left font-medium">联系电话</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-slate-300">{u.account}</td>
                    <td className="px-3 py-2 text-slate-100">{u.name}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{ROLE_LABEL[u.role] || u.role}</span></td>
                    <td className="px-3 py-2 text-slate-400">{u.phone || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${u.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
                        <UserCheck size={9} /> {u.status === 'active' ? '活跃' : '禁用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditingUser(u); setUserForm({ account: u.account, name: u.name, role: u.role, password: '', phone: u.phone || '' }); setShowUserForm(true); setUserMsg(null) }}
                          className="rounded px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10 transition"
                        >编辑</button>
                        <button
                          onClick={async () => {
                            if (!confirm(`确定重置用户「${u.name}」的密码为 tyhx2026？`)) return
                            const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, password: 'tyhx2026' }) })
                            const d = await r.json()
                            setUserMsg(d.success ? { type: 'success', text: `已重置 ${u.name} 的密码为 tyhx2026` } : { type: 'error', text: d.error || '重置失败' })
                          }}
                          className="rounded px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/10 transition"
                        >重置密码</button>
                        <button
                          disabled={u.account === 'admin'}
                          onClick={async () => {
                            if (!confirm(`确定删除用户「${u.name}」？此操作不可恢复。`)) return
                            const r = await fetch(`/api/users?id=${u.id}`, { method: 'DELETE' })
                            const d = await r.json()
                            if (d.success) {
                              setUserMsg({ type: 'success', text: '用户已删除' })
                              fetch('/api/users', { cache: 'no-store' }).then((r) => r.json()).then((d) => setUsers(d.users || []))
                            } else {
                              setUserMsg({ type: 'error', text: d.error || '删除失败' })
                            }
                          }}
                          className="rounded px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title={u.account === 'admin' ? '管理员账号不可删除' : '删除用户'}
                        >删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 日志详情弹窗 */}
      {detailLog && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4" onClick={() => setDetailLog(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-700/50 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">日志详情</h3>
              <button onClick={() => setDetailLog(null)} className="rounded p-1 text-slate-400 hover:bg-slate-700/40">✕</button>
            </div>
            <div className="space-y-2 text-[12px]">
              <div className="flex"><span className="w-20 text-slate-500">日志ID</span><span className="font-mono text-slate-300">{detailLog.id}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">时间</span><span className="text-slate-300">{new Date(detailLog.timestamp).toLocaleString('zh-CN')}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">用户</span><span className="text-slate-300">{detailLog.userName}（{detailLog.userId}）</span></div>
              <div className="flex"><span className="w-20 text-slate-500">角色</span><span className="text-slate-300">{ROLE_LABEL[detailLog.role] || detailLog.role}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">操作</span><span className="text-slate-300">{detailLog.action}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">详情</span><span className="flex-1 text-slate-300">{detailLog.detail}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">IP</span><span className="font-mono text-slate-300">{detailLog.ip}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">结果</span><span className={detailLog.result === 'success' ? 'text-emerald-300' : 'text-rose-300'}>{detailLog.result === 'success' ? '成功' : '失败'}</span></div>
              <div className="flex"><span className="w-20 text-slate-500">哈希</span><span className="flex-1 break-all font-mono text-[10px] text-slate-500">{detailLog.hash}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
