'use client'

import { useState } from 'react'
import { Settings2, Cpu, Database, Plane, Workflow, FlaskConical, Shield, Radio, Film, Search, Camera, Terminal } from 'lucide-react'
import AiConfigPanel from '@/components/settings/settings-ai-config-panel'
import VideoStreamPanel from '@/components/settings/settings-video-stream-panel'
import GeneralSettingsPanel from '@/components/settings/settings-general-panel'
import DroneRegistryPanel from '@/components/settings/settings-drone-registry-panel'
import DisposalConfigPanel from '@/components/disposal/disposal-config-panel'
import DispatchChannelsPanel from '@/components/settings/settings-dispatch-channels-panel'
import SimulationTestPanel from '@/components/settings/settings-simulation-test-panel'
import CameraDetectPanel from '@/components/settings/settings-camera-detect-panel'
import SettingsLogPanel from '@/components/settings/settings-log-panel'
import AdminPanel from '@/components/settings/settings-admin-panel'
import { levelStyle } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { RoleId } from '@/lib/auth/auth-role-permissions'
import CommonPagination from '@/components/common/common-pagination'

interface SettingsViewProps {
  tasks: TrainingTask[]
  currentRole: RoleId
  onViewTask: (task: TrainingTask) => void
  onDeleteTasks: (ids: string[]) => Promise<void>
  theme: string
  onThemeChange: (t: string) => void
}

type SubTab = 'system' | 'ai-llm-client' | 'devices' | 'disposal' | 'simulation'

const SUB_TABS: { id: SubTab; label: string; icon: any }[] = [
  { id: 'system', label: '系统管理', icon: Shield },
  { id: 'ai-llm-client', label: 'AI 配置中心', icon: Cpu },
  { id: 'devices', label: '设备与通道', icon: Radio },
  { id: 'disposal', label: '处置流程配置', icon: Workflow },
  { id: 'simulation', label: '模拟测试', icon: FlaskConical },
]

export default function SettingsView({ tasks, currentRole, onViewTask, onDeleteTasks, theme, onThemeChange }: SettingsViewProps) {
  const [sub, setSub] = useState<SubTab>('system')
  const [search, setSearch] = useState('')

  return (
    <div className="space-y-5">
      {/* 子模块切换 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-700/50 pb-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              sub === t.id ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 系统管理：通用设置 + 操作日志 + 水印设置 + 系统台账 */}
      {sub === 'system' && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Settings2 size={16} className="text-slate-300" /> 通用设置
            </h2>
            <GeneralSettingsPanel currentRole={currentRole} theme={theme} onThemeChange={onThemeChange} />
          </section>

          <div className="border-t border-slate-700/40" />

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Shield size={16} className="text-slate-300" /> 操作审计与水印
            </h2>
            <AdminPanel />
          </section>

          <div className="border-t border-slate-700/40" />

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Database size={16} className="text-slate-300" /> 系统台账
            </h2>
            <HistoryLedger tasks={tasks} search={search} setSearch={setSearch} onViewTask={onViewTask} onDeleteTasks={onDeleteTasks} />
          </section>
        </div>
      )}

      {/* AI 配置中心 */}
      {sub === 'ai-llm-client' && <AiConfigPanel />}

      {/* 设备与通道：相机接入与实时检测 + 巡检无人机 + 视频流配置 + 设备分发通道 */}
      {sub === 'devices' && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Camera size={16} className="text-slate-300" /> 相机接入与实时检测
            </h2>
            <CameraDetectPanel />
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Terminal size={16} className="text-slate-300" /> 服务日志
            </h2>
            <SettingsLogPanel />
          </section>

          <div className="border-t border-slate-700/40" />

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Plane size={16} className="text-slate-300" /> 巡检无人机
            </h2>
            <DroneRegistryPanel />
          </section>

          <div className="border-t border-slate-700/40" />

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Film size={16} className="text-slate-300" /> 视频流配置
            </h2>
            <VideoStreamPanel />
          </section>

          <div className="border-t border-slate-700/40" />

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
              <Radio size={16} className="text-slate-300" /> 设备分发通道
            </h2>
            <DispatchChannelsPanel />
          </section>
        </div>
      )}

      {/* 处置流程配置 */}
      {sub === 'disposal' && <DisposalConfigPanel />}

      {/* 模拟测试 */}
      {sub === 'simulation' && <SimulationTestPanel tasks={tasks} onDeleteTasks={onDeleteTasks} />}
    </div>
  )
}

