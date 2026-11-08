'use client'















import { useEffect, useMemo, useRef, useState } from 'react'







import { useRouter } from 'next/navigation'







import {







  ArrowLeft, ShieldAlert, Thermometer, Route, ScanSearch, Cpu,







  AlertTriangle, MapPinned, Loader2, BrainCircuit, CheckCircle2,







  ClipboardList, FlaskConical, Radio,







  List, PanelLeftClose, PanelLeftOpen, FileText, Archive, Sparkles, ChevronRight, Clock,







  Edit3, Hash, Save, RefreshCw, XCircle,







} from 'lucide-react'







import type { TrainingTask, CaseReport } from '@/lib/utils/util-app-types'
import { taskStatusLabel } from '@/lib/utils/util-app-types'







import DisposalTimeline from '@/components/disposal/disposal-timeline-panel'







import ClosureReportView from '@/components/disposal/disposal-closure-report-view'







import { RiskSimulationPanel } from '@/components/disposal/disposal-risk-simulation-panel'
import DisposalPlanVisual from '@/components/disposal/disposal-plan-visual'
import ClosureRiskModal from '@/components/disposal/closure-risk-modal'







import { getAuth, subscribeAuth, type AuthState } from '@/lib/auth/auth-session-store'







import { recordLog, LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'
import CommonPagination from '@/components/common/common-pagination'
import { subscribeWorkflowStepConfirmed } from '@/lib/utils/util-workflow-sync'















const LEVEL_META: Record<string, { label: string; bg: string; text: string; ring: string; bar: string }> = {







  RED:    { label: '红色预警', bg: 'bg-red-500',   text: 'text-red-100',   ring: 'ring-red-400/50', bar: 'bg-red-500' },







  ORANGE: { label: '橙色预警', bg: 'bg-orange-500', text: 'text-orange-100', ring: 'ring-orange-400/50', bar: 'bg-orange-500' },







  YELLOW: { label: '黄色预警', bg: 'bg-yellow-400', text: 'text-yellow-900', ring: 'ring-yellow-300/50', bar: 'bg-yellow-400' },







  BLUE:   { label: '蓝色预警', bg: 'bg-cyan-400',  text: 'text-cyan-900',  ring: 'ring-cyan-300/50', bar: 'bg-cyan-400' },







}















function alertEmoji(type?: string): string {







  if (!type) return '🐘'







  if (type.includes('人象') || type.includes('冲突')) return '⚠️'







  if (type.includes('农作物') || type.includes('损毁') || type.includes('庄稼')) return '🌾'







  if (type.includes('村庄') || type.includes('闯入') || type.includes('居民')) return '🏠'







  if (type.includes('道路') || type.includes('交通')) return '🛣️'







  return '🐘'







}















// 与态势总览 3D 标记一致的类型派生（按 id 确定性映射）







function alertTypeOf(id: string): string {







  const types = ['象群入侵', '人象冲突', '农作物损毁', '闯入村庄', '道路预警']







  let h = 5381







  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)







  return types[Math.abs(h) % types.length]







}















/** 是否为推演演示生成的警情（非真实视频） */







const isSimulated = (t: TrainingTask | null): boolean =>







  !!t && (t.simulated === true || t.triggeredBy === 'realtime-demo')















/** 真实警情门控：手动登记，或实时视频流且具坐标，才可生成处置工单 */







const isRealAlert = (t: TrainingTask | null): boolean =>







  !!t &&







  (t.manual === true ||







    (t.triggeredBy === 'realtime-stream' && typeof t.lat === 'number' && typeof t.lng === 'number'))















const ROLE_LABEL: Record<string, string> = {







  admin: '系统管理员', center: '管理中心', street: '街道干部', police: '警员',







}







function distribute(level: string): string[] {







  switch (level) {







    case 'RED':







    case 'ORANGE': return ['admin', 'center', 'street', 'police']







    case 'YELLOW': return ['center', 'street', 'police']







    default: return ['street', 'police']







  }







}















