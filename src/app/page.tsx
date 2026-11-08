'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/common/common-sidebar-nav'
import MonitorView from '@/components/disposal/disposal-monitor-view'
import JudgeView from '@/components/disposal/disposal-judge-view'
import AlertCenterView from '@/components/alert/alert-center-view'
import MyTasksView from '@/components/common/common-my-tasks-view'
import SettingsView from '@/components/settings/settings-main-view'
import ScreenView from '@/components/screen/screen-view'
import DevicesMainView from '@/components/devices/devices-main-view'
import StatsMainView from '@/components/stats/stats-main-view'
import UsersMainView from '@/components/users/users-main-view'
import AlertDetailCard from '@/components/alert/alert-detail-card-modal'
import LoginScreen, { type LoginResult } from '@/components/common/common-login-screen'
import MockBootstrap from '@/components/common/common-mock-bootstrap'
import { installMockApi } from '@/lib/mock/mock-api-installer'
import { useTheme, type Theme } from '@/lib/utils/util-use-theme-hook'
import { useDroneFleet } from '@/lib/utils/util-use-drone-fleet-hook'
import { seedMarkerPosition } from '@/components/dashboard/dashboard-risk-map-3d'
import AlarmDispatchModal from '@/components/alert/alert-dispatch-confirm-modal'
import TodoPopup from '@/components/common/common-todo-popup'
import { ROLES, accountOf, type RoleId } from '@/lib/auth/auth-role-permissions'
import { setAuth as setGlobalAuth, subscribeAuth, getAuth, type AuthState } from '@/lib/auth/auth-session-store'
import { recordLog, LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'
import type { TrainingTask } from '@/lib/utils/util-app-types'
import type { ManualAlertPayload } from '@/components/alert/alert-manual-create-modal'
import { isQualifyingDetection, judgeFromDetection } from '@/lib/utils/util-live-judge-engine'

const tabMeta: Record<string, { title: string }> = {
  screen: { title: '数据大屏' },
  monitor: { title: '实时监控' },
  judge: { title: '警情研判' },
  alerts: { title: '警情中心' },
  mytasks: { title: '我的任务' },
  devices: { title: '设备管理' },
  stats: { title: '数据统计' },
  users: { title: '用户管理' },
  settings: { title: '系统设置' },
}

export default function Home() {
  const [isAuthed, setIsAuthed] = useState(() => { try { return !!getAuth() } catch { return false } })
  const [auth, setAuth] = useState<LoginResult | null>(() => { try { const a = getAuth(); return a ? { role: a.role, user: a.user, name: a.name } as LoginResult : null } catch { return null } })
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('elephant_active_tab')
      // 进入页面默认展示「数据大屏」;旧版记忆的 dashboard(原默认页)迁移为大屏
      if (saved && saved !== 'dashboard') return saved
    }
    return 'screen'
  })
  const [pendingCount, setPendingCount] = useState(0)
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  // 新警情弹窗 + 地图点选地点详情
  const [popupTask, setPopupTask] = useState<TrainingTask | null>(null)
  const [showTodoPopup, setShowTodoPopup] = useState(false)
  const todoPopupShownRef = useRef(false) // 待办弹窗仅首次登录显示一次，角色切换不重复弹出
  const lastPendingCountRef = useRef(0) // 上次待办计数，用于检测新增任务时自动弹窗
  const authRef = useRef(auth)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  // 防重复弹窗：已弹出过分发确认弹窗的警情ID，确认分发后不再重复弹出
  const poppedAlertIdsRef = useRef<Set<string>>(new Set())
  // 基线初始化标记：首次成功拉取任务后记录「已有 id」作为基线，
  // 之后任意新出现的待确认警情都会触发弹窗。避免「首条数据恰好是自动生成的警情」被误当作基线而静默吞掉。
  const initializedRef = useRef(false)
  const { theme, setTheme } = useTheme()
  const fleet = useDroneFleet()
  const router = useRouter()
  // 点击警情直接跳转独立详情页（不再弹 Modal）
  const handleViewTask = (t: TrainingTask) => router.push(`/alert/${t.id}`)
  // 自动研判生成警情：本页作为单一所有者，避免主页/研判页两个按钮实例重复生成
  const judgeEpisodeRef = useRef({ generated: false })

  const fetchAll = async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' })
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data?.tasks ?? [])
      const tasksList = list as TrainingTask[]
      setTasks(tasksList)
      // 新警情弹窗逻辑：
      //  - 首次成功拉取（无论是否为空）建立基线，把已有 id 记为「已见」，不弹窗；
      //  - 之后任意「新出现且 pendingConfirm===true」的警情都触发弹窗（用 lastPopupIdRef 防同一警情重复弹）。
      if (!initializedRef.current) {
        tasksList.forEach((t) => seenIdsRef.current.add(t.id))
        initializedRef.current = true
        return
      }
      for (const t of tasksList) {
        if (!seenIdsRef.current.has(t.id)) {
          seenIdsRef.current.add(t.id)
          // 防重复：只有 pendingConfirm=true 且未弹窗过的警情才触发弹窗
          if (t.pendingConfirm === true && !poppedAlertIdsRef.current.has(t.id)) {
            poppedAlertIdsRef.current.add(t.id)
            setPopupTask((prev) => prev ?? t)
            break
          }
        }
      }
    } catch {
      /* mock 拦截下不应失败 */
    }
  }

  // 弹窗确认：modal 内已调 /api/dispatch/confirm；此处刷新大屏并通知联动面板重新拉取，
  // 同时自动跳转到「警情研判」页，用户可立即查看警情分发流程·跨部门警情联动面板。
  const onConfirmPopup = async () => {
    // 确认分发后，将当前警情ID加入已处理列表，防止后续重复弹窗
    if (popupTask) poppedAlertIdsRef.current.add(popupTask.id)
    setPopupTask(null)
    await fetchAll()
    window.dispatchEvent(new CustomEvent('alarm:confirmed'))
    setActiveTab('judge')
  }
  const onDismissPopup = () => {
    // 稍后处理也记录已弹窗ID，防止同一警情反复弹出
    if (popupTask) poppedAlertIdsRef.current.add(popupTask.id)
    setPopupTask(null)
  }

  // activeTab 持久化到 localStorage，刷新后保持当前页面
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('elephant_active_tab', activeTab)
    }
  }, [activeTab])

  useEffect(() => { const params = new URLSearchParams(window.location.search); const t = params.get('tab'); if (t && t !== activeTab) setActiveTab(t); }, []);

  useEffect(() => {
    installMockApi()
    // 订阅全局 authStore（内存级，刷新即丢失，必须重新登录）
    const unsub = subscribeAuth((a: AuthState | null) => {
      if (a) {
        setAuth({ role: a.role, user: a.user, name: a.name })
        authRef.current = { role: a.role, user: a.user, name: a.name }
        setIsAuthed(true)
      } else {
        setAuth(null)
        setIsAuthed(false)
        setSelectedTask(null)
      }
    })
    fetchAll()
    const id = window.setInterval(() => {
      fetchAll()
      // 轮询当前角色待办：检测到新增任务时自动弹 TodoPopup
      const r = authRef.current?.role as RoleId | undefined
      if (r) refreshPendingCount(r)
    }, 3000)
    return () => { unsub(); window.clearInterval(id) }
  }, [])

  // 监听我的任务页面「查看弹窗」按钮事件，打开待办弹窗
  useEffect(() => {
    const handler = () => setShowTodoPopup(true)
    window.addEventListener('todo:open-popup', handler)
    return () => window.removeEventListener('todo:open-popup', handler)
  }, [])

  // 监听结案事件：任何页面结案后立即刷新警情列表，左侧列表同步更新
  useEffect(() => {
    const handler = () => { fetchAll() }
    window.addEventListener('task:closed', handler)
    return () => window.removeEventListener('task:closed', handler)
  }, [])

  // 监听步骤确认事件：任何组件确认处置步骤后，立即刷新待办计数 + 警情列表
  useEffect(() => {
    const handler = () => {
      fetchAll()
      const r = authRef.current?.role as RoleId | undefined
      if (r) refreshPendingCount(r)
    }
    window.addEventListener('todo:step-confirmed', handler)
    return () => window.removeEventListener('todo:step-confirmed', handler)
  }, [])

  // 登录状态/角色变化后刷新待办计数
  useEffect(() => {
    if (isAuthed && auth) {
      refreshPendingCount(auth.role as RoleId)
      // 待办弹窗仅在首次登录时显示一次，角色切换不重复弹出
      if (!todoPopupShownRef.current) {
        todoPopupShownRef.current = true
        const t = window.setTimeout(() => setShowTodoPopup(true), 800)
        return () => window.clearTimeout(t)
      }
    } else {
      setShowTodoPopup(false)
      todoPopupShownRef.current = false // 登出后重置，下次登录再显示
      lastPendingCountRef.current = 0
    }
  }, [isAuthed, auth?.role])

  // 自动研判：仅当「已接入视频源（connected）」且「确实检出象群」时才自动生成警情。
  // 默认未接入任何视频源（connected=false）→ 零检测、零警情，绝不伪造真实检出。
  // 单一所有者（本页），仅登录后运行，避免主页头部/研判页两个按钮实例重复生成。
  useEffect(() => {
    if (!isAuthed) return
    const tick = async () => {
      try {
        const s = await fetch('/api/realtime-judge-settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
        const d = await fetch('/api/live-detection', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
        const enabled = (s?.enabled ?? s?.settings?.enabled) !== false
        // 诚实边界：没接入视频源（connected=false）就不算「检出」，不生成警情
        const connected = d?.connected === true
        const qualifying = connected && isQualifyingDetection({
          running: !!d?.running,
          detected_count: d?.detected_count ?? d?.count ?? 0,
          max_confidence: d?.max_confidence ?? d?.confidence ?? 0,
        })
        const detecting = enabled && qualifying
        // 同一检测周期内只生成一次，避免每 3 秒重复刷出警情
        if (detecting && !judgeEpisodeRef.current.generated) {
          judgeEpisodeRef.current.generated = true
          await createAutoAlert(d)
        }
        if (!detecting) judgeEpisodeRef.current.generated = false
      } catch { /* ignore */ }
    }
    tick()
    const id = window.setInterval(tick, 3000)
    return () => window.clearInterval(id)
  }, [isAuthed])

  const handleLogin = (r: LoginResult) => {
    setGlobalAuth({ role: r.role as RoleId, user: r.user, name: r.name })
    recordLog({ userName: r.name, role: r.role, action: LOG_ACTIONS.LOGIN, detail: `账号 ${r.user} 登录系统`, userId: r.user })
    // 服务端登录日志（记录IP/设备/会话ID）
    const sessionId = `SID-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem('tyhx_session_id', sessionId)
    fetch('/api/login-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: r.user, userName: r.name, role: r.role, success: true, sessionId }),
    }).catch(() => { /* ignore */ })
  }
  const handleLogout = () => {
    if (auth) recordLog({ userName: auth.name, role: auth.role, action: LOG_ACTIONS.LOGOUT, detail: `账号 ${auth.user} 退出系统`, userId: auth.user })
    setGlobalAuth(null)
  }
  // 计算当前角色的待确认步骤数（从所有处置工单中统计）
  // 过滤条件与 MyTasksView / TodoPopup 完全一致：
  //   未归档(wf.advanced !== true)、警情未结案(task.status !== 'COMPLETED')、
  //   步骤未完成/未跳过(s.status !== 'done'/'skipped')、未确认(!s.confirmedBy)、
  //   分配给当前角色(admin 可见所有)
  const refreshPendingCount = async (forRole?: RoleId) => {
    const r = forRole || (authRef.current?.role as RoleId) || 'admin'
    try {
      // 并行获取 workflow 与任务列表，确保任务状态最新，避免已结案警情步骤被计数
      const [wfRes, tasksRes] = await Promise.all([
        fetch('/api/disposal-workflows', { cache: 'no-store' }),
        fetch('/api/tasks', { cache: 'no-store' }),
      ])
      const wfData = await wfRes.json()
      const tasksData = await tasksRes.json().catch(() => ({}))
      const wfs = Array.isArray(wfData) ? wfData : (wfData?.workflows ?? [])
      const taskList = Array.isArray(tasksData) ? tasksData : (tasksData?.tasks ?? [])
      const completedTaskIds = new Set(taskList.filter((t: any) => t.status === 'COMPLETED').map((t: any) => t.id))
      const existingTaskIds = new Set(taskList.map((t: any) => t.id))
      let count = 0
      for (const wf of wfs) {
        if (wf.advanced === true) continue
        // 警情被删除或已结案 → 跳过
        if (!existingTaskIds.has(wf.taskId)) continue
        if (completedTaskIds.has(wf.taskId)) continue
        for (const s of (wf.steps || [])) {
          if (s.status === 'done' || s.status === 'skipped') continue
          if (s.confirmedBy) continue
          // admin 统计所有角色的未确认步骤；非 admin 仅统计分配给自己的
          if (r === 'admin' || s.assignedRole === r) {
            count++
          }
        }
      }
      setPendingCount(count)
      // 新增任务提醒：待办数比上次多、已登录且非首次初始化 → 自动弹 TodoPopup
      if (count > lastPendingCountRef.current && todoPopupShownRef.current) {
        setShowTodoPopup(true)
      }
      lastPendingCountRef.current = count
    } catch { setPendingCount(0) }
  }

  const onSubmitAlert = async (payload: ManualAlertPayload) => {
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, manual: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.duplicate) {
        console.warn('[警情去重] 同一目标已有正在处置的警情，未重复创建：', d.task?.name)
      }
    } catch { /* 模拟环境下忽略 */ }
    await fetchAll()
  }

  const onDeleteTasks = async (ids: string[]) => {
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    } catch { /* 模拟环境下忽略 */ }
    await fetchAll()
  }

  // 由检测证据自动生成警情（视频源接入 → 检出象群 → 引擎研判 → 生成警情）。
  // 诚实标注来源：demo 推演模式生成的警情标记 simulated:true，绝不明确成「真实视频」。
  const createAutoAlert = async (det: any) => {
    const isDemo = det?.mode === 'demo'
    const j = judgeFromDetection({
      running: !!det?.running,
      detected_count: det?.detected_count ?? det?.count ?? 0,
      max_confidence: det?.max_confidence ?? det?.confidence ?? 0,
    })
    const pos = seedMarkerPosition(j.name)
    // 真实 AI 研判：调用服务端 /api/ai-analysis/auto-judge（真实 LLM 生成研判结论）。
    // 规则引擎只负责风险指数/等级的确定性计算；AI 结论文案由大模型针对该证据生成。
    let aiJudgment = j.aiSummary
    try {
      const aj = await fetch('/api/ai-analysis/auto-judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectedCount: det?.detected_count ?? det?.count ?? 1,
          maxConfidence: det?.max_confidence ?? det?.confidence ?? 0,
          distanceKm: 2,
        }),
      })
      if (aj.ok) {
        const ad = await aj.json()
        if (ad?.ai === true && ad?.analysis?.aiSummary) aiJudgment = String(ad.analysis.aiSummary)
        else if (ad?.analysis?.aiSummary) aiJudgment = `（AI 研判暂不可用：${ad?.reason || '大模型调用失败'}）${String(ad.analysis.aiSummary)}`
      }
    } catch {
      /* AI 不可用 → 使用规则引擎结论（已如实标注） */
    }
    const provenanceNote = isDemo
      ? '（本警情由「推演演示」视频源生成，非真实视频检测，仅供流程演示）'
      : ''
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: j.name + (isDemo ? '（推演演示）' : ''),
          alertType: j.alertType,
          warningLevel: j.warningLevel,
          intrusionRisk: j.intrusionRisk,
          aiSummary: aiJudgment + provenanceNote,
          description: aiJudgment + provenanceNote,
          detectedCount: det?.detected_count ?? det?.count ?? 1,
          triggeredBy: isDemo ? 'realtime-demo' : 'realtime-stream',
          realInference: !isDemo,
          simulated: isDemo,
          manual: false,
          pendingConfirm: true,
          sourceDevice: isDemo ? '推演演示视频源' : '实时直播流',
          lat: pos.lat,
          lng: pos.lng,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (d?.duplicate) {
        console.warn('[警情去重] 同一目标已有正在处置的警情，未重复创建：', d.task?.name)
      }
    } catch { /* mock 拦截下不应失败 */ }
    await fetchAll()
  }

  if (!isAuthed) {
    return (
      <>
        <MockBootstrap />
        <LoginScreen onLogin={handleLogin} />
      </>
    )
  }

  const role = (auth?.role ?? 'admin') as RoleId
  const currentName = auth?.name ?? '管理员'
  const currentUser = auth?.user ?? 'admin'
  const devices = fleet.map((d) => d.name)

  const meta = tabMeta[activeTab] ?? tabMeta.dashboard

  return (
    <>
      <MockBootstrap />
      <div className="dv-grid-bg min-h-screen text-slate-100">
        <div className="flex min-h-screen">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            currentRole={role}
            currentUser={currentUser}
            currentName={currentName}
            onLogout={handleLogout}
            pendingCount={pendingCount}
            mobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
          />

          <main className={`min-w-0 flex-1 ${activeTab === 'screen' ? 'h-screen overflow-hidden p-0' : 'p-2 md:p-3'}`}>
            {/* 手机端菜单按钮 */}
            <div className="mb-2 flex items-center gap-2 md:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-[13px] text-slate-200 active:bg-slate-700/60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                菜单
              </button>
              <span className="text-[12px] text-slate-400">{meta.title}</span>
            </div>

            {activeTab === 'screen' && (
              <ScreenView tasks={tasks} fleet={fleet} onOpenTask={handleViewTask} />
            )}

            {activeTab === 'devices' && <DevicesMainView fleet={fleet} tasks={tasks} />}
            {activeTab === 'stats' && <StatsMainView tasks={tasks} />}
            {activeTab === 'users' && <UsersMainView currentRole={role} currentAccount={currentUser} />}

            {activeTab === 'mytasks' && (
              <MyTasksView currentRole={role} currentName={currentName} tasks={tasks} />
            )}
            {activeTab === 'monitor' && <MonitorView tasks={tasks} fleet={fleet} />}
            {activeTab === 'judge' && (
              <JudgeView
                tasks={tasks}
                fleet={fleet}
                onViewTask={handleViewTask}
                onSubmitAlert={onSubmitAlert}
                devices={devices}
                currentName={currentName}
                currentRole={role}
                onDeleteTasks={onDeleteTasks}
              />
            )}
            {activeTab === 'alerts' && (
              <AlertCenterView
                tasks={tasks}
                currentName={currentName}
                onViewTask={handleViewTask}
                onDeleteTask={(id) => onDeleteTasks([id])}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                tasks={tasks}
                currentRole={role}
                onViewTask={handleViewTask}
                onDeleteTasks={onDeleteTasks}
                theme={theme}
                onThemeChange={(t) => setTheme(t as Theme)}
              />
            )}
          </main>
        </div>

        {selectedTask && <AlertDetailCard alertId={selectedTask.id} onClose={() => setSelectedTask(null)} />}
        {popupTask && <AlarmDispatchModal task={popupTask} onConfirm={onConfirmPopup} onDismiss={onDismissPopup} />}
        <TodoPopup
          open={showTodoPopup}
          onClose={() => setShowTodoPopup(false)}
          tasks={tasks}
          currentRole={auth?.role || ''}
          currentName={auth?.name || ''}
          onViewTask={handleViewTask}
        />
      </div>
    </>
  )
}