/** 系统台账：已完成 / 已汇总任务留痕，支持搜索与批量删除 */
function HistoryLedger({
  tasks,
  search,
  setSearch,
  onViewTask,
  onDeleteTasks,
}: {
  tasks: TrainingTask[]
  search: string
  setSearch: (s: string) => void
  onViewTask: (t: TrainingTask) => void
  onDeleteTasks: (ids: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ ids: string[]; mode: 'single' | 'batch' } | null>(null)

  const done = tasks.filter(
    (t) =>
      (t.status === 'COMPLETED' || t.aggregatedAt) &&
      (!search.trim() ||
        t.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (levelStyle[t.warningLevel]?.label || '').includes(search.trim()) ||
        (t.alertType || '').toLowerCase().includes(search.trim().toLowerCase())),
  )
  const doneIds = done.map((t) => t.id)
  const allSelected = doneIds.length > 0 && doneIds.every((id) => selected.has(id))
  const picked = doneIds.filter((id) => selected.has(id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (allSelected) doneIds.forEach((id) => n.delete(id))
      else doneIds.forEach((id) => n.add(id))
      return n
    })
  const executeDelete = async () => {
    if (!confirm) return
    await onDeleteTasks(confirm.ids)
    setSelected(new Set())
    setConfirm(null)
  }

  return (
    <section className="dv-panel p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="dv-title flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Database size={20} className="text-slate-300" />
          已完成任务留痕（{done.length}）
        </h2>
        <div className="relative ml-auto w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务名 / 级别"
            className="w-full rounded-md border border-slate-600/70 bg-slate-800/80 py-1.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-400/70"
          />
        </div>
        {done.length > 0 && (
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-slate-400" />
              全选
            </label>
            {picked.length > 0 && (
              <button
                onClick={() => setConfirm({ ids: picked, mode: 'batch' })}
                className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
              >
                删除选中（{picked.length}）
              </button>
            )}
          </>
        )}
      </div>

      <CommonPagination
        items={done}
        searchKeys={['name', 'alertType', 'warningLevel']}
        showSearch={false}
        pageSize={10}
        emptyText="暂无已完成任务留痕"
      >
        {(pageItems) => (
          <div className="space-y-2">
            {pageItems.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 accent-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">{t.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${levelStyle[t.warningLevel]?.bg || ''} ${levelStyle[t.warningLevel]?.text || ''}`}>
                      {levelStyle[t.warningLevel]?.label || t.warningLevel}
                    </span>
                    {t.alertType && <span className="text-[10px] text-slate-400">{t.alertType}</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN') : t.aggregatedAt ? new Date(t.aggregatedAt).toLocaleString('zh-CN') : '—'}
                  </p>
                </div>
                <button
                  onClick={() => onViewTask(t)}
                  className="rounded-md border border-slate-600/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/40"
                >
                  查看
                </button>
                <button
                  onClick={() => setConfirm({ ids: [t.id], mode: 'single' })}
                  className="rounded-md border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </CommonPagination>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-700/60 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-100">确认删除</h3>
            <p className="mt-2 text-sm text-slate-400">
              确定删除 {confirm.mode === 'batch' ? `选中的 ${confirm.ids.length} 条` : '该条'}任务留痕吗？此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-md border border-slate-600/60 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/40">
                取消
              </button>
              <button onClick={executeDelete} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