export default function AlertDetailClient({ id }: { id: string }) {







  const router = useRouter()







  const [loading, setLoading] = useState(true)







  const [task, setTask] = useState<TrainingTask | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)







  const [error, setError] = useState<string | null>(null)







  const [dispatching, setDispatching] = useState(false)







  const [dispatchMsg, setDispatchMsg] = useState<{ ok: boolean; text: string } | null>(null)







  // 警情列表面板







  const [allTasks, setAllTasks] = useState<TrainingTask[]>([])







  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [sidebarTab, setSidebarTab] = useState<'active' | 'archived'>('active')

  // 侧边栏列表：按 tab 过滤 + 创建时间倒序
  const sidebarTasks = useMemo(() => {
    const filtered = sidebarTab === 'active'
      ? allTasks.filter((t) => t.status !== 'COMPLETED' && !t.aggregatedAt && !t.closedAt)
      : allTasks.filter((t) => t.status === 'COMPLETED' || t.aggregatedAt || t.closedAt)
    return [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [allTasks, sidebarTab])







  // 结案归档







  const [genReport, setGenReport] = useState(false)







  const [reportText, setReportText] = useState('')







  const [reportAi, setReportAi] = useState(false)







  const [reportError, setReportError] = useState<string | null>(null)







  const [archiving, setArchiving] = useState(false)
  // 结案归档强制标记：确认归档成功后立即设为true，防止refetch旧数据覆盖导致界面回退
  const [forceArchived, setForceArchived] = useState(false)







  const [archiveError, setArchiveError] = useState<string | null>(null)







  // 结案后刷新 DisposalTimeline 工单 + 状态守护







  const [refreshKey, setRefreshKey] = useState(0)







  const closedRef = useRef(false)







  // 结案指定成员确认







  const [selectedConfirmMembers, setSelectedConfirmMembers] = useState<string[]>([])







  const [closeConfirmations, setCloseConfirmations] = useState<{ userId: string; userName: string; confirmedAt: string; opinion: string }[]>([])







  const [pendingCloseConfirm, setPendingCloseConfirm] = useState(false)







  const [forceCloseReason, setForceCloseReason] = useState('')







  const [showForceClose, setShowForceClose] = useState(false)


  // ═══ 流程阶段门控 ═══
  const [flowStage, setFlowStage] = useState<'dispatch' | 'plan' | 'workflow' | 'monitor' | 'simulation' | 'report' | 'closure' | 'completed'>('dispatch')
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false)
  const [selectedDispatchRoles, setSelectedDispatchRoles] = useState<string[]>([])
  const [workflowComplete, setWorkflowComplete] = useState(false)
  const [showClosureModal, setShowClosureModal] = useState(false)
  const [closureChecks, setClosureChecks] = useState<boolean[]>([false, false, false, false, false])
  // 结案前风险推演与AI评估报告模态框
  const [showClosureRiskModal, setShowClosureRiskModal] = useState(false)







  // 处置工单（从服务端加载，无则自动AI生成）







  const [workflow, setWorkflow] = useState<any>(null)







  const [generatingWf, setGeneratingWf] = useState(false)



  const [genWfError, setGenWfError] = useState<string | null>(null)



  const genWfAttemptedRef = useRef(false)







  // 大模型处置监控动态建议







  const [monitorData, setMonitorData] = useState<any>(null)







  const [monitorLoading, setMonitorLoading] = useState(false)







  const [monitorError, setMonitorError] = useState<string | null>(null)







  const [monitorUpdating, setMonitorUpdating] = useState(false)














  const [monitorLastUpdate, setMonitorLastUpdate] = useState<string | null>(null)







  const monitorFetchingRef = useRef(false)














  // AI处置评估报告







  const [evalReport, setEvalReport] = useState<string>('')







  const [evalReportModel, setEvalReportModel] = useState('')







  const [evalLoading, setEvalLoading] = useState(false)







  const [evalError, setEvalError] = useState<string | null>(null)







  const [editingEval, setEditingEval] = useState(false)







  const [evalDraft, setEvalDraft] = useState('')







  // 认证状态（内存级，刷新即丢失，必须重新登录）







  const [auth, setAuth] = useState<AuthState | null>(() => (typeof window !== 'undefined' ? getAuth() : null))















  useEffect(() => {







    let alive = true







    setLoading(true); setError(null)







    fetch(`/api/tasks/${id}`)







      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))







      .then((j) => {







        if (!alive) return







        const fetched = j as TrainingTask







        // 结案守护：已结案后不允许被非 COMPLETED 数据覆盖（防止竞态/旧缓存回退）







        if (closedRef.current && fetched.status !== 'COMPLETED') {







          setLoading(false)







          return







        }







        if (fetched.status === 'COMPLETED') closedRef.current = true







        setTask(fetched); setLoading(false)


        // 初始化流程阶段门控 + 预勾选分发角色
        if (fetched.status === 'COMPLETED') {
          setFlowStage('completed')
      setForceArchived(true)
      // 关闭所有结案相关弹窗，确保界面立即跳转为已归档状态
      setShowClosureRiskModal(false)
      setShowClosureModal(false); setDispatchConfirmed(true); setWorkflowComplete(true)
        } else if (fetched.status !== 'PENDING') {
          setDispatchConfirmed(true); setFlowStage('plan')
        }
        setSelectedDispatchRoles(distribute(fetched.warningLevel))



        // 从服务端读取已保存的AI处置评估报告（只生成一次）

        if (fetched.report?.text && typeof fetched.report.text === 'string' && fetched.report.text.trim().length > 0) {

          setEvalReport(fetched.report.text)

          if (fetched.report.aiModel) setEvalReportModel(fetched.report.aiModel)

        }







        // 同时加载处置工单；无则自动触发AI生成（仅在已分发后）
        if (fetched.status !== 'PENDING') {







        fetch(`/api/disposal?taskId=${id}`, { cache: 'no-store' })







          .then((r) => (r.ok ? r.json() : null))







          .then((w) => {







            if (w?.workflow?.steps?.length > 0) {







              setWorkflow(w.workflow)







            } else {







              // 无处置工单，自动触发AI生成







              setGeneratingWf(true)







              fetch('/api/ai-analysis/disposal', {







                method: 'POST',







                headers: { 'Content-Type': 'application/json' },







                body: JSON.stringify({







                  taskId: id,







                  alertType: fetched.alertType,







                  warningLevel: fetched.warningLevel,







                  detectedCount: fetched.detectedCount,







                  location: [fetched.province, fetched.city, fetched.county, fetched.township].filter(Boolean).join('/'),







                  isNight: new Date().getHours() < 6 || new Date().getHours() >= 19,







                  lat: fetched.lat,







                  lng: fetched.lng,







                }),







              })







                .then((r) => (r.ok ? r.json() : null))







                .then((res) => {



                  if (!res) { setGenWfError('AI端点返回空响应'); return }



                  const aiSteps = res?.steps || res?.workflow?.steps || []



                  if (!aiSteps.length) {



                    setGenWfError(res?.reason || 'AI返回的处置流程为空')



                    return



                  }



                  const aiWorkflow = {



                    steps: aiSteps,



                    aiSummary: res?.aiSummary || res?.workflow?.aiSummary || '',



                    scenario: res?.scenario || res?.workflow?.scenario || '',



                    factors: res?.factors || res?.workflow?.factors || [],



                    advanced: res?.advanced || res?.workflow?.advanced || false,



                  }



                  setWorkflow(aiWorkflow)
                  setTimeout(() => fetchMonitor(true), 150) // AI处置流程生成完成后，操作后更新动态建议



                  setGenWfError(null)



                  fetch('/api/disposal', {



                    method: 'POST',



                    headers: { 'Content-Type': 'application/json' },



                    body: JSON.stringify({ taskId: id, ...aiWorkflow, generatedBy: 'ai-llm-client', aiModel: res.model || 'minimax/minimax-m3:free' }),



                  }).catch(() => {})



                })



                .catch((e) => { setGenWfError(String(e?.message || e)) })



                .finally(() => { setGeneratingWf(false); setRefreshKey(k => k + 1) })







            }







          })







          .catch(() => {})
        }







      })







      .catch((e) => { if (alive) { setError(String(e?.message || e)); setLoading(false) } })







    return () => { alive = false }







  }, [id])







  // 手动重试生成处置预案



  const retryGenerateWf = () => {



    if (!task || generatingWf) return



    setGenWfError(null); setGeneratingWf(true); genWfAttemptedRef.current = true



    fetch('/api/ai-analysis/disposal', {



      method: 'POST',



      headers: { 'Content-Type': 'application/json' },



      body: JSON.stringify({



        taskId: id,



        alertType: task.alertType,



        warningLevel: task.warningLevel,



        detectedCount: task.detectedCount,



        location: [task.province, task.city, task.county, task.township].filter(Boolean).join('/'),



        isNight: new Date().getHours() < 6 || new Date().getHours() >= 19,



        lat: task.lat,



        lng: task.lng,



      }),



    })



      .then((r) => (r.ok ? r.json() : null))



      .then((res) => {



        if (!res) { setGenWfError('AI端点返回空响应'); return }



        const aiSteps = res?.steps || res?.workflow?.steps || []



        if (!aiSteps.length) { setGenWfError(res?.reason || 'AI返回的处置流程为空'); return }



        const aiWorkflow = {



          steps: aiSteps,



          aiSummary: res?.aiSummary || res?.workflow?.aiSummary || '',



          scenario: res?.scenario || res?.workflow?.scenario || '',



          factors: res?.factors || res?.workflow?.factors || [],



          advanced: res?.advanced || res?.workflow?.advanced || false,



        }



        setWorkflow(aiWorkflow); setGenWfError(null)



        fetch('/api/disposal', {



          method: 'POST',



          headers: { 'Content-Type': 'application/json' },



          body: JSON.stringify({ taskId: id, ...aiWorkflow, generatedBy: 'ai-llm-client', aiModel: res.model || 'minimax/minimax-m3:free' }),



        }).catch(() => {})



      })



      .catch((e) => { setGenWfError(String(e?.message || e)) })



      .finally(() => { setGeneratingWf(false); setRefreshKey(k => k + 1) })



  }


  const toggleDispatchRole = (role: string) => {
    setSelectedDispatchRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])
  }


  useEffect(() => {
    if (!dispatchConfirmed || workflowComplete || task?.status === 'COMPLETED') return
    const t = setInterval(() => {
      fetch(`/api/disposal?taskId=${id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => {
          if (w?.workflow?.steps?.length > 0) {
            // 每次拉到新数据都更新 workflow（不再仅全部完成时才更新）
            setWorkflow(w.workflow)
            // 触发 DisposalTimeline 子组件重新加载
            setRefreshKey((k: number) => k + 1)
            if (w.workflow.steps.every((s: any) => s.status === 'done' || s.status === 'skipped')) {
              setWorkflowComplete(true)
            }
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [dispatchConfirmed, workflowComplete, task?.status, id])


  // 监听我的任务/待办弹窗的步骤确认事件，触发详情页同步刷新
  useEffect(() => {
    const refreshIfMatch = (taskId: string) => {
      if (taskId === id) {
        setRefreshKey((k: number) => k + 1)
      }
    }
    // CustomEvent（同标签页内同步）
    const customHandler = (e: Event) => {
      const ce = e as CustomEvent
      const detail = ce.detail as { taskId?: string; stepId?: string }
      if (detail?.taskId) refreshIfMatch(detail.taskId)
    }
    window.addEventListener('todo:step-confirmed', customHandler as EventListener)
    // BroadcastChannel（跨标签页同步）
    const unsubscribe = subscribeWorkflowStepConfirmed(refreshIfMatch)
    return () => {
      window.removeEventListener('todo:step-confirmed', customHandler as EventListener)
      unsubscribe()
    }
  }, [id])

  useEffect(() => {
    if (flowStage === 'completed') return
    if (dispatchConfirmed && workflow) setFlowStage(workflowComplete ? (evalReport ? 'closure' : 'report') : 'workflow')
  }, [dispatchConfirmed, workflow, workflowComplete, evalReport, flowStage])







  // 拉取全部警情用于侧边栏快速切换







  useEffect(() => {







    let alive = true







    fetch('/api/tasks', { cache: 'no-store' })







      .then((r) => (r.ok ? r.json() : Promise.resolve([])))







      .then((arr) => { if (alive) setAllTasks(Array.isArray(arr) ? arr : []) })







      .catch(() => {})







    return () => { alive = false }







  }, [])















  // 周期性同步警情状态（每5秒）：确保结案后状态不被任何竞态/旧数据覆盖回退







  useEffect(() => {







    const timer = setInterval(() => {







      fetch(`/api/tasks/${id}`, { cache: 'no-store' })







        .then((r) => (r.ok ? r.json() : null))







        .then((j) => {







          if (!j) return







          const fetched = j as TrainingTask







          setTask((prev) => {







            // 已结案守护：不允许非 COMPLETED 覆盖







            if (closedRef.current && fetched.status !== 'COMPLETED') return prev







            if (fetched.status === 'COMPLETED') closedRef.current = true







            // 仅在数据确实变化时更新（避免不必要的重渲染）







            if (prev && JSON.stringify(prev) === JSON.stringify(fetched)) return prev







            return fetched







          })







        })







        .catch(() => {})







    }, 5000)







    return () => clearInterval(timer)







  }, [id])















  const type = alertTypeOf(id)







  const lv = task ? LEVEL_META[task.warningLevel] : null







  const a = task?.autonomous







  // 从全局 authStore 读取当前角色（内存级，刷新即丢失）







  const currentRole = auth?.role || 'admin'







  const currentName = auth?.name || '管理员'







  // 未登录时跳转登录页







  useEffect(() => {







    const unsub = subscribeAuth((a) => setAuth(a))







    if (!getAuth()) router.replace('/')







    return () => unsub()







  }, [router])







  const real = isRealAlert(task)







  const distRoles = task ? distribute(task.warningLevel) : []















  const confirmDispatch = async () => {







    if (!task || dispatching) return







    setDispatching(true); setDispatchMsg(null)







    try {







      const r = await fetch('/api/dispatch/confirm', {







        method: 'POST',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ taskId: task.id, by: currentName, roles: selectedDispatchRoles }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok) {







        setDispatchMsg({ ok: true, text: `已确认并分发 ${d.summary?.sent ?? 0}/${d.summary?.total ?? 6} 个通道` })







        setDispatchConfirmed(true); setFlowStage('plan')
        setTimeout(() => retryGenerateWf(), 300)
      } else {







        setDispatchMsg({ ok: false, text: d.error || '分发失败' })







      }







    } catch (e: any) {







      setDispatchMsg({ ok: false, text: e?.message || '分发失败' })







    } finally {







      setDispatching(false)







    }







  }















  // 生成结案报告（真实 AI）







  const generateReport = async () => {







    if (!task || genReport) return







    setGenReport(true); setReportError(null); setReportText(''); setReportAi(false)







    try {







      // 先拉取处置工单用于报告生成







      const wfRes = await fetch(`/api/disposal?taskId=${encodeURIComponent(task.id)}`, { cache: 'no-store' })







      const wfData = await wfRes.json().catch(() => null)







      const wf = wfData?.workflow || wfData || null







      const r = await fetch('/api/ai-analysis/report', {







        method: 'POST',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ task, workflow: wf }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok && d.ai === true && typeof d.report === 'string' && d.report.trim().length > 0) {







        setReportText(d.report)







        setReportAi(true)







      } else {







        setReportError(d?.reason || 'AI 报告生成失败')







        setReportText(d?.report || '')







      }







    } catch (e: any) {







      setReportError(e?.message || 'AI 报告生成失败')







    } finally {







      setGenReport(false)







    }







  }























  // 获取大模型处置监控动态建议（isAuto=true时不显示全屏loading，仅显示更新指示器）







  const fetchMonitor = async (isAuto = false) => {







    if (!task) return
    // 结案守卫：已结案警情不再生成任何 AI 监控建议
    if (task.status === 'COMPLETED' || closedRef.current) return







    if (monitorFetchingRef.current) return // 调用锁：防止并发







    monitorFetchingRef.current = true







    if (!isAuto) setMonitorLoading(true)







    setMonitorError(null); setMonitorUpdating(true)







    try {







      const wfRes = await fetch(`/api/disposal?taskId=${encodeURIComponent(task.id)}`, { cache: 'no-store' })







      const wfData = await wfRes.json().catch(() => null)







      const wf = wfData?.workflow || wfData || null







      const r = await fetch('/api/ai-analysis/monitor', {







        method: 'POST',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ task, workflow: wf }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok && d.ai === true && d.monitor) {







        setMonitorData(d.monitor)







        setMonitorLastUpdate(new Date().toLocaleTimeString('zh-CN', { hour12: false }))







      } else {







        setMonitorError(d?.reason || 'AI监控建议获取失败')







      }







    } catch (e: any) {







      setMonitorError(e?.message || 'AI监控建议获取失败')







    } finally {







      setMonitorLoading(false)







      setMonitorUpdating(false)







      







      monitorFetchingRef.current = false







    }







  }















  // 手动刷新监控建议







  const handleManualRefresh = () => {







    if (monitorFetchingRef.current) return







    fetchMonitor(false)







  }















  // 生成AI处置评估报告







  // 保存AI处置评估报告到服务端（PUT /api/tasks，更新task.report字段）

  const saveEvalReportToServer = async (reportText: string, model: string) => {

    if (!task || !reportText.trim()) return false

    try {

      const now = new Date().toISOString()

      const r = await fetch('/api/tasks', {

        method: 'PUT',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          ...task,

          report: {

            text: reportText.trim(),

            aiModel: model || 'minimax/minimax-m3:free',

            generatedAt: now,

            editedBy: currentName,

          },

        }),

      })

      return r.ok

    } catch {

      return false

    }

  }



  const generateEvalReport = async () => {







    if (!task) return







    setEvalLoading(true); setEvalError(null); setEvalReport('')







    try {







      const wfRes = await fetch(`/api/disposal?taskId=${encodeURIComponent(task.id)}`, { cache: 'no-store' })







      const wfData = await wfRes.json().catch(() => null)







      const wf = wfData?.workflow || wfData || null







      const r = await fetch('/api/ai-analysis/report', {







        method: 'POST',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ task, workflow: wf }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok && d.ai === true && typeof d.report === 'string' && d.report.trim().length > 0) {







        setEvalReport(d.report)







        setEvalReportModel(d.model || 'minimax/minimax-m3:free')



        // 生成后即刻保存到服务端（只生成一次，再次进入直接读取）

        await saveEvalReportToServer(d.report, d.model || 'minimax/minimax-m3:free')







      } else {







        setEvalError(d?.reason || 'AI评估报告生成失败')







      }







    } catch (e: any) {







      setEvalError(e?.message || 'AI评估报告生成失败')







    } finally {







      setEvalLoading(false)







    }







  }















  // 首次自动加载监控建议







  useEffect(() => {







    if (task && workflow && !monitorData && !monitorLoading && !monitorFetchingRef.current) {







      fetchMonitor(false)







    }







  }, [task?.id])






























  // 保存报告到服务端（独立于归档）







  const saveReport = async () => {







    if (!task || !reportText.trim()) return







    try {







      const now = new Date().toISOString()







      const report = {







        text: reportText,







        aiModel: evalReportModel || 'minimax/minimax-m3:free',







        generatedAt: now,







        editedBy: currentName,







      }







      const r = await fetch('/api/tasks', {







        method: 'PUT',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ ...task, report }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok && d.success) {







        setTask({ ...task, report })







        recordLog({ userName: currentName, role: currentRole, action: 'EDIT_REPORT', detail: `警情 ${task.id} 保存结案报告` })







      }







    } catch (e: any) { /* ignore */ }







  }















  // 编辑已归档报告







  const [editingArchivedReport, setEditingArchivedReport] = useState(false)







  const [archivedReportDraft, setArchivedReportDraft] = useState('')















  const startEditArchivedReport = () => {







    if (task?.report?.text) {







      setArchivedReportDraft(task.report.text)







      setEditingArchivedReport(true)







    }







  }















  const cancelDispatch = async () => {
    if (!task || cancelling) return
    setCancelling(true)
    try {
      const r = await fetch('/api/dispatch/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, by: currentName, reason: cancelReason }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw new Error(j?.error || '取消分发失败')
      setShowCancelConfirm(false)
      setCancelReason('')
      window.location.reload()
    } catch (e: any) {
      alert(e?.message || '取消分发失败')
    } finally {
      setCancelling(false)
    }
  }

  const saveArchivedReport = async () => {







    if (!task || !archivedReportDraft.trim()) return







    try {







      const now = new Date().toISOString()







      const report = {







        text: archivedReportDraft.trim(),







        aiModel: task.report?.aiModel || undefined,







        generatedAt: task.report?.generatedAt || now,







        editedBy: currentName,







        editedAt: now,







        archivedAt: task.report?.archivedAt || now,







        videoPersisted: task.report?.videoPersisted || false,







      }







      const r = await fetch('/api/tasks', {







        method: 'PUT',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ ...task, report }),







      })







      const d = await r.json().catch(() => ({}))







      if (r.ok && d.success) {







        setTask({ ...task, report })







        setEditingArchivedReport(false)







      }







    } catch (e: any) { /* ignore */ }







  }















  // 确认结案归档







  const confirmArchive = async (overrideReportText?: string, overrideReportModel?: string): Promise<boolean> => {







    if (!task || archiving) return false







    if (currentRole !== 'admin') return false







    setArchiving(true); setArchiveError(null)







    try {







      const now = new Date().toISOString()







      const reportText = (overrideReportText && overrideReportText.trim()) ? overrideReportText.trim() : (evalReport.trim() || '（未生成AI处置评估报告）')
      const reportModel = overrideReportModel || evalReportModel || 'minimax/minimax-m3:free'








      const report = {







        text: reportText,







        aiModel: reportModel,







        generatedAt: now,







        editedBy: currentName,







        archivedAt: now,







        videoPersisted: false,







      }







      const r = await fetch('/api/disposal', {







        method: 'PATCH',







        headers: { 'Content-Type': 'application/json' },







        body: JSON.stringify({ taskId: task.id, advance: true, by: currentName, report }),







      })







      const d = await r.json().catch(() => ({}))







      if (!r.ok || !d.success) throw new Error(d.error || '归档失败')

      // ── 立即更新本地状态，无需等待重新fetch ──
      setTask((prev) => prev ? { ...prev, status: 'COMPLETED', closedAt: now, closedBy: currentName, completedAt: now, updatedAt: now, report: report } : prev)
      // 立即更新左侧警情列表中对应任务的状态，无需等待重新fetch
      setAllTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: 'COMPLETED', closedAt: now, closedBy: currentName, completedAt: now, updatedAt: now, report: report } : t))
      closedRef.current = true
      setFlowStage('completed')
      setDispatchConfirmed(true)
      setWorkflowComplete(true)
      setWorkflow((prev: any) => {
        if (!prev) return prev
        // 结案时同步将所有未完成步骤标记为done，确保处置预案进度立即更新
        const nowSteps = Array.isArray(prev.steps)
          ? prev.steps.map((s: any) => (s.status === 'done' || s.status === 'skipped') ? s : { ...s, status: 'done', doneAt: s.doneAt || now, executedAt: s.executedAt || now })
          : []
        return { ...prev, advanced: true, steps: nowSteps }
      })
      // 同步评估报告状态（确保弹窗中生成的报告回写到页面状态）
      if (overrideReportText && overrideReportText.trim()) {
        setEvalReport(overrideReportText.trim())
        setEvalReportModel(overrideReportModel || evalReportModel || 'minimax/minimax-m3:free')
      }







      recordLog({ userName: currentName, role: currentRole, action: LOG_ACTIONS.CLOSE_CASE, detail: `警情 ${task.id}（${task.name}）结案归档` })







      // 刷新警情详情







      const t2 = await fetch(`/api/tasks/${task.id}`, { cache: 'no-store' })







      if (t2.ok) {







        const j2 = await t2.json()







        // 结案守护：防止服务端竞态/旧缓存返回非 COMPLETED 状态覆盖本地已结案状态
        const fetchedTask = j2 as TrainingTask
        if (closedRef.current && fetchedTask.status !== 'COMPLETED') {
          // 服务端返回了旧数据，保留本地已结案状态，仅合并其他字段
          setTask((prev) => prev ? { ...fetchedTask, status: 'COMPLETED', completedAt: prev.completedAt, report: (prev as any).report, closedAt: (prev as any).closedAt, closedBy: (prev as any).closedBy } : fetchedTask)
        } else {
          setTask(fetchedTask)
        }


      }























        // 刷新左侧警情列表（allTasks），确保结案后列表状态同步（始终执行，不依赖t2.ok）
        try {
          const allRes = await fetch('/api/tasks', { cache: 'no-store' })
          if (allRes.ok) {
            const allData = await allRes.json()
            const allList = Array.isArray(allData) ? allData : (allData?.tasks ?? [])
            // 结案守护：确保左侧列表中当前任务保持 COMPLETED 状态
            const guardedList = (allList as TrainingTask[]).map((t) =>
              closedRef.current && t.id === task.id && t.status !== 'COMPLETED'
                ? { ...t, status: 'COMPLETED' as const, completedAt: now, closedAt: now as any, closedBy: currentName as any }
                : t
            )
            setAllTasks(guardedList)
          }
        } catch { /* ignore */ }
      setRefreshKey((k) => k + 1)  // 触发 DisposalTimeline 重新拉取工单（advanced:true）

      // 派发全局结案事件，通知主页面等组件刷新警情列表
      window.dispatchEvent(new CustomEvent('task:closed', { detail: { taskId: task.id } }))







      setReportText('')







      setReportAi(false)
      return true














    } catch (e: any) {







      setArchiveError(e?.message || '归档失败')
      return false














    } finally {







      setArchiving(false)







    }







  }















  // 发起结案（指定成员确认模式）







  const initiateCloseWithMembers = () => {







    if (!task || selectedConfirmMembers.length === 0) return







    setPendingCloseConfirm(true)







    setCloseConfirmations([])







    recordLog({ userName: currentName, role: currentRole, action: LOG_ACTIONS.CLOSE_CASE, detail: `警情 ${task.id} 发起结案，指定 ${selectedConfirmMembers.length} 名成员确认` })







  }















  // 成员确认结案







  const confirmCloseByMember = (opinion: string) => {







    if (!task || !auth) return







    const userId = auth.user







    const userName = auth.name







    // 检查是否已确认







    if (closeConfirmations.some((c) => c.userId === userId)) return







    const newConf = { userId, userName, confirmedAt: new Date().toISOString(), opinion: opinion || '同意结案' }







    const updated = [...closeConfirmations, newConf]







    setCloseConfirmations(updated)







    recordLog({ userName, role: auth.role, action: LOG_ACTIONS.CLOSE_CASE, detail: `警情 ${task.id} 结案确认：${opinion || '同意结案'}` })







    // 检查是否全部确认







    if (updated.length >= selectedConfirmMembers.length) {







      // 全部确认，自动执行结案







      setTimeout(() => confirmArchive(), 500)







    }







  }















  // 管理员强制结案







  const forceClose = async () => {







    if (!task || !forceCloseReason.trim()) return







    recordLog({ userName: currentName, role: currentRole, action: LOG_ACTIONS.CLOSE_CASE, detail: `警情 ${task.id} 管理员强制结案，原因：${forceCloseReason}` })







    setShowForceClose(false)







    setPendingCloseConfirm(false)







    await confirmArchive()







  }















  // 当前用户是否为待确认成员







  const isPendingMember = auth && pendingCloseConfirm && selectedConfirmMembers.includes(auth.user)







  const hasConfirmed = auth && closeConfirmations.some((c) => c.userId === auth.user)















  const isArchived = forceArchived || task?.status === 'COMPLETED' || !!task?.report?.archivedAt















  return (







    <div className="flex min-h-screen bg-[#050b18] text-slate-100">







      {/* ═══ 左侧警情列表面板（可折叠） ═══ */}







      <aside







        className={`shrink-0 border-r border-slate-700/40 bg-slate-950/80 transition-all duration-200 ${







          sidebarOpen ? 'w-64' : 'w-10'







        }`}







      >







        <div className="flex items-center justify-between border-b border-slate-700/40 px-2 py-2.5">







          {sidebarOpen && <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><List size={12} /> 警情列表</span>}







          <button







            onClick={() => setSidebarOpen(!sidebarOpen)}







            className="ml-auto rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"







            title={sidebarOpen ? '折叠列表' : '展开列表'}







          >







            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}







          </button>







        </div>







        {sidebarOpen && (







          <div className="max-h-[calc(100vh-42px)] overflow-y-auto p-1.5">

            <div className="mb-2 flex gap-1 rounded-md bg-slate-800/50 p-0.5">
              <button onClick={() => setSidebarTab('active')} className={sidebarTab === 'active' ? 'flex-1 cursor-pointer rounded bg-cyan-500/20 px-2 py-1 text-[10px] font-medium text-cyan-200 ring-1 ring-cyan-400/30 transition' : 'flex-1 cursor-pointer rounded px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:text-slate-200'}>正在处置</button>
              <button onClick={() => setSidebarTab('archived')} className={sidebarTab === 'archived' ? 'flex-1 cursor-pointer rounded bg-cyan-500/20 px-2 py-1 text-[10px] font-medium text-cyan-200 ring-1 ring-cyan-400/30 transition' : 'flex-1 cursor-pointer rounded px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:text-slate-200'}>结案警情</button>
            </div>








            <CommonPagination
              items={sidebarTasks}
              searchKeys={['name', 'id', 'warningLevel', 'status']}
              pageSize={10}
              compact={true}
              searchPlaceholder="搜索警情..."
              emptyText={sidebarTab === 'active' ? '暂无正在处置的警情' : '暂无已结案警情'}
            >
              {(pageItems) => (
                <div className="space-y-1">
                  {pageItems.map((t) => {
                    const tlv = LEVEL_META[t.warningLevel] || LEVEL_META.BLUE
                    const active = t.id === id
                    return (
                      <button
                        key={t.id}
                        onClick={() => router.push(`/alert/${t.id}`)}
                        className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                            : 'border-transparent hover:border-slate-600/50 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${tlv.bg}`}>{tlv.label.slice(0, 2)}</span>
                          <span className={`truncate text-[12px] font-medium ${active ? 'text-cyan-100' : 'text-slate-300'}`}>{t.name}</span>
                          {active && <ChevronRight size={11} className="ml-auto shrink-0 text-cyan-400" />}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span className={t.status === 'COMPLETED' ? 'text-emerald-400' : 'text-amber-400'}>
                            {t.status === 'COMPLETED' ? '已结案' : '正在处置'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CommonPagination>







          </div>







        )}







      </aside>















      {/* ═══ 主内容区 ═══ */}







      <div className="min-w-0 flex-1">







      <header className="flex items-center justify-between border-b border-cyan-400/15 bg-slate-950 px-6 py-4">







        <div className="flex items-center gap-3">







          <button







            onClick={() => router.push('/')}







            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"







          >







            <ArrowLeft size={16} /> 返回







          </button>







          <div className="flex items-center gap-2">







            <ShieldAlert size={22} className="text-cyan-300" />







            <span className="text-base font-bold tracking-wide text-white">天眼护象 · 警情详情</span>







          </div>







        </div>







        <span className="text-xs text-slate-500">编号 {id}</span>







      </header>















      <main className="mx-auto max-w-4xl p-6">







        {loading ? (







          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">







            <Loader2 size={20} className="animate-spin" /> 加载警情详情…







          </div>







        ) : error || !task ? (







          <div className="flex flex-col items-center gap-3 py-20 text-rose-300">







            <AlertTriangle size={28} />







            <p className="text-sm">警情详情加载失败：{error || '未找到该警情'}</p>







            <button onClick={() => router.push('/')} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">







              返回







            </button>







          </div>







        ) : (







          <div className="space-y-5">







            {/* 概要卡片 */}







            <div className="dv-panel rounded-xl p-5">







              <div className="flex flex-wrap items-center gap-3">







                <span className="text-3xl">{alertEmoji(type)}</span>







                <span className={`rounded-full px-3 py-1 text-sm font-bold ${lv?.bg} ${lv?.text} ring-2 ${lv?.ring}`}>{lv?.label}</span>







                <span className="rounded-full bg-slate-800/70 px-3 py-1 text-sm text-slate-200">{alertEmoji(type)} {type}</span>







                <span className="rounded-full bg-slate-800/70 px-3 py-1 text-xs text-slate-400">状态：{taskStatusLabel(task.status)}</span>







                {isSimulated(task) && (







                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">







                    <FlaskConical size={13} /> 推演演示 · 非真实视频







                  </span>







                )}







              </div>







              <div className="mt-4 flex items-start gap-2">







                <p className="flex-1 text-sm leading-7 text-slate-200">{task.aiSummary || task.name}</p>







                {task.aiModel && (







                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200 ring-1 ring-violet-400/30">







                    <Sparkles size={10} /> 大模型







                  </span>







                )}







              </div>







            </div>
































            {/* 关键指标 */}







            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">







              <div className="dv-card p-4">







                <div className="flex items-center gap-1 text-xs text-slate-400"><Thermometer size={13} className="text-rose-300" /> 入侵风险指数</div>







                <div className="mt-1 text-2xl font-bold text-white">{task.intrusionRisk}</div>







              </div>







              <div className="dv-card p-4">







                <div className="flex items-center gap-1 text-xs text-slate-400"><ScanSearch size={13} className="text-sky-300" /> 检测数量</div>







                <div className="mt-1 text-2xl font-bold text-white">{task.detectedCount}</div>







              </div>







              <div className="dv-card p-4">







                <div className="flex items-center gap-1 text-xs text-slate-400"><Route size={13} className="text-emerald-300" /> 预测窗口</div>







                <div className="mt-1 text-lg font-bold text-white">{task.predictionWindow}</div>







              </div>







              <div className="dv-card p-4">







                <div className="flex items-center gap-1 text-xs text-slate-400"><Cpu size={13} className="text-cyan-300" /> 研判来源</div>







                <div className="mt-1 text-lg font-bold text-white">AI 大模型</div>







              </div>







            </div>















            {/* 处置预案（图文可视化设计） */}
            {dispatchConfirmed && (

            <div className="dv-panel rounded-xl p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cyan-200">
                <CheckCircle2 size={16} /> 处置预案
                {workflow?.aiModel && <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">AI 处置流程</span>}
                {workflow?.scenario && <span className="ml-2 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-200">{workflow.scenario}</span>}
              </h3>

              {generatingWf ? (
                <div className="flex items-center gap-2 py-4 text-sm text-cyan-300">
                  <Loader2 size={16} className="animate-spin" /> AI 正在生成处置流程…
                </div>
              ) : genWfError ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex items-center gap-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
                    <AlertTriangle size={13} /> {genWfError}
                  </div>
                  <button onClick={retryGenerateWf} disabled={generatingWf} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50">
                    {generatingWf ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 重新生成处置流程（AI）
                  </button>
                </div>
              ) : workflow?.steps?.length > 0 ? (
                <DisposalPlanVisual workflow={workflow} currentStageIdx={workflowComplete ? 4 : 1} />
              ) : (
                <p className="py-4 text-sm text-slate-500">处置预案生成中…</p>
              )}
            </div>
            )}

            {/* AI 自主研判 */}







            {a && dispatchConfirmed && (







              <div className="dv-panel rounded-xl p-5">







                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-violet-200">







                  <BrainCircuit size={16} /> AI 自主研判







                  {a.autoEscalated && <span className="rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] text-red-200">已自动升级</span>}







                </h3>







                <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">







                  决策置信度







                  <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-700">







                    <div className={`h-full ${lv?.bar}`} style={{ width: `${a.decisionConfidence}%` }} />







                  </div>







                  <span className="font-bold text-white">{a.decisionConfidence}</span>







                </div>







                {a.evidenceChain?.length > 0 && (







                  <div className="mb-3">







                    <div className="mb-1.5 text-xs text-slate-400">证据链</div>







                    <ol className="space-y-1.5">







                      {a.evidenceChain.map((e, i) => (







                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">







                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/30 text-[10px] text-cyan-100">{i + 1}</span>







                          {e}







                        </li>







                      ))}







                    </ol>







                  </div>







                )}







                <div className="mb-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-100">







                  <span className="font-semibold">立即执行：</span>{a.recommendedImmediateAction}







                </div>







                <div className="rounded-md bg-slate-800/40 p-3 text-sm leading-6 text-slate-300">







                  <span className="font-semibold text-slate-100">处置结论：</span>{a.problemResolution}







                </div>







              </div>







            )}















            {/* ═══ 大模型·处置监控·动态建议（实时更新 + 跳动紫色小球） ═══ */}
            {workflow && (







            <div className="dv-panel rounded-xl p-5">







              <div className="mb-4 flex items-center justify-between">







                <h3 className="flex items-center gap-2 text-sm font-bold text-violet-200">







                  <span className="dv-bounce-dot inline-block h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]"></span>







                  大模型·处置监控·动态建议















                </h3>







                <div className="flex items-center gap-3">







                  {task?.status !== 'COMPLETED' && (







                    <span className="flex items-center gap-1 text-[10px] text-emerald-300">







                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>







                      操作后自动更新







                    </span>







                  )}














                  {monitorUpdating && (







                    <span className="flex items-center gap-1 text-[10px] text-violet-300">







                      <Loader2 size={10} className="animate-spin" /> 正在分析最新态势…







                    </span>







                  )}







                  {monitorLastUpdate && !monitorUpdating && (







                    <span className="text-[10px] text-slate-500">最后更新：{monitorLastUpdate}</span>







                  )}







                  {task?.status !== 'COMPLETED' && (







                    <button







                      onClick={handleManualRefresh}







                      disabled={monitorUpdating}







                      className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-40"







                      title="立即刷新监控建议"







                    >







                      <RefreshCw size={10} className={monitorUpdating ? 'animate-spin' : ''} /> 刷新







                    </button>







                  )}







                </div>







              </div>







              {(task?.status === 'COMPLETED' || closedRef.current) ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 py-8">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                    <Archive size={20} className="text-emerald-300" />
                  </div>
                  <p className="text-[12px] font-medium text-emerald-200">案件已归档，AI 监控已停止</p>
                  <p className="text-[10px] text-slate-500">所有处置流程已固定，不再生成新的动态建议</p>
                </div>
              ) : monitorLoading ? (







                <div className="flex items-center gap-2 py-6 text-sm text-violet-300">







                  <Loader2 size={16} className="animate-spin" /> AI 正在分析处置态势，生成动态建议…







                </div>







              ) : monitorError ? (







                <div className="flex items-center gap-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">







                  <AlertTriangle size={13} /> {monitorError}







                  {task?.status !== 'COMPLETED' && <span className="text-rose-300/70">，将在30秒后重试</span>}







                </div>







              ) : monitorData?.suggestions?.length > 0 ? (







                <div className="space-y-3">







                  {monitorData.suggestions.slice(0, 8).map((s: any, i: number) => (







                    <div key={i} className="flex items-start gap-3 rounded-lg border border-violet-400/10 bg-slate-800/50 p-3 transition hover:border-violet-400/25">







                      <span className="dv-bounce-dot mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]"></span>







                      <p className="text-[12px] leading-6 text-slate-200">{s.text}</p>







                    </div>







                  ))}







                  {/* AI处置评估报告 */}







                  {monitorData?.evaluation?.summary && (







                    <div className="mt-4 rounded-lg border-2 border-violet-400/25 bg-gradient-to-br from-violet-500/8 to-slate-900/40 p-4">







                      <div className="mb-2 flex items-center gap-2">







                        <FileText size={14} className="text-violet-300" />







                        <span className="text-[12px] font-bold text-violet-200">AI处置评估报告</span>







                      </div>







                      <p className="text-[12px] leading-6 text-slate-300">{monitorData.evaluation.summary}</p>







                      <div className="mt-3 flex items-center gap-4">







                        <div className="flex-1">







                          <div className="mb-1 flex justify-between text-[10px] text-slate-400">







                            <span>处置进度</span>







                            <span>{monitorData.evaluation.stepsDone ?? 0}/{monitorData.evaluation.stepsTotal ?? 0} 步</span>







                          </div>







                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">







                            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500" style={{ width: `${Math.round(((monitorData.evaluation.stepsDone ?? 0) / Math.max(1, monitorData.evaluation.stepsTotal ?? 1)) * 100)}%` }}></div>







                          </div>







                        </div>







                        {monitorData.evaluation.durationNote && <span className="text-[10px] text-slate-500">{monitorData.evaluation.durationNote}</span>}







                      </div>







                    </div>







                  )}







                </div>







              ) : (







                <p className="py-4 text-center text-[12px] text-slate-500">AI正在分析处置态势，稍后自动生成动态建议…</p>







              )}







            </div>































            )}
            {workflow && (
            <div>







              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">







                <ClipboardList size={15} className="text-amber-300" /> AI 处置流程







              </div>







              <DisposalTimeline







                taskId={task.id}







                level={task.warningLevel}







                real={true}







                currentRole={currentRole}







                currentName={currentName}







                task={task}







                refreshKey={refreshKey}







                disableClosure={true}
                onChanged={() => fetchMonitor(true)}







              />







            </div>















            )}






















            {/* ═══ 1.6小时风险推演（数学模型+AI分析） ═══ */}
            {workflowComplete && (







            <div className="mt-6">







              <RiskSimulationPanel task={task} />







            </div>
            )}























            {/* ═══ 底部：结案归档（独立突出区域） ═══ */}







            <div className="mt-6 rounded-xl border-2 border-amber-400/30 bg-gradient-to-b from-amber-500/5 to-slate-900/40 p-5">







              <div className="mb-3 flex items-center gap-2">







                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">







                  <Archive size={15} />







                </span>







                <h3 className="text-base font-bold text-amber-100">结案归档</h3>







                {isArchived && (







                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">







                    <CheckCircle2 size={11} /> 已结案归档







                  </span>







                )}







              </div>















              {isArchived ? (







                /* 已结案：显示状态 + 查看报告 */







                <div className="space-y-3">







                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-400">







                    <span>结案时间：{task.report?.archivedAt ? new Date(task.report.archivedAt).toLocaleString('zh-CN') : (task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '—')}</span>







                    <span>归档人：{task.report?.editedBy || '管理员'}</span>







                  </div>







                  {task.report && (







                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">







                      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-300">







                        <FileText size={13} className="text-cyan-300" /> 结案报告







                        {task.report.aiModel && <span className="ml-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-200">AI生成</span>}







                      </div>







                      <p className="whitespace-pre-wrap text-[12px] leading-5 text-slate-300">{task.report.text}</p>







                    </div>







                  )}







                </div>







              ) : (







                /* 未结案：确认结案归档（管理员操作），报告取自上方AI处置评估报告 */







                <div className="space-y-3">







                  <p className="text-[12px] text-slate-400">{evalReport ? '确认结案归档后，上方「AI处置评估报告」将永久保存为结案报告。仅管理员可操作。' : '请先完成风险推演并生成「AI处置评估报告」后，再进行结案归档。'}</p>
                  {/* ═══ 结案报告（合并AI评估报告，确认归档前可编辑，归档后只读） ═══ */}
                  {evalLoading && (
                    <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-sm text-violet-300">
                      <Loader2 size={16} className="animate-spin" /> AI 正在生成结案报告…
                    </div>
                  )}
                  {evalError && !evalLoading && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-[12px] text-rose-200">
                      <AlertTriangle size={13} /> {evalError}
                      <button onClick={generateEvalReport} className="ml-auto rounded border border-rose-400/40 px-2 py-0.5 text-[10px] text-rose-200 hover:bg-rose-500/20">重试</button>
                    </div>
                  )}
                  {editingEval && !evalLoading && (
                    <div className="space-y-2 rounded-lg border border-violet-500/30 bg-slate-800/60 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
                        <Edit3 size={11} /> 编辑结案报告
                      </div>
                      <textarea value={evalDraft} onChange={(e) => setEvalDraft(e.target.value)} rows={10} className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 p-3 text-[12px] leading-5 text-slate-200 outline-none focus:border-violet-400/50" />
                      <div className="flex gap-2">
                        <button onClick={async () => { setEvalReport(evalDraft); setEditingEval(false); await saveEvalReportToServer(evalDraft, evalReportModel) }} className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-500">保存修改</button>
                        <button onClick={() => setEditingEval(false)} className="rounded-md border border-slate-600/60 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-700/40">取消</button>
                      </div>
                    </div>
                  )}
                  {evalReport && !editingEval && !evalLoading && (
                    <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
                          <FileText size={12} /> 结案报告（AI评估报告）
                          {evalReportModel && <span className="ml-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-200">AI生成</span>}
                        </span>
                        {currentRole === 'admin' && (
                          <div className="flex gap-1.5">
                            <button onClick={() => { setEvalDraft(evalReport); setEditingEval(true) }} className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/20">
                              <Edit3 size={10} /> 修改
                            </button>
                            <button onClick={generateEvalReport} disabled={evalLoading} className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
                              {evalLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} 重新生成
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-5 text-slate-300">{evalReport}</p>
                    </div>
                  )}
                  {!evalReport && !editingEval && !evalLoading && !evalError && (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/[0.03] p-4">
                      <p className="text-[12px] text-slate-500">结案报告尚未生成，由AI大模型基于处置过程自动生成</p>
                      {currentRole === 'admin' && (
                        <button onClick={generateEvalReport} className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-500">
                          <Sparkles size={13} /> 生成结案报告（AI）
                        </button>
                      )}
                      {currentRole !== 'admin' && <p className="text-[11px] text-slate-500">结案报告待管理员生成</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">







                    {currentRole === 'admin' && (







                      <button







                        onClick={() => setShowClosureRiskModal(true)}







                        disabled={archiving || !evalReport}







                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"







                      >







                        {archiving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}







                        {archiving ? '归档中…' : '确认结案归档'}







                      </button>







                    )}







                    {currentRole !== 'admin' && (







                      <p className="text-[11px] text-slate-500">仅管理员可执行结案归档操作</p>







                    )}







                    {archiveError && (







                      <span className="text-[11px] text-rose-300">{archiveError}</span>







                    )}







                  </div>







                </div>







              )}







            </div>















            <p className="mt-4 text-center text-xs text-slate-600">







              创建时间：{task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '—'}







            </p>







          </div>







        )}







      </main>







      </div>







    
        {showClosureRiskModal && task && (
          <ClosureRiskModal
            task={task}
            existingReport={evalReport}
            existingReportModel={evalReportModel}
            archiving={archiving}
            archiveError={archiveError}
            onClose={() => setShowClosureRiskModal(false)}
            onConfirmArchive={async (reportText?: string, reportModel?: string) => {
              const ok = await confirmArchive(reportText, reportModel)
              if (ok) setShowClosureRiskModal(false)
            }}
          />
        )}

        {showClosureModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowClosureModal(false)}>
            <div className="w-full max-w-lg rounded-2xl border border-cyan-400/20 bg-slate-900/95 p-5 shadow-2xl backdrop-blur" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-300"><ClipboardList size={16} /></span>
                  <span className="text-base font-bold text-slate-100">人工确认与评估</span>
                </div>
                <button onClick={() => setShowClosureModal(false)} className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"><XCircle size={18} /></button>
              </div>
              <p className="mb-3 text-[12px] leading-5 text-slate-400">结案归档前，请逐项确认以下事项。全部勾选后，「已结案归档」按钮方可点击。</p>
              <div className="space-y-2">
                {[
                  { label: '警情信息核实确认', desc: '核实警情来源、象群规模、位置等信息准确性' },
                  { label: '处置效果评估', desc: '评估驱离、疏散、封锁等处置措施的实际效果' },
                  { label: '人员反馈确认', desc: '确认护林员、民警、街道干部等处置人员的反馈' },
                  { label: '数据归档完成', desc: '确认处置过程数据、影像、记录已完整归档' },
                  { label: '结案报告生成', desc: '确认结案报告已生成并审核通过' },
                ].map((item, i) => {
                  const checked = closureChecks[i]
                  return (
                    <button key={i} onClick={() => setClosureChecks((prev) => prev.map((c, idx) => idx === i ? !c : c))}
                      className="flex w-full items-start gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left transition hover:border-slate-600">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${checked ? 'bg-emerald-500 text-white' : 'border border-slate-500 bg-transparent'}`}>{checked && <CheckCircle2 size={12} />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-slate-200">{item.label}</div>
                        <div className="text-[10px] text-slate-500">{item.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-700/40 pt-3">
                <span className="text-[11px] text-slate-500">已确认 {closureChecks.filter(Boolean).length}/5 项</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowClosureModal(false)} className="rounded-md border border-slate-600/60 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700/40">取消</button>
                  <button onClick={async () => { const ok = await confirmArchive(); if (ok) { setShowClosureModal(false); setClosureChecks([false,false,false,false,false]); } }}
                    disabled={archiving || closureChecks.some((c) => !c)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40">
                    {archiving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {archiving ? '归档中…' : '已结案归档'}
                  </button>
                </div>
              </div>
              {archiveError && <p className="mt-2 text-[11px] text-rose-300">{archiveError}</p>}
            </div>
          </div>
        )}


        {showCancelConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !cancelling && setShowCancelConfirm(false)}>
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-2"><AlertTriangle size={20} className="text-rose-400" /><span className="text-base font-bold text-slate-100">确认取消分发？</span></div>
              <p className="mb-3 text-[12px] leading-5 text-slate-400">取消分发后警情将回到「待分发」状态，已生成的处置流程将保留。此操作仅管理员可执行。</p>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="取消原因（可选）" className="mb-4 w-full rounded-md border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500 focus:border-rose-400/70" rows={2} />
              <div className="flex gap-2">
                <button onClick={() => setShowCancelConfirm(false)} disabled={cancelling} className="flex-1 rounded-md border border-slate-600/60 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-700/40 disabled:opacity-50">取消</button>
                <button onClick={cancelDispatch} disabled={cancelling} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-50">{cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}确认取消分发</button>
              </div>
            </div>
          </div>
        )}

</div>







  )







}















