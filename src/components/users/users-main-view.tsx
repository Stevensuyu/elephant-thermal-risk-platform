'use client'

// ───────────────────────────────────────────────────────────────────────────
// 用户管理(参照上云平台 /user 模块):用户台账 + 新增/编辑/删除
// 数据源:/api/users(GET/POST/PATCH/DELETE,服务端不回传密码,保护管理员账号)
// 仅系统管理员可见(菜单与页面双重控制)
// ───────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { UserPlus, RefreshCw, Trash2, KeyRound, Users as UsersIcon } from 'lucide-react'
import { ROLES, type RoleId } from '@/lib/auth/auth-role-permissions'

interface UserRow {
  id: string
  account: string
  name: string
  role: RoleId
  phone?: string
  status: string
  createdAt?: string
  updatedAt?: string
}

const ROLE_OPTIONS: RoleId[] = ['admin', 'center', 'street', 'police']

export default function UsersMainView({ currentRole, currentAccount }: { currentRole: RoleId; currentAccount: string }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/users', { cache: 'no-store' })
      const d = await r.json()
      setUsers(Array.isArray(d?.users) ? d.users : [])
    } catch {
      setMsg('用户列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (t: string) => {
    setMsg(t)
    window.setTimeout(() => setMsg(''), 3000)
  }

  const remove = async (u: UserRow) => {
    if (!window.confirm(`确认删除用户「${u.name}(${u.account})」?该操作不可恢复。`)) return
    const r = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    flash(d?.success ? `已删除 ${u.account}` : d?.error || '删除失败')
    load()
  }

  if (currentRole !== 'admin') {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
        仅系统管理员可访问用户管理
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 工具行 */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-cyan-100">
          <UsersIcon size={16} className="text-cyan-300" /> 用户台账
          <span className="text-[12px] font-normal text-slate-500">共 {users.length} 人</span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[12px] text-cyan-300">{msg}</span>}
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/50 px-2.5 py-1.5 text-[13px] text-slate-300 transition hover:bg-slate-700/50"
          >
            <RefreshCw size={13} /> 刷新
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            <UserPlus size={14} /> 新增用户
          </button>
        </div>
      </div>

      {/* 用户表 */}
      <section className="overflow-x-auto rounded-xl border border-slate-800/60 bg-slate-900/40">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[12px] text-slate-500">
              <th className="py-2.5 pl-4 pr-3 font-medium">姓名</th>
              <th className="py-2.5 pr-3 font-medium">账号</th>
              <th className="py-2.5 pr-3 font-medium">角色</th>
              <th className="py-2.5 pr-3 font-medium">手机</th>
              <th className="py-2.5 pr-3 font-medium">状态</th>
              <th className="py-2.5 pr-3 font-medium">创建时间</th>
              <th className="py-2.5 pr-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">加载中…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">暂无用户</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/40 text-slate-200 transition-colors hover:bg-slate-800/30">
                  <td className="py-2.5 pl-4 pr-3 font-medium">
                    {u.name}
                    {u.account === currentAccount && <span className="ml-1.5 rounded bg-cyan-500/15 px-1 text-[10px] text-cyan-300">我</span>}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[13px] text-slate-300">{u.account}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${roleBadge(u.role)}`}>{ROLES[u.role]?.name ?? u.role}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-400">{u.phone || '—'}</td>
                  <td className="py-2.5 pr-3">
                    <span className={u.status === 'active' ? 'text-emerald-300' : 'text-slate-500'}>
                      {u.status === 'active' ? '启用' : u.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-slate-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditing(u)}
                        title="重置密码 / 编辑"
                        className="rounded p-1.5 text-slate-400 transition hover:bg-cyan-500/10 hover:text-cyan-300"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        onClick={() => remove(u)}
                        title="删除"
                        className="rounded p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={(t) => { flash(t); load(); }} />}
      {editing && <EditModal user={editing} onClose={() => setEditing(null)} onDone={(t) => { flash(t); load(); }} />}
    </div>
  )
}

function roleBadge(role: RoleId): string {
  switch (role) {
    case 'admin': return 'bg-rose-500/15 text-rose-300'
    case 'center': return 'bg-violet-500/15 text-violet-300'
    case 'street': return 'bg-amber-500/15 text-amber-300'
    case 'police': return 'bg-sky-500/15 text-sky-300'
    default: return 'bg-slate-500/15 text-slate-300'
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-slate-400">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-md border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-cyan-400/60'

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (t: string) => void }) {
  const [form, setForm] = useState({ account: '', name: '', role: 'police' as string, password: '', phone: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!form.account || !form.name || !form.password) {
      setErr('账号、姓名、密码为必填项')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: form.role }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.success) {
        onDone(`已创建用户 ${form.account}`)
        onClose()
      } else {
        setErr(d?.error || '创建失败')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="新增用户" onClose={onClose}>
      <div className="space-y-3">
        <Field label="账号 *"><input className={inputCls} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="登录账号" /></Field>
        <Field label="姓名 *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="真实姓名" /></Field>
        <Field label="角色">
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLES[r]?.name ?? r}</option>
            ))}
          </select>
        </Field>
        <Field label="初始密码 *"><input type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 6 位" /></Field>
        <Field label="手机号"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="选填" /></Field>
        {err && <p className="text-[12px] text-rose-300">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-slate-700/60 px-3 py-1.5 text-[13px] text-slate-300 hover:bg-slate-700/40">取消</button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function EditModal({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (t: string) => void }) {
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!password && phone === (user.phone ?? '')) {
      setErr('没有需要保存的修改')
      return
    }
    if (password && password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const patch: Record<string, string> = { id: user.id }
      if (password) patch.password = password
      if (phone !== (user.phone ?? '')) patch.phone = phone
      const r = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.success) {
        onDone(`已更新 ${user.account}`)
        onClose()
      } else {
        setErr(d?.error || '更新失败')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title={`编辑:${user.name}(${user.account})`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="新密码(留空则不修改)"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" /></Field>
        <Field label="手机号"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {err && <p className="text-[12px] text-rose-300">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-slate-700/60 px-3 py-1.5 text-[13px] text-slate-300 hover:bg-slate-700/40">取消</button>
          <button onClick={submit} disabled={busy} className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700/60 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-[15px] font-semibold text-cyan-100">{title}</h3>
        {children}
      </div>
    </div>
  )
}
