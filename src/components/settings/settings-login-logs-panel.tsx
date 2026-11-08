'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { RefreshCw, Download, AlertTriangle, CheckCircle2, XCircle, Monitor, Smartphone, Tablet, MapPin, Clock, User } from 'lucide-react'
import CommonPagination from '@/components/common/common-pagination'

interface LoginLog {
  id: string
  sessionId: string
  userId: string
  userName: string
  role: string
  ip: string
  location: string
  userAgent: string
  browser: string
  os: string
  deviceType: string
  success: boolean
  failReason?: string
  timestamp: string
  isNewDevice: boolean
  isNewLocation: boolean
  isSuspicious: boolean
}

const ROLE_LABEL: Record<string, string> = {
  admin: '系统管理员', center: '管理中心', street: '街道干部', police: '警员',
}

export default function LoginLogsPanel() {
  const [logs, setLogs] = useState<LoginLog[]>([])
  const [loading, setLoading] = useState(false)
  const [resultFilter, setResultFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/login-logs?limit=500', { cache: 'no-store' })
      const d = await r.json()
      setLogs(Array.isArray(d.logs) ? d.logs : [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // 客户端预过滤（结果/用户）+ 时间倒序
  const filteredLogs = useMemo(() => {
    let result = logs
    if (resultFilter === 'success') result = result.filter((l) => l.success)
    if (resultFilter === 'fail') result = result.filter((l) => !l.success)
    if (userFilter) result = result.filter((l) => l.userId === userFilter || l.userName.includes(userFilter))
    return [...result].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  }, [logs, resultFilter, userFilter])

  const exportCSV = () => {
    const header = '时间,用户,角色,IP,地点,设备,浏览器,操作系统,结果,失败原因,异常标记,会话ID\n'
    const rows = logs.map((l) =>
      [
        new Date(l.timestamp).toLocaleString('zh-CN'),
        l.userName,
        ROLE_LABEL[l.role] || l.role,
        l.ip,
        l.location,
        l.deviceType,
        l.browser,
        l.os,
        l.success ? '成功' : '失败',
        l.failReason || '',
        l.isSuspicious ? '是' : '否',
        l.sessionId,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    ).join('\n')
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `登录日志_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const DeviceIcon = ({ type }: { type: string }) => {
    if (type === '手机') return <Smartphone size={12} />
    if (type === '平板') return <Tablet size={12} />
    return <Monitor size={12} />
  }

  return (
    <div className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-md border border-slate-600/60 bg-slate-800/60 px-2 py-1.5 text-[12px] text-white outline-none">
          <option value="">全部用户</option>
          <option value="admin">管理员</option>
          <option value="center01">管理中心</option>
          <option value="street01">街道干部</option>
          <option value="police01">警员</option>
        </select>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="rounded-md border border-slate-600/60 bg-slate-800/60 px-2 py-1.5 text-[12px] text-white outline-none">
          <option value="">全部结果</option>
          <option value="success">登录成功</option>
          <option value="fail">登录失败</option>
        </select>
        <button onClick={fetchLogs} className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 px-2.5 py-1.5 text-[12px] text-slate-300 hover:bg-slate-700/40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
        <button onClick={exportCSV} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-500/20">
          <Download size={12} /> 导出CSV
        </button>
      </div>

      {/* 统计 */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded bg-slate-800/60 px-2 py-1 text-slate-300">共 {logs.length} 条记录</span>
        <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-200">成功 {logs.filter((l) => l.success).length}</span>
        <span className="rounded bg-rose-500/10 px-2 py-1 text-rose-200">失败 {logs.filter((l) => !l.success).length}</span>
        <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-200">异常 {logs.filter((l) => l.isSuspicious).length}</span>
      </div>

      {/* 日志列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[12px] text-slate-400">
          <RefreshCw size={16} className="mr-2 animate-spin" /> 加载登录日志…
        </div>
      ) : (
        <CommonPagination
          items={filteredLogs}
          searchKeys={['userName', 'role', 'ip', 'location', 'browser', 'os', 'deviceType', 'timestamp']}
          pageSize={10}
          searchPlaceholder="搜索登录日志..."
          emptyText="暂无登录日志记录"
        >
          {(pageItems) => (
            <div className="space-y-1.5">
              {pageItems.map((l) => (
                <div
                  key={l.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[11px] ${
                    l.isSuspicious ? 'border-amber-400/30 bg-amber-500/5' : 'border-slate-700/40 bg-slate-800/30'
                  }`}
                >
                  {l.success ? (
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle size={14} className="shrink-0 text-rose-400" />
                  )}
                  <div className="flex items-center gap-1">
                    <User size={11} className="text-slate-500" />
                    <span className="font-medium text-slate-200">{l.userName}</span>
                    <span className="text-slate-500">({ROLE_LABEL[l.role] || l.role})</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <Clock size={11} />
                    {new Date(l.timestamp).toLocaleString('zh-CN')}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <MapPin size={11} />
                    <span className="font-mono">{l.ip}</span>
                    <span className="text-slate-500">{l.location}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <DeviceIcon type={l.deviceType} />
                    <span>{l.deviceType}</span>
                    <span className="text-slate-500">· {l.browser}</span>
                    <span className="text-slate-500">· {l.os}</span>
                  </div>
                  {!l.success && l.failReason && (
                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">{l.failReason}</span>
                  )}
                  {l.isSuspicious && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200 ring-1 ring-amber-400/30">
                      <AlertTriangle size={10} />
                      {l.isNewDevice ? '新设备' : ''}{l.isNewLocation ? ' 新地点' : ''}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-slate-600">{l.sessionId.slice(0, 16)}…</span>
                </div>
              ))}
            </div>
          )}
        </CommonPagination>
      )}
    </div>
  )
}
