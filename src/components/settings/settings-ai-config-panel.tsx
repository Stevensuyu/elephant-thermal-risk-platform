'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle2, Loader2, Zap, Edit3, X, Cpu, KeyRound, Server, Activity } from 'lucide-react'

interface AiModel {
  id: string
  name: string
  provider: string
  baseURL: string
  model: string
  apiKey: string
  active: boolean
  createdAt: string
}

interface Template {
  provider: string
  baseURL: string
  model: string
  hint: string
}

export default function AiConfigPanel() {
  const [models, setModels] = useState<AiModel[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AiModel | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ai-models')
      const d = await r.json()
      setModels(Array.isArray(d.models) ? d.models : [])
      setTemplates(Array.isArray(d.templates) ? d.templates : [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activate = async (id: string) => {
    await fetch('/api/ai-models', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: true }),
    })
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('确定删除该 AI 模型配置吗？')) return
    await fetch(`/api/ai-models?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="dv-panel flex flex-wrap items-center gap-3 p-4">
        <Cpu size={18} className="text-violet-300" />
        <div>
          <h3 className="text-base font-semibold text-slate-100">AI 配置中心</h3>
          <p className="text-[11px] text-slate-400">管理大模型配置，测试连接，设置当前启用模型</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          <Plus size={15} /> 新增模型
        </button>
      </div>

      {/* 模型列表 */}
      {loading ? (
        <div className="dv-panel flex items-center justify-center p-8">
          <Loader2 size={20} className="animate-spin text-violet-300" />
          <span className="ml-2 text-sm text-slate-400">加载模型配置…</span>
        </div>
      ) : models.length === 0 ? (
        <div className="dv-panel flex flex-col items-center justify-center p-8 text-center">
          <KeyRound size={32} className="mb-2 text-slate-500" />
          <p className="text-sm text-slate-400">暂无 AI 模型配置</p>
          <p className="mt-1 text-[11px] text-slate-500">点击「新增模型」配置大模型连接</p>
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((m) => (
            <div
              key={m.id}
              className={`dv-panel p-4 transition ${m.active ? 'border-violet-500/40 ring-1 ring-violet-500/20' : ''}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.active ? 'bg-violet-500/20 text-violet-200' : 'bg-slate-700/40 text-slate-400'}`}>
                  <Server size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-slate-100">{m.name}</span>
                    <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{m.provider}</span>
                    {m.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200 ring-1 ring-emerald-400/30">
                        <Activity size={10} /> 当前启用
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] text-slate-400">未启用</span>
                    )}
                  </div>
                  <div className="mt-1.5 grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Base URL:</span>
                      <span className="truncate font-mono text-slate-300">{m.baseURL}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">模型ID:</span>
                      <span className="truncate font-mono text-slate-300">{m.model}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">API Key:</span>
                      <span className="font-mono text-slate-300">{m.apiKey ? `${m.apiKey.slice(0, 12)}…${m.apiKey.slice(-6)}` : '未设置'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">创建时间:</span>
                      <span className="text-slate-300">{new Date(m.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    onClick={() => { setEditing(m); setShowForm(true) }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700/40"
                  >
                    <Edit3 size={12} /> 编辑
                  </button>
                  {!m.active && (
                    <button
                      onClick={() => activate(m.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 size={12} /> 设启用
                    </button>
                  )}
                  <button
                    onClick={() => remove(m.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑表单弹窗 */}
      {showForm && (
        <ModelForm
          templates={templates}
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function ModelForm({ templates, initial, onClose, onSaved }: {
  templates: Template[]
  initial: AiModel | null
  onClose: () => void
  onSaved: () => void
}) {
  const [provider, setProvider] = useState(initial?.provider || 'openrouter')
  const [name, setName] = useState(initial?.name || '')
  const [baseURL, setBaseURL] = useState(initial?.baseURL || 'https://openrouter.ai/api/v1')
  const [model, setModel] = useState(initial?.model || '')
  const [apiKey, setApiKey] = useState(initial?.apiKey || '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [err, setErr] = useState('')

  const applyTemplate = (p: string) => {
    const t = templates.find((x) => x.provider === p)
    if (t) { setProvider(p); setBaseURL(t.baseURL); setModel(t.model) }
  }

  const handleTest = async () => {
    if (!apiKey.trim()) { setErr('请先填写 API Key'); return }
    setTesting(true); setTestResult(null); setErr('')
    try {
      const r = await fetch('/api/ai-models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseURL, model, apiKey }),
      })
      const d = await r.json()
      setTestResult({ ok: d.ok === true, msg: d.ok ? '连接成功，模型可用' : (d.error || d.msg || '连接失败') })
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : '测试请求失败' })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    if (!name.trim()) { setErr('请填写模型名称'); return }
    if (!baseURL.trim()) { setErr('请填写 Base URL'); return }
    if (!model.trim()) { setErr('请填写模型 ID'); return }
    setSaving(true); setErr('')
    try {
      const payload = { id: initial?.id, provider, name, baseURL, model, apiKey, active }
      const r = await fetch('/api/ai-models', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.success || d.ok) {
        onSaved()
      } else {
        setErr(d.error || '保存失败')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-700/50 bg-slate-800/60 px-5 py-3.5">
          <Cpu size={18} className="text-violet-300" />
          <h3 className="text-base font-semibold text-slate-100">{initial ? '编辑模型' : '新增 AI 模型'}</h3>
          <button onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 厂商模板 */}
          {templates.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">厂商模板（一键填入）</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.provider}
                    onClick={() => applyTemplate(t.provider)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                      provider === t.provider
                        ? 'border-violet-400/60 bg-violet-500/15 text-violet-100'
                        : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-violet-500/40'
                    }`}
                    title={t.hint}
                  >
                    {t.provider}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">模型名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：OpenAI 兼容大模型"
                className="w-full rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-violet-400/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">厂商</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">Base URL（OpenAI 兼容）*</label>
              <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} className="w-full rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-2 font-mono text-[12px] text-white outline-none focus:border-violet-400/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">模型 ID *</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="如：gpt-4o-mini" className="w-full rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-2 font-mono text-[12px] text-white placeholder-slate-500 outline-none focus:border-violet-400/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">API Key *</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-or-v1-..." className="w-full rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-2 font-mono text-[12px] text-white placeholder-slate-500 outline-none focus:border-violet-400/50" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-3.5 w-3.5 accent-violet-400" />
            保存后立即启用为当前研判模型（同时仅一个启用）
          </label>

          {/* 测试结果 */}
          {testResult && (
            <div className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] ${testResult.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
              {testResult.ok ? <CheckCircle2 size={14} /> : <Zap size={14} />} {testResult.msg}
            </div>
          )}
          {err && <div className="text-[12px] text-rose-300">{err}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/40 bg-slate-800/30 px-5 py-3">
          <button
            onClick={handleTest}
            disabled={testing || !apiKey}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} 测试连接
          </button>
          <button onClick={onClose} className="rounded-md border border-slate-600/60 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/40">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {initial ? '保存修改' : '添加模型'}
          </button>
        </div>
      </div>
    </div>
  )
}
