// 设置页 - 检测服务日志查看面板
// 功能：实时查看检测服务日志，支持自动刷新、日志级别颜色区分、滚动到底部
'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Trash2, Terminal, ChevronDown, ChevronUp } from 'lucide-react'

const LOG_API = '/api/detect/logs'

interface LogEntry {
  text: string
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'DEBUG' | 'UNKNOWN'
  time: string
}

function parseLogLine(line: string): LogEntry {
  // 日志格式: 2026-09-10 13:22:26,123 [INFO] detect: ...
  const levelMatch = line.match(/\[(INFO|WARNING|ERROR|CRITICAL|DEBUG)\]/)
  const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[,\d]*)/)
  return {
    text: line,
    level: (levelMatch?.[1] as LogEntry['level']) || 'UNKNOWN',
    time: timeMatch?.[1] || '',
  }
}

function getLevelColor(level: LogEntry['level']): string {
  switch (level) {
    case 'INFO':
      return 'text-emerald-300'
    case 'WARNING':
      return 'text-amber-300'
    case 'ERROR':
      return 'text-rose-400'
    case 'CRITICAL':
      return 'text-red-500 font-bold'
    case 'DEBUG':
      return 'text-slate-400'
    default:
      return 'text-slate-300'
  }
}

export default function SettingsLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [logFile, setLogFile] = useState('')
  const [returnedLines, setReturnedLines] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState('')
  const logContainerRef = useRef<HTMLDivElement>(null)
  const autoRefreshRef = useRef(autoRefresh)

  useEffect(() => {
    autoRefreshRef.current = autoRefresh
  }, [autoRefresh])

  const fetchLogs = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${LOG_API}?lines=300`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.ok) {
        const parsed = (data.logs || []).map(parseLogLine)
        setLogs(parsed)
        setLogFile(data.current_file || '')
        setReturnedLines(data.returned_lines || 0)
      } else {
        setError(data.error || '获取日志失败')
      }
    } catch (e: any) {
      setError(e.message || '获取日志失败')
    } finally {
      setLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    fetchLogs()
  }, [])

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        fetchLogs()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const clearLogs = async () => {
    if (!confirm('确定要清空日志文件吗？此操作不可恢复。')) return
    try {
      // 调用后端清空日志（如果支持），否则只清空前端显示
      setLogs([])
    } catch (e) {
      console.error('清空日志失败', e)
    }
  }

  const stats = {
    info: logs.filter((l) => l.level === 'INFO').length,
    warning: logs.filter((l) => l.level === 'WARNING').length,
    error: logs.filter((l) => l.level === 'ERROR' || l.level === 'CRITICAL').length,
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
      {/* 标题栏 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">检测服务日志</h3>
          {logFile && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
              {logFile}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 统计 */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-emerald-300">INFO {stats.info}</span>
            <span className="text-amber-300">WARN {stats.warning}</span>
            <span className="text-rose-400">ERR {stats.error}</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title={expanded ? '收起' : '展开'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* 控制栏 */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1 rounded bg-cyan-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3 w-3 accent-cyan-500"
              />
              自动刷新(3s)
            </label>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-3 w-3 accent-cyan-500"
              />
              自动滚动
            </label>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1 rounded bg-slate-700/60 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              <Trash2 size={12} />
              清空显示
            </button>
            <span className="ml-auto text-[11px] text-slate-500">
              显示最近 {returnedLines} 行 / 共 {logs.length} 行
            </span>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-2 rounded bg-rose-900/30 px-3 py-1.5 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* 日志内容 */}
          <div
            ref={logContainerRef}
            className="h-64 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] leading-relaxed"
            style={{ scrollbarWidth: 'thin' }}
          >
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-500">
                {loading ? '加载中...' : '暂无日志'}
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${getLevelColor(log.level)}`}>
                  {log.text}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
