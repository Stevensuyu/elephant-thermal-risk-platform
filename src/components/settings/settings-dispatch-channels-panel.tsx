'use client'

/**
 * 设备分发通道配置（研究要点④：真实分发到设备）
 * ───────────────────────────────────────────────────────────────────────────
 * 在此配置「智能分发中间件」的真实推送通道：
 *   - SSE 站内广播（公安指挥大屏 / 指挥调度看板）：零配置，平台内即时生效；
 *   - HTTP Webhook（护林员APP / 短信 / 村委广播桥）：填写真实网关 URL；
 *   - UDP（无人机 MAVLink 网关）：填写真实 host:port。
 * 支持逐个通道「发送测试消息」验证链路，保存后作用于后续每一次警情分发。
 */

import { useEffect, useState } from 'react'
import { Network, Save, Loader2, Send, CheckCircle2, XCircle, PlugZap, Plus, Trash2, X } from 'lucide-react'
import type { DispatchChannel } from '@/lib/store/store-dispatch-channels'

export default function DispatchChannelsPanel() {
  const [channels, setChannels] = useState<DispatchChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newCh, setNewCh] = useState<{ name: string; kind: 'sse' | 'webhook' | 'udp'; url: string; host: string; port: string; note: string; enabled: boolean }>({
    name: '', kind: 'webhook', url: '', host: '', port: '14550', note: '', enabled: true,
  })

  const load = () => {
    fetch('/api/dispatch-channels', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { channels: DispatchChannel[] }) => {
        if (Array.isArray(d.channels)) setChannels(d.channels)
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const patch = (id: string, p: Partial<DispatchChannel>) =>
    setChannels((list) => list.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/dispatch-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels),
      })
      const d = await r.json()
      if (Array.isArray(d.channels)) setChannels(d.channels)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const test = async (id: string) => {
    setTesting(id)
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, text: '测试中…' } }))
    try {
      const r = await fetch('/api/dispatch-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', channelId: id }),
      })
      const d = await r.json()
      const res = d.result || {}
      setTestResult((prev) => ({
        ...prev,
        [id]: {
          ok: d.success === true,
          text: d.success
            ? `发送成功（HTTP ${res.statusCode ?? '—'}${res.attempts ? `，尝试 ${res.attempts} 次` : ''}）`
            : `发送失败：${res.error || d.error || '未知错误'}`,
        },
      }))
    } catch (e: any) {
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, text: `请求失败：${e?.message || e}` } }))
    } finally {
      setTesting(null)
    }
  }

  const addChannel = () => {
    if (!newCh.name.trim()) return
    const id = `Custom_${newCh.kind.toUpperCase()}_${Date.now().toString(36)}`
    const ch: DispatchChannel = {
      id,
      name: newCh.name.trim(),
      kind: newCh.kind,
      enabled: newCh.enabled,
      url: newCh.kind === 'webhook' ? newCh.url.trim() : undefined,
      host: newCh.kind === 'udp' ? newCh.host.trim() : undefined,
      port: newCh.kind === 'udp' ? Number(newCh.port) || 14550 : undefined,
      timeoutMs: 6000,
      note: newCh.note.trim() || (newCh.kind === 'sse' ? '站内实时广播（SSE）：零配置即可用。' : newCh.kind === 'webhook' ? 'HTTP Webhook：向自定义网关 POST 警情卡片。' : 'UDP 指令包：向自定义 MAVLink 网关发送 JSON 指令。'),
    }
    const next = [...channels, ch]
    setChannels(next)
    setShowAdd(false)
    setNewCh({ name: '', kind: 'webhook', url: '', host: '', port: '14550', note: '', enabled: true })
    // 立即保存
    fetch('/api/dispatch-channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && Array.isArray(d.channels)) setChannels(d.channels)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }).catch(() => {})
  }

  const removeChannel = (id: string) => {
    const next = channels.filter((c) => c.id !== id)
    setChannels(next)
    fetch('/api/dispatch-channels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && Array.isArray(d.channels)) setChannels(d.channels)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }).catch(() => {})
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> 加载通道配置…</div>
  }

  return (
    <div className="space-y-5">
      {/* 说明 */}
      <section className="dv-panel p-5">
        <div className="mb-2 flex items-center gap-2">
          <Network size={18} className="text-amber-300" />
          <h3 className="text-base font-semibold text-slate-100">设备分发通道（智能分发中间件）</h3>
          <span className="ml-auto text-[11px] text-slate-500">警情触发时按此配置真实推送到设备</span>
        </div>
        <p className="text-[11px] leading-5 text-slate-500">
          警情生成后，中间件会按预警级别把标准化警情卡片推送到以下通道：<b>SSE 站内广播</b>（公安大屏/指挥看板，零配置即生效）、
          <b>HTTP Webhook</b>（护林员APP / 短信 / 村委广播桥，需填写真实网关 URL）、<b>UDP</b>（无人机 MAVLink 网关，需填写真实 host:port）。
          未启用或未配置端点的通道不会发送，分发记录如实标注「未发送」，绝不假装已送达。配置后可用「发送测试消息」验证链路。
        </p>
      </section>

      {/* 通道列表 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-300">已配置设备（{channels.length}）</span>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          <Plus size={14} /> 新增设备
        </button>
      </div>
      <div className="space-y-3">
        {channels.map((c) => {
          const t = testResult[c.id]
          return (
            <div key={c.id} className="dv-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => patch(c.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-amber-500"
                  />
                  {c.name}
                </label>
                <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  {c.kind === 'sse' ? '站内SSE广播' : c.kind === 'webhook' ? 'HTTP Webhook' : 'UDP 指令包'}
                </span>
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                  c.enabled ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' : 'bg-slate-600/30 text-slate-400 ring-slate-500/30'
                }`}>
                  <PlugZap size={10} /> {c.enabled ? '已启用' : '未启用'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {c.kind === 'webhook' && (
                  <>
                    <label className="text-[11px] text-slate-400">
                      Webhook URL（真实网关地址）
                      <input
                        className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
                        placeholder="https://your-gateway.example.com/push/alert"
                        value={c.url || ''}
                        onChange={(e) => patch(c.id, { url: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-slate-400">
                      自定义请求头（可选，如 Authorization: Bearer xxx，一行一个 k:v）
                      <textarea
                        className="mt-1 h-[38px] w-full resize-none rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
                        placeholder={'Authorization: Bearer xxx'}
                        value={Object.entries(c.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}
                        onChange={(e) => {
                          const headers: Record<string, string> = {}
                          e.target.value.split('\n').forEach((line) => {
                            const i = line.indexOf(':')
                            if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
                          })
                          patch(c.id, { headers })
                        }}
                      />
                    </label>
                  </>
                )}
                {c.kind === 'udp' && (
                  <>
                    <label className="text-[11px] text-slate-400">
                      目标主机（MAVLink 网关 IP）
                      <input
                        className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
                        placeholder="192.168.1.100"
                        value={c.host || ''}
                        onChange={(e) => patch(c.id, { host: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-slate-400">
                      目标端口
                      <input
                        type="number"
                        className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-amber-500/60"
                        placeholder="14550"
                        value={c.port || ''}
                        onChange={(e) => patch(c.id, { port: Number(e.target.value) || undefined })}
                      />
                    </label>
                  </>
                )}
                {c.kind === 'sse' && (
                  <p className="text-[11px] leading-5 text-slate-400 sm:col-span-2">站内 SSE 广播，零配置即可用：分发结果实时推送到公安指挥大屏 / 指挥调度看板（无需外网端点）。</p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[10.5px] leading-4 text-slate-500">{c.note}</p>
                <button
                  onClick={() => test(c.id)}
                  disabled={testing === c.id || !c.enabled}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {testing === c.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  发送测试消息
                </button>
                <button
                  onClick={() => removeChannel(c.id)}
                  title="删除此设备"
                  className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 size={12} /> 删除
                </button>
                {t && (
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${t.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                    {t.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {t.text}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 保存 */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? '已保存 ✓' : '保存通道配置'}
        </button>
        <span className="text-[11px] text-slate-500">保存后立即生效，作用于后续每一次警情分发。</span>
      </div>

      {/* 新增设备弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <Plus size={16} className="text-cyan-300" /> 新增分发设备
              </h3>
              <button onClick={() => setShowAdd(false)} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-[11px] text-slate-400">
                设备名称（必填）
                <input
                  className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-cyan-500/60"
                  placeholder="如：街道办广播网关"
                  value={newCh.name}
                  onChange={(e) => setNewCh({ ...newCh, name: e.target.value })}
                />
              </label>

              <label className="block text-[11px] text-slate-400">
                通道类型
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(['sse', 'webhook', 'udp'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setNewCh({ ...newCh, kind: k })}
                      className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                        newCh.kind === k
                          ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                          : 'border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {k === 'sse' ? '站内SSE广播' : k === 'webhook' ? 'HTTP Webhook' : 'UDP 指令包'}
                    </button>
                  ))}
                </div>
              </label>

              {newCh.kind === 'webhook' && (
                <label className="block text-[11px] text-slate-400">
                  Webhook URL（网关地址）
                  <input
                    className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-cyan-500/60"
                    placeholder="https://your-gateway.example.com/push/alert"
                    value={newCh.url}
                    onChange={(e) => setNewCh({ ...newCh, url: e.target.value })}
                  />
                </label>
              )}

              {newCh.kind === 'udp' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[11px] text-slate-400">
                    目标主机
                    <input
                      className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-cyan-500/60"
                      placeholder="192.168.1.100"
                      value={newCh.host}
                      onChange={(e) => setNewCh({ ...newCh, host: e.target.value })}
                    />
                  </label>
                  <label className="block text-[11px] text-slate-400">
                    目标端口
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[12px] text-slate-200 outline-none focus:border-cyan-500/60"
                      value={newCh.port}
                      onChange={(e) => setNewCh({ ...newCh, port: e.target.value })}
                    />
                  </label>
                </div>
              )}

              <label className="block text-[11px] text-slate-400">
                说明（可选）
                <input
                  className="mt-1 w-full rounded-md border border-slate-700/60 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-cyan-500/60"
                  placeholder="用于描述该设备的用途"
                  value={newCh.note}
                  onChange={(e) => setNewCh({ ...newCh, note: e.target.value })}
                />
              </label>

              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={newCh.enabled}
                  onChange={(e) => setNewCh({ ...newCh, enabled: e.target.checked })}
                  className="h-4 w-4 accent-cyan-500"
                />
                添加后立即启用
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-md border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={addChannel}
                disabled={!newCh.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/90 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} /> 添加并保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
