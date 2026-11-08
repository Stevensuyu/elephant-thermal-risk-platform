'use client'

import { useEffect, useMemo, useState } from 'react'
import { FlaskConical, Play, Square, Loader2, Radio, AlertTriangle, Activity, FileText, Trash2 } from 'lucide-react'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask } from '@/lib/utils/util-app-types'

interface Props {
  tasks: TrainingTask[]
  onDeleteTasks: (ids: string[]) => Promise<void>
}

interface LiveDet {
  connected?: boolean
  detected_count?: number
  max_confidence?: number
}

function fmtTime(totalSec: number) {
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function SimulationTestPanel({ tasks, onDeleteTasks }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [det, setDet] = useState<LiveDet | null>(null)

  // 初始化状态
  useEffect(() => {
    fetch('/api/realtime-judge-settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.settings || d
        if (s && typeof s.enabled === 'boolean') setEnabled(s.enabled)
      })
      .catch(() => {})
    fetch('/api/live-detection', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConnected(!!d?.connected))
      .catch(() => {})
  }, [])

  // 监测时长计时器
  useEffect(() => {
    if (!enabled) {
      setElapsed(0)
      return
    }
    const t = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [enabled])

  // 轮询推演源检测数据
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await fetch('/api/live-detection', { cache: 'no-store' })
        const d = await r.json()
        if (!alive) return
        setConnected(!!d?.connected)
        setDet(d)
      } catch {
        /* ignore */
      }
    }
    poll()
    const t = setInterval(poll, 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const simTasks = useMemo(() => tasks.filter((t) => t.simulated), [tasks])

  const toggle = async () => {
    setBusy(true)
    const next = !enabled
    try {
      await fetch('/api/realtime-judge-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, mode: next ? 'ai-llm-client' : 'off' }),
      })
      await fetch('/api/live-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next ? 'demo' : 'off' }),
      })
      setEnabled(next)
      setConnected(next)
      if (!next) {
        const ids = simTasks.map((t) => t.id)
        if (ids.length) await onDeleteTasks(ids)
      }
    } finally {
      setBusy(false)
    }
  }

  const pipeline = useMemo(
    () => [
      { label: '来源', status: enabled ? 'completed' : 'pending' },
      { label: '检测', status: connected ? 'completed' : enabled ? 'running' : 'pending' },
      { label: '证据研判', status: connected ? 'completed' : 'pending' },
      {
        label: '警情',
        status: simTasks.length > 0 ? 'completed' : connected ? 'running' : 'pending',
      },
      {
        label: '处置',
        status:
          simTasks.some((t) => t.status === 'COMPLETED')
            ? 'completed'
            : simTasks.length > 0
              ? 'running'
              : 'pending',
      },
    ],
    [enabled, connected, simTasks],
  )

  return (
    <div className="space-y-5">
      {/* 1. 是否开启模拟测试 */}
      <section className="dv-panel p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-700/40 pb-3">
          <FlaskConical size={20} className="text-amber-300" />
          <h2 className="dv-title text-lg font-semibold text-slate-100">模拟测试</h2>
          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/30">
            推演演示 · 非真实警情
          </span>
        </div>

        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-200">
          <strong className="font-semibold">注意：</strong>
          本页面仅用于流程与功能演示。开启后接入的是推演演示视频源，生成的所有数据均标注为「推演演示 · 非真实警情」，不会与真实监测数据混淆。停止后将自动清理模拟警情。
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-base font-semibold text-slate-100">是否开启模拟测试</div>
            <div className="mt-1 text-xs text-slate-400">
              {enabled ? '实时监测中，YOLO 检测引擎正在对推演视频源进行目标识别' : '关闭状态，未接入任何推演视频源'}
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
              enabled
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:from-violet-500 hover:to-cyan-500'
            }`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : enabled ? <Square size={16} /> : <Play size={16} />}
            {enabled ? '停止模拟测试' : '开启模拟测试'}
          </button>
        </div>
      </section>

      {/* 2. 模拟测试结果报告 */}
      <section className="dv-panel p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-700/40 pb-3">
          <Activity size={18} className="text-violet-300" />
          <h3 className="dv-title text-base font-semibold text-slate-100">模拟测试结果报告</h3>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Radio size={12} /> 监测状态
            </div>
            <div className={`mt-1 text-sm font-semibold ${enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
              {enabled ? `实时监测中 · ${fmtTime(elapsed)}` : '未启动'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
            <div className="text-[11px] text-slate-400">检测引擎</div>
            <div className="mt-1 text-sm font-semibold text-cyan-200">YOLOv8 目标检测</div>
            <div className="text-[11px] text-slate-500">{enabled ? '运行中' : '待命'}</div>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
            <div className="text-[11px] text-slate-400">实时识别</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {connected ? `${det?.detected_count ?? 0} 头 · 置信度 ${(det?.max_confidence ?? 0).toFixed(2)}` : '无目标'}
            </div>
            <div className="text-[11px] text-slate-500">{connected ? '推演视频中' : '等待视频源'}</div>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
            <div className="text-[11px] text-slate-400">已生成警情</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{simTasks.length} 条</div>
            <div className="text-[11px] text-slate-500">{simTasks.length > 0 ? '模拟数据' : '队列清空'}</div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> 已完成</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> 进行中</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-600" /> 待处理</span>
          </div>
          <div className="relative flex items-start justify-between">
            {pipeline.map((step, i) => (
              <div key={step.label} className="relative flex flex-1 flex-col items-center">
                <div
                  className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    step.status === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : step.status === 'running'
                        ? 'animate-pulse bg-amber-500 text-white'
                        : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
                <div className="mt-2 text-center text-[11px] text-slate-300">{step.label}</div>
                {i < pipeline.length - 1 && (
                  <div className="absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2 bg-slate-700/50">
                    <div
                      className={`h-full transition-all ${step.status === 'completed' ? 'w-full bg-emerald-500' : 'w-0'}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 警情处置单 */}
      <section className="dv-panel p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-700/40 pb-3">
          <FileText size={18} className="text-rose-300" />
          <h3 className="dv-title text-base font-semibold text-slate-100">警情处置单</h3>
          <span className="ml-auto text-xs text-slate-400">仅显示推演演示生成的模拟警情</span>
        </div>

        {simTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/60 bg-slate-800/20 py-10 text-sm text-slate-500">
            <AlertTriangle size={24} className="mb-2 text-slate-600" />
            暂无模拟警情
          </div>
        ) : (
          <div className="space-y-3">
            {simTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${levelStyle[task.warningLevel].bg}`}
                      >
                        {levelStyle[task.warningLevel].label}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">{task.name}</span>
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-400/30">
                        推演
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      风险指数 {task.intrusionRisk} · {task.detectedCount} 头 · {task.predictionWindow}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-slate-300">
                      {task.status === 'COMPLETED' ? '已完成' : task.pendingConfirm ? '待人工确认' : '正在处置'}
                    </div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className={`h-full rounded-full ${task.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.max(5, Math.min(100, task.progress))}%` }}
                      />
                    </div>
                  </div>
                </div>
                {task.aiSummary && (
                  <div className="mt-3 border-t border-slate-700/40 pt-2 text-xs text-slate-400">
                    {task.aiSummary.length > 120 ? `${task.aiSummary.slice(0, 120)}…` : task.aiSummary}
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end border-t border-slate-700/40 pt-4">
              <button
                onClick={() => {
                  const ids = simTasks.map((t) => t.id)
                  if (ids.length) onDeleteTasks(ids)
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                <Trash2 size={14} /> 清空模拟警情
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
