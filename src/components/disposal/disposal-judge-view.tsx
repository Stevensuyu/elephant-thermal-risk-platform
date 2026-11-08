'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, AlertTriangle, BrainCircuit } from 'lucide-react'
import JudgeIntegratedPanel from '@/components/disposal/disposal-judge-integrated-panel'
import ManualAlertModal, { type ManualAlertPayload } from '@/components/alert/alert-manual-create-modal'
import RealtimeJudgeControl from '@/components/dashboard/dashboard-realtime-judge-control'
import { levelStyle, warningOrder } from '@/lib/utils/util-alert-level-styles'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

interface JudgeViewProps {
  tasks: TrainingTask[]
  fleet?: Drone[]
  onViewTask: (task: TrainingTask) => void
  onSubmitAlert: (payload: ManualAlertPayload) => Promise<void>
  devices: string[]
  /** 当前操作人（警情联动面板推进处置工单时留痕） */
  currentName?: string
  /** 当前登录角色 */
  currentRole?: string
  /** 删除警情（用于研判审判面板清理模拟警情） */
  onDeleteTasks: (ids: string[]) => Promise<void>
}

export default function JudgeView({ tasks, fleet, onViewTask, onSubmitAlert, devices, currentName, currentRole, onDeleteTasks }: JudgeViewProps) {
  const [modalOpen, setModalOpen] = useState(false)


  const pendingCount = useMemo(
    () => tasks.filter((t) => t.pendingConfirm || t.status === 'PENDING').length,
    [tasks],
  )

  return (
    <div className="space-y-5">
      {/* 警情实时研判预警总开关：用户可在页面最上方一键启停实时监测 */}
      <section className="dv-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <div className="rounded-xl bg-violet-500/15 p-2.5 text-violet-300 ring-1 ring-violet-400/30">
            <BrainCircuit size={22} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">警情实时研判预警</h2>
          </div>
        </div>
        <RealtimeJudgeControl compact onManualOpen={() => setModalOpen(true)} />
      </section>

      <section className="mb-5 grid grid-cols-4 gap-4">
        {warningOrder.map((lv) => {
          const count = tasks.filter((task) => task.warningLevel === lv).length
          const s = levelStyle[lv]
          return (
            <div key={lv} className={`rounded-lg p-4 text-white shadow-sm ${s.bg}`}>
              <div className="flex items-center gap-2 text-sm font-medium opacity-90">
                <ShieldAlert size={16} />
                {s.label}
              </div>
              <div className="mt-2 text-3xl font-black">{count}</div>
              <div className="text-xs opacity-80">个警情</div>
            </div>
          )
        })}
      </section>

      {/* 当前活动警情占位：具体研判卡片已收敛到最下方一体化流程的「警情分发历史」 */}
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cyan-400/25 bg-white/[0.03] py-12 text-center text-slate-400">
          暂无警情
        </div>
      ) : null}

      <JudgeIntegratedPanel
        tasks={tasks}
        onManualOpen={() => setModalOpen(true)}
        onViewTask={onViewTask}
        currentName={currentName}
        currentRole={currentRole}
        pendingCount={pendingCount}
        onClearSimulated={() => {
          const ids = tasks.filter((t) => t.simulated || t.triggeredBy === 'realtime-demo').map((t) => t.id)
          if (ids.length) onDeleteTasks(ids)
        }}
      />

      <ManualAlertModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSubmit={onSubmitAlert} devices={devices} />
    </div>
  )
}

