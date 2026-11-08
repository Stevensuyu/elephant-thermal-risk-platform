'use client'







import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'



import {



  Loader2, RefreshCw, CheckCircle2, Circle, Play, SkipForward, Eye, Radio, Megaphone,



  Users, Plane, ShieldAlert, Ban, TrafficCone, Footprints, Send, ClipboardCheck, Sparkles,



  UserCheck, Lock, Inbox, SearchCheck, HeartPulse, Package, Newspaper, Archive, FileText,



  AlertTriangle, Edit3, Plus, X, Clock,



} from 'lucide-react'



import type { DisposalStep, DisposalStepType, DisposalWorkflow, AlertRole } from '@/lib/store/store-disposal-workflows'



import { stepRequiresConfirm } from '@/lib/utils/util-disposal-shared-types'



import type { TrainingTask, CaseReport } from '@/lib/utils/util-app-types'
import { sortDisposalSteps } from '@/lib/utils/util-disposal-step-order'



import ClosureReportModal from '@/components/disposal/disposal-closure-report-modal'
import ClosureRiskModal from '@/components/disposal/closure-risk-modal'



import { recordLog, LOG_ACTIONS } from '@/lib/log/log-operation-audit-store'
import { publishWorkflowStepConfirmed } from '@/lib/utils/util-workflow-sync'







/**



 * 警情 AI 全流程处置时间线（成员确认闭环版）。



 * - 展示处置步骤：谁处置(assignedRole)、状态、AI 理由；



 * - 指派给当前角色且需确认的步骤 → 该成员可点「确认完成」（后台留痕 confirmedBy/confirmedAt）；



 * - 管理员可在全部必需确认齐备后「推进 / 结案」；



 * - 仅真实警情才允许生成处置工单，不伪造。



 */



const TYPE_ICON: Record<DisposalStepType, any> = {



  receive: Inbox,



  monitor: Eye,



  verify: SearchCheck,



  broadcast: Megaphone,



  dispatch: Users,



  uav: Plane,



  deter: ShieldAlert,



  blockade: Ban,



  traffic: TrafficCone,



  evacuate: Footprints,



  rescue: HeartPulse,



  logistics: Package,



  publicity: Newspaper,



  report: Send,



  review: ClipboardCheck,



  archive: Archive,



}



const TYPE_LABEL: Record<DisposalStepType, string> = {



  receive: '接警受理',



  monitor: '监测锁定',



  verify: '核实研判',



  broadcast: '预警广播',



  dispatch: '人员调度',



  uav: '无人机介入',



  deter: '科学驱离',



  blockade: '封锁警戒',



  traffic: '交通管制',



  evacuate: '群众疏散',



  rescue: '医疗救援',



  logistics: '后勤保障',



  publicity: '舆情引导',



  report: '上报联动',



  review: '复盘留痕',



  archive: '结案归档',



}



const ROLE_LABEL: Record<string, string> = {



  admin: '系统管理员',



  center: '管理中心',



  street: '街道干部',



  police: '警员',



}




/** 将 ISO 时间字符串格式化为 "YYYY-MM-DD HH:mm:ss" */
function formatTimestamp(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch { return '' }
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {



  pending: { label: '待执行', cls: 'bg-slate-600/30 text-slate-300 ring-slate-500/30', icon: Circle },



  executing: { label: '执行中', cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/30', icon: Play },



  done: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30', icon: CheckCircle2 },



  skipped: { label: '已跳过', cls: 'bg-slate-700/40 text-slate-400 ring-slate-600/30', icon: SkipForward },



}







interface Props {



  taskId: string



  level: string



  real?: boolean



  /** 当前登录角色，用于判断是否显示「确认完成」/「推进」 */



  currentRole?: string



  /** 当前登录姓名，作为确认留痕 */



  currentName?: string



  /** 任意变更后回调（刷新父级 / 提示） */



  onChanged?: (wf: DisposalWorkflow) => void



  /** 关联的警情对象（结案归档时需要，用于生成报告 / 回写 report 到警情） */



  task?: TrainingTask



  /** 外部刷新触发器：值变化时重新拉取工单（用于推进处置后同步） */



  refreshKey?: number



  /** 外部接管结案流程时，隐藏内部「推进/结案」按钮与结案报告弹窗 */



  disableClosure?: boolean



}







export default function DisposalTimeline({ taskId, level, real, currentRole, currentName, onChanged, task, refreshKey, disableClosure = false }: Props) {



  const router = useRouter()

  const [wf, setWf] = useState<DisposalWorkflow | null>(null)



  const [loading, setLoading] = useState(true)



  const [generating, setGenerating] = useState(false)



  const [busy, setBusy] = useState<string | null>(null)



  // 模板选择 + 手动编辑



  const [selectedTemplate, setSelectedTemplate] = useState<'auto' | 'minimal' | 'standard' | 'emergency'>('auto')



  const [editingStepId, setEditingStepId] = useState<string | null>(null)



  const [editDraft, setEditDraft] = useState<{ title: string; description: string; assignedRole: AlertRole; estimatedMinutes: number; type: DisposalStepType } | null>(null)



  const [showAddStep, setShowAddStep] = useState(false)



  const [newStepDraft, setNewStepDraft] = useState<{ title: string; description: string; assignedRole: AlertRole; estimatedMinutes: number; type: DisposalStepType }>({ title: '', description: '', assignedRole: 'center', estimatedMinutes: 15, type: 'verify' })



  const [toast, setToast] = useState<string | null>(null)



  const [genError, setGenError] = useState<string | null>(null)



  const autoGenAttemptedRef = useRef(false)



  const [showClosure, setShowClosure] = useState(false)
  const [showClosureRisk, setShowClosureRisk] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  // 结案归档步骤：自动生成风险预测+AI报告的状态
  const [archiveGenState, setArchiveGenState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [archiveReport, setArchiveReport] = useState('')
  const [archiveReportModel, setArchiveReportModel] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)



  // AI 处置监控：动态建议 / 超时提醒 / 结案评估



  const [monitor, setMonitor] = useState<{ suggestions: any[]; warnings: any[]; evaluation: any; aiEnhanced?: boolean } | null>(null)







  const load = useCallback(async () => {



    try {



      const r = await fetch(`/api/disposal?taskId=${encodeURIComponent(taskId)}`)



      if (r.ok) {



        const d = await r.json()



        setWf(d.workflow ? { ...d.workflow, steps: sortDisposalSteps(d.workflow.steps || []) } : null)



      } else {



        setWf(null)



      }



    } catch {



      /* ignore */



    } finally {



      setLoading(false)



    }



  }, [taskId])







  const taskRef = useRef(task); taskRef.current = task



  const wfRef = useRef(wf); wfRef.current = wf



  const loadMonitor = useCallback(async () => {
    // 结案守卫：已结案或 workflow 已 advanced 时不再生成监控建议
    if (wfRef.current?.advanced || taskRef.current?.status === 'COMPLETED') return
    try {



      const r = await fetch(`/api/disposal/ai-monitor?taskId=${encodeURIComponent(taskId)}`)



      if (r.ok) {



        const d = await r.json()



        const ruleMon: any = d.monitor || null



        // 尝试真实大模型生成动态建议/评估报告（服务端 /api/ai-analysis/monitor，有 Key 时）；



        // 无 Key / 失败时保持规则引擎监控并明确标注「规则引擎监控（未连接大模型）」，绝不冒充 AI。



        let aiEnhanced = false



        const curTask = taskRef.current



        const curWf = wfRef.current



        if (curTask && curWf) {



          try {



            const ar = await fetch('/api/ai-analysis/monitor', {



              method: 'POST',



              headers: { 'Content-Type': 'application/json' },



              body: JSON.stringify({



                task: {



                  id: curTask.id, name: curTask.name, warningLevel: curTask.warningLevel, alertType: curTask.alertType,



                  detectedCount: curTask.detectedCount, township: curTask.township, county: curTask.county, province: curTask.province,



                  intrusionRisk: curTask.intrusionRisk, status: curTask.status,



                },



                workflow: {



                  advanced: curWf.advanced, scenario: curWf.scenario,



                  steps: (curWf.steps || []).map((s: any) => ({



                    id: s.id, title: s.title, type: s.type, status: s.status, assignedRole: s.assignedRole,



                    estimatedMinutes: s.estimatedMinutes, confirmedBy: s.confirmedBy || null, description: s.description || '',



                  })),



                  factors: curWf.factors || [],



                },



              }),



            })



            if (ar.ok) {



              const ad = await ar.json()



              if (ad && ad.ai === true && ad.monitor) {



                aiEnhanced = true



                setMonitor({



                  suggestions: ad.monitor.suggestions || [],



                  warnings: ruleMon?.warnings || [],



                  evaluation: ad.monitor.evaluation || null,



                  aiEnhanced: true,



                })



                return



              }



            }



          } catch {



            /* 服务端 AI 不可用 → 保持规则监控 */



          }



        }



        setMonitor({ ...(ruleMon || {}), aiEnhanced: false })



      }



    } catch {



      /* ignore */



    }



  }, [taskId])







  useEffect(() => { load() }, [load, refreshKey])







  // refreshKey变化时重置自动生成标记（允许重新触发）



  useEffect(() => { autoGenAttemptedRef.current = false; setGenError(null) }, [refreshKey])



  useEffect(() => { if (wf) loadMonitor() }, [loadMonitor, refreshKey, wf])







const flash = (msg: string) => {



    setToast(msg)



    setTimeout(() => setToast(null), 2200)



  }







  const TEMPLATE_LABEL: Record<string, string> = { auto: 'AI自主', minimal: '最小化', standard: '常规', emergency: '紧急' }







  // 保存手动修改后的步骤（全量 PATCH）



  const saveSteps = useCallback(async (steps: DisposalStep[]) => {



    try {



      const r = await fetch('/api/disposal', {



        method: 'PATCH',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify({ taskId, steps }),



      })



      const d = await r.json()



      if (d.success) { setWf(d.workflow); onChanged?.(d.workflow); flash('步骤已保存') }



      else flash(d.error || '保存失败')



    } catch { flash('保存失败') }



  }, [taskId, onChanged])







  // 开始编辑步骤



  const startEdit = useCallback((step: DisposalStep) => {



    setEditingStepId(step.id)



    setEditDraft({ title: step.title, description: step.description, assignedRole: step.assignedRole, estimatedMinutes: step.estimatedMinutes, type: step.type })



  }, [])







  // 保存编辑



  const saveEdit = useCallback(() => {



    if (!wf || !editingStepId || !editDraft) return



    const newSteps = wf.steps.map((s) => s.id === editingStepId ? { ...s, ...editDraft } : s)



    setEditingStepId(null)



    setEditDraft(null)



    saveSteps(newSteps)



  }, [wf, editingStepId, editDraft, saveSteps])







  // 添加步骤



  const addStep = useCallback(() => {



    if (!wf || !newStepDraft.title.trim()) { flash('请填写步骤标题'); return }



    const newId = `step-${wf.steps.length + 1}`



    const newStep: DisposalStep = {



      id: newId, type: newStepDraft.type, title: newStepDraft.title.trim(),



      description: newStepDraft.description.trim(), assignedRole: newStepDraft.assignedRole,



      priority: 'normal', auto: false, status: 'pending', estimatedMinutes: newStepDraft.estimatedMinutes, requireConfirm: true,



    }



    // 插入到 archive/review 之前（固定骨架末尾）



    const insertIdx = wf.steps.findIndex((s) => s.type === 'review' || s.type === 'archive')



    const newSteps = insertIdx >= 0



      ? [...wf.steps.slice(0, insertIdx), newStep, ...wf.steps.slice(insertIdx)].map((s, i) => ({ ...s, id: `step-${i + 1}` }))



      : [...wf.steps, newStep].map((s, i) => ({ ...s, id: `step-${i + 1}` }))



    setShowAddStep(false)



    setNewStepDraft({ title: '', description: '', assignedRole: 'center', estimatedMinutes: 15, type: 'verify' })



    saveSteps(newSteps)



  }, [wf, newStepDraft, saveSteps])







  const deleteStep = (stepId: string, stepType: string) => {



    if (!wf) return



    if (stepType === 'receive' || stepType === 'archive') { return }



    const newSteps = wf.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, id: `step-${i + 1}` }))



    saveSteps(newSteps)



  }







  const generate = useCallback(async () => {



    setGenerating(true); setGenError(null)



    try {



      // Step 1: 调用真实AI端点生成处置流程



      const aiBody: any = {



        taskId,



        alertType: task?.alertType || 'intrusion',



        warningLevel: task?.warningLevel || 'yellow',



        detectedCount: task?.detectedCount || 0,



        location: [task?.province, task?.city, task?.county, task?.township].filter(Boolean).join('/') || '云南/西双版纳',



        isNight: new Date().getHours() < 6 || new Date().getHours() >= 19,



        lat: task?.lat || 22.6,



        lng: task?.lng || 100.3,



        template: selectedTemplate,



      }



      const aiR = await fetch('/api/ai-analysis/disposal', {



        method: 'POST',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify(aiBody),



      })



      if (!aiR.ok) throw new Error(`AI端点返回 HTTP ${aiR.status}`)



      const aiD = await aiR.json()



      // AI端点返回格式：{ ai, model, steps: [...], aiSummary, scenario, factors }



      // steps在顶层，不是在workflow下面



      const aiSteps = aiD?.steps || aiD?.workflow?.steps || []



      if (!aiSteps.length) throw new Error('AI返回的处置流程为空')







      // 构造完整的workflow对象



      const aiWorkflow = {



        steps: aiSteps,



        aiSummary: aiD?.aiSummary || aiD?.workflow?.aiSummary || '',



        scenario: aiD?.scenario || aiD?.workflow?.scenario || '',



        factors: aiD?.factors || aiD?.workflow?.factors || [],



        advanced: aiD?.advanced || aiD?.workflow?.advanced || false,



      }







      // Step 2: 保存到服务端



      const saveR = await fetch('/api/disposal', {



        method: 'POST',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify({ taskId, ...aiWorkflow, generatedBy: 'ai-llm-client', aiModel: aiD.model || 'minimax/minimax-m3:free' }),



      })



      const saveD = await saveR.json().catch(() => ({}))







      // Step 3: 更新本地state（用AI返回的workflow，确保内容完整）



      const finalWf = saveD.workflow || aiWorkflow



      setWf(finalWf); setEditingStepId(null); setShowAddStep(false)



      flash(`已生成处置流程（AI 研判·${TEMPLATE_LABEL[selectedTemplate]}，${finalWf?.steps?.length || 0}步），可人工修改`)



      onChanged?.(finalWf)



      recordLog({ userName: currentName || currentRole || 'unknown', role: currentRole || 'unknown', action: LOG_ACTIONS.GENERATE_DISPOSAL, detail: `工单 ${taskId} AI生成处置流程（${TEMPLATE_LABEL[selectedTemplate]}，${finalWf?.steps?.length || 0}步）` })



    } catch (e: any) {



      const msg = 'AI生成失败：' + (e?.message || '网络错误') + '，请点击重试'



      setGenError(msg); flash(msg)



    } finally { setGenerating(false) }



  }, [taskId, task, selectedTemplate, onChanged])



  // 自动生成：加载完成后若无工单且为真实警情，自动触发AI生成（仅一次）

  useEffect(() => {

    if (loading) return

    if (wf) return

    if (!real) return

    if (autoGenAttemptedRef.current) return

    autoGenAttemptedRef.current = true

    generate()

  }, [loading, wf, real, generate])









  const updateStep = async (stepId: string, status: 'executing' | 'done' | 'skipped') => {



    setBusy(stepId)



    try {



      const r = await fetch('/api/disposal', {



        method: 'PATCH',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify({ taskId, stepId, status }),



      })



      const d = await r.json()



      if (d.success) {
        setWf(d.workflow)
        onChanged?.(d.workflow)
        loadMonitor()
        // 状态变化时也通知待办同步（步骤变为 done/skipped 时应从待办移除）
        if (status === 'done' || status === 'skipped') {
          window.dispatchEvent(new CustomEvent('todo:step-confirmed', { detail: { taskId, stepId } }))
          publishWorkflowStepConfirmed(taskId, stepId)
        }
      }



    } catch { /* ignore */ }



    finally { setBusy(null) }



  }







  const confirmStep = async (step: DisposalStep) => {



    setBusy(step.id)



    try {



      const r = await fetch('/api/disposal', {



        method: 'PATCH',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify({ taskId, stepId: step.id, confirm: true, by: currentName || currentRole || '成员' }),



      })



      const d = await r.json()



      if (d.success) {
        setWf(d.workflow)
        flash(`已确认完成：${step.title}`)
        onChanged?.(d.workflow)
        loadMonitor()
        // 派发全局事件：通知待办弹窗、我的任务页面、主页面同步更新
        window.dispatchEvent(new CustomEvent('todo:step-confirmed', { detail: { taskId, stepId: step.id } }))
        publishWorkflowStepConfirmed(taskId, step.id)
        recordLog({ userName: currentName || currentRole || 'unknown', role: currentRole || 'unknown', action: LOG_ACTIONS.CONFIRM_STEP, detail: `工单 ${taskId} 确认步骤：${step.title}（${currentRole === 'admin' ? '管理员代确认' : '负责人确认'}）` }) }



      else flash(d.error || '确认失败')



    } catch { flash('确认失败') }



    finally { setBusy(null) }



  }







  // 推进 / 结案：打开结案报告模态（自动生成文字总结 + 可生成复盘视频 + 人工确认 + 可手动修改）



  // 确认后携 report 回写，由后端归档到警情（task.report + status=COMPLETED）。



  const advance = () => {



    if (!task) {



      flash('缺少关联警情，无法生成结案报告')



      return



    }



    setShowClosure(true)



  }







  const handleClosureConfirm = async (report: CaseReport) => {



    setBusy('__advance__')



    try {



      const r = await fetch('/api/disposal', {



        method: 'PATCH',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify({ taskId, advance: true, report, by: currentName || currentRole || '管理员' }),



      })



      const d = await r.json()



      if (d.success) {



        setWf(d.workflow)



        if (task) task.report = report



        flash('已结案并生成报告（文字 + 视频）存档')



        onChanged?.(d.workflow)



        // 派发全局结案事件，通知主页面等组件刷新警情列表
        window.dispatchEvent(new CustomEvent('task:closed', { detail: { taskId } }))



        loadMonitor()



      } else {



        flash(d.error || '结案失败')



      }



    } catch {



      flash('结案失败')



    } finally {



      setBusy(null)



      setShowClosure(false)



    }



  }



  // 结案归档步骤：自动生成1.5小时风险预测+AI评估报告
  const generateArchiveReport = useCallback(async () => {
    if (archiveGenState === 'generating' || archiveGenState === 'done') return
    setArchiveGenState('generating')
    try {
      // 拉取处置工单用于报告生成
      let wfData = null
      try {
        const wfRes = await fetch(`/api/disposal?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' })
        if (wfRes.ok) {
          const wfJson = await wfRes.json()
          wfData = wfJson?.workflow || wfJson || null
        }
      } catch { /* ignore */ }

      const r = await fetch('/api/ai-analysis/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task || { id: taskId, name: '象群警情' }, workflow: wfData }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ai === true && typeof d.report === 'string' && d.report.trim().length > 0) {
        setArchiveReport(d.report)
        setArchiveReportModel(d.model || 'minimax/minimax-m3:free')
        setArchiveGenState('done')
      } else {
        setArchiveGenState('error')
      }
    } catch {
      setArchiveGenState('error')
    }
  }, [taskId, task, archiveGenState])

  // 结案归档步骤：确认结案归档（调用结案API+自动标记步骤完成）
  const confirmArchiveStep = async (stepId: string, reportText?: string, reportModel?: string) => {
    setArchiveBusy(true)
    try {
      const now = new Date().toISOString()
      const report = {
        text: (reportText || archiveReport).trim() || '（AI自动生成评估报告）',
        aiModel: reportModel || archiveReportModel || 'minimax/minimax-m3:free',
        generatedAt: now,
        editedBy: currentName || currentRole || '系统',
        archivedAt: now,
        videoPersisted: false,
      }
      const r = await fetch('/api/disposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, advance: true, report, by: currentName || currentRole || '管理员' }),
      })
      const d = await r.json()
      if (d.success) {
        setWf(d.workflow)
        onChanged?.(d.workflow)
        // 关闭归档弹窗
        setShowClosureRisk(false)
        // 派发全局结案事件
        window.dispatchEvent(new CustomEvent('task:closed', { detail: { taskId } }))
        flash('案件已结案归档，处置流程全部完成')
        loadMonitor()
        // 延迟跳转，让状态先更新
        setTimeout(() => router.push(`/alert/${taskId}`), 300)
      } else {
        flash(d.error || '结案归档失败')
      }
    } catch {
      flash('结案归档失败')
    } finally {
      setArchiveBusy(false)
    }
  }







  if (loading) {



    return (



      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">



        <Loader2 size={16} className="animate-spin" /> 加载处置工单…



      </div>



    )



  }







  if (!wf) {



    if (!real) {



      return (



        <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-800/20 py-6 text-center text-[12px] leading-5 text-slate-500">



          无处置工单



        </div>



      )



    }



    return (



      <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">



        {generating ? (



          <>



            <div className="flex items-center gap-2 text-[13px] text-amber-200">



              <Loader2 size={16} className="animate-spin" />



              AI 正在生成处置流程，请稍候（约10-30秒）…



            </div>



            <p className="text-[11px] text-slate-500">基于警情等级、象群规模、位置、时段等因素动态生成</p>



          </>



        ) : genError ? (



          <>



            <div className="flex items-center gap-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">



              <AlertTriangle size={13} /> {genError}



            </div>



            <button



              onClick={() => { setGenError(null); autoGenAttemptedRef.current = false; generate() }}



              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200 transition hover:bg-amber-500/20"



            >



              <RefreshCw size={13} /> 重试



            </button>



          </>



        ) : (



          <>



            <p className="text-[12px] text-slate-400">尚未生成处置工单</p>






            <button



              onClick={generate}



              disabled={generating}



              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"



            >



              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}



              {generating ? '生成中…' : '生成处置工单（AI）'}



            </button>



          </>



        )}



      </div>



    )



  }







  const isAdmin = currentRole === 'admin'



  // 结案后所有步骤视为已完成（兼容旧数据）



  const doneCount = wf.advanced ? wf.steps.length : wf.steps.filter((s) => s.status === 'done').length



  const progress = Math.round((doneCount / Math.max(1, wf.steps.length)) * 100)



  const pendingConfirm = wf.advanced ? [] : wf.steps.filter((s) => stepRequiresConfirm(wf, s) && !s.confirmedBy)



  const canAdvance = isAdmin && pendingConfirm.length === 0 && !wf.advanced



  // 已开始处置：有任何步骤已完成(done)或已确认(confirmedBy)，则禁止重新生成/切换模板



  const hasStarted = !wf.advanced && wf.steps.some((s) => s.status === 'done' || !!s.confirmedBy)







  return (



    <div className="space-y-3">



      {toast && (



        <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[12px] text-cyan-100">{toast}</div>



      )}







      <div className="flex flex-wrap items-center gap-2">



        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-200 ring-1 ring-violet-400/30">



          <Sparkles size={12} /> {wf.scenario}



        </span>



        <span className="text-[11px] text-slate-400">{progress}%</span>






      </div>







      







      {/* 进度条 */}



      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">



        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${progress}%` }} />



      </div>







      {/* 动态处置依据（五维因素） */}



      {Array.isArray(wf.factors) && wf.factors.length > 0 && (



        <div className="flex flex-wrap gap-1.5">



          {wf.factors.map((f: string, i: number) => (



            <span key={i} className="inline-flex items-center gap-1 rounded bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-200 ring-1 ring-fuchsia-400/20">



              <Sparkles size={10} /> {f}



            </span>



          ))}



        </div>



      )}







      {/* AI 处置监控：动态建议 / 超时提醒 / 结案评估 */}



      {monitor && (



        <div className="rounded-lg border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/[0.07] to-violet-500/[0.04] p-3">



          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fuchsia-200">



            <Sparkles size={13} /> {monitor.aiEnhanced ? '大模型 · 处置监控 · 动态建议' : '规则引擎 · 处置监控（未连接大模型）'}



            {!wf.advanced && <span className="thinking-dot ml-1 inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />}



          </div>



          {(monitor.suggestions || []).length > 0 && (



            <ul className="space-y-1.5">



              {(monitor.suggestions || []).slice(0, 6).map((s: any, i: number) => (



                <li key={i} className="flex gap-2 text-[12px] leading-5 text-slate-200">



                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" />



                  {s.text}



                </li>



              ))}



            </ul>



          )}



          {(monitor.warnings || []).length > 0 && (



            <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-2">



              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-amber-200">



                <AlertTriangle size={11} /> 超时 / 卡住提醒



              </div>



              <ul className="space-y-1">



                {(monitor.warnings || []).map((w: any, i: number) => (



                  <li key={i} className="flex gap-2 text-[12px] leading-5 text-amber-100">



                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />



                    {w.text}



                  </li>



                ))}



              </ul>



            </div>



          )}



          {monitor.evaluation && (



            <div className="mt-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-2.5">



              <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-200">



                <FileText size={11} /> {monitor.aiEnhanced ? 'AI 处置评估报告' : '处置评估（规则引擎生成）'}



              </div>



              <p className="text-[12px] leading-5 text-emerald-100">{monitor.evaluation.summary}</p>



              <p className="mt-1 text-[11px] text-emerald-200/70">



                已完成 {monitor.evaluation.stepsDone}/{monitor.evaluation.stepsTotal} 步 · {monitor.evaluation.durationNote}



              </p>



            </div>



          )}



        </div>



      )}







      {/* 管理员推进门控（外部接管结案时隐藏，由详情页底部结案区统一处理） */}



      {isAdmin && !disableClosure && (



        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-[12px] ${wf.advanced ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : pendingConfirm.length ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-slate-600/40 bg-slate-800/40 text-slate-300'}`}>



          <span className="inline-flex items-center gap-1.5">



            {wf.advanced ? <CheckCircle2 size={13} /> : pendingConfirm.length ? <Lock size={13} /> : <UserCheck size={13} />}



            {wf.advanced



              ? '已结案'



              : pendingConfirm.length



                ? `待确认 ${pendingConfirm.length}`



                : '可推进'}



          </span>



          <div className="flex items-center gap-1.5">



            {wf.advanced && task?.report && (



              <button onClick={() => setShowClosure(true)} className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20">



                <FileText size={11} /> 查看 / 编辑结案报告



              </button>



            )}



            {canAdvance && (



              <button onClick={advance} disabled={busy === '__advance__'} className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50">



                {busy === '__advance__' ? <Loader2 size={11} className="animate-spin" /> : '推进 / 结案'}



              </button>



            )}



          </div>



        </div>



      )}







      {/* 结案风险推演+AI评估报告模态（结案归档步骤点击打开） */}
      {showClosureRisk && task && (
        <ClosureRiskModal
          task={task}
          existingReport={archiveReport || undefined}
          existingReportModel={archiveReportModel || undefined}
          archiving={archiveBusy}
          archiveError={archiveError}
          onClose={() => setShowClosureRisk(false)}
          onConfirmArchive={(reportText, reportModel) => {
            // 找到 archive 步骤的 id
            const archiveStep = wf?.steps?.find((s: any) => s.type === 'archive')
            if (archiveStep) confirmArchiveStep(archiveStep.id, reportText, reportModel)
          }}
        />
      )}

      {/* 结案报告模态（外部接管结案时不渲染） */}



      {showClosure && task && !disableClosure && (



        <ClosureReportModal



          task={task}



          wf={wf}



          currentName={currentName}



          existingReport={wf?.advanced ? task.report || null : null}



          onConfirm={handleClosureConfirm}



          onClose={() => setShowClosure(false)}



        />



      )}







      {/* 处置步骤时间线 */}



      <div className="space-y-2">



        {wf.steps.map((step, idx) => {



          const Icon = TYPE_ICON[step.type] || Radio



          // 结案后所有步骤视为已完成（兼容旧数据：结案时未回写步骤状态的情况）



          const effectiveStatus = wf.advanced ? 'done' : step.status



          const sm = STATUS_META[effectiveStatus] || STATUS_META.pending



          // 结案归档步骤：未完成=红色，已完成=绿色
          const isArchiveStep = step.type === 'archive'
          const archiveNotDone = isArchiveStep && effectiveStatus !== 'done' && effectiveStatus !== 'skipped'
          const displaySm = archiveNotDone
            ? { label: '未完成', cls: 'bg-red-500/15 text-red-200 ring-red-400/30', icon: Clock }
            : sm
          const StatusIcon = displaySm.icon



          const needsConfirm = stepRequiresConfirm(wf, step)



          const isMine = !wf.advanced && needsConfirm && !step.confirmedBy && (step.assignedRole === currentRole || currentRole === 'admin') && step.status !== 'done'



          const isAdmin = currentRole === 'admin'



          const isMyStep = step.assignedRole === currentRole || isAdmin



          const stepDone = effectiveStatus === 'done' || step.status === 'done' || step.status === 'skipped'



          if (!isAdmin && !isMyStep && !stepDone) {



            return (



              <div key={step.id} className="relative rounded-lg border border-slate-700/30 bg-slate-800/20 p-2.5">



                <div className="flex items-center gap-2">



                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700/40 text-slate-500">



                    <Lock size={12} />



                  </div>



                  <span className="text-[12px] text-slate-500">步骤 {idx + 1} · 等待{ROLE_LABEL[step.assignedRole] || step.assignedRole}处理</span>



                  <span className="ml-auto rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-500">{TYPE_LABEL[step.type]}</span>



                </div>



              </div>



            )



          }



          return (



            <div



              key={step.id}



              className={`relative rounded-lg border p-3 transition ${



                archiveNotDone



                  ? 'border-red-500/30 bg-red-500/[0.05]'



                  : effectiveStatus === 'done'



                  ? 'border-emerald-500/20 bg-emerald-500/[0.04]'



                  : effectiveStatus === 'executing'



                  ? 'border-amber-500/30 bg-amber-500/[0.05]'



                  : 'border-slate-700/50 bg-slate-800/30'



              }`}



            >



              <div className="flex items-start gap-3">



                <div className="flex flex-col items-center">



                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${



                    archiveNotDone ? 'bg-red-500/20 text-red-200' : effectiveStatus === 'done' ? 'bg-emerald-500/20 text-emerald-200' : effectiveStatus === 'executing' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700/50 text-slate-300'



                  }`}>



                    <Icon size={15} />



                  </div>



                  {idx < wf.steps.length - 1 && <div className="mt-1 h-full w-px flex-1 bg-slate-700/40" />}



                </div>







                <div className="min-w-0 flex-1 pb-1">



                  <div className="flex flex-wrap items-center gap-2">



                    <span className="text-[13px] font-semibold text-slate-100">{step.title}</span>



                    <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{TYPE_LABEL[step.type]}</span>



                    <span className="rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-400">👤 {ROLE_LABEL[step.assignedRole] || step.assignedRole}</span>



                    {step.auto && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200">系统自动</span>}



                    {!wf.advanced && needsConfirm && !step.confirmedBy && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">需确认</span>}



                    {(step.confirmedBy || wf.advanced) && <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200"><UserCheck size={10} /> {step.confirmedBy || '结案确认'} 已确认</span>}



                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${displaySm.cls}`}>



                      <StatusIcon size={10} /> {displaySm.label}



                    </span>



                    <span className="text-[10px] text-slate-500">≈{step.estimatedMinutes}min</span>



                  </div>



                  <p className="mt-1 text-[12px] leading-5 text-slate-300">{step.description}</p>
                  {/* 步骤时间戳：完成/确认/执行时间 */}
                  {(step.doneAt || step.confirmedAt || step.executedAt) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
                      <Clock size={10} className="shrink-0" />
                      {step.doneAt && <span>完成 {formatTimestamp(step.doneAt)}</span>}
                      {!step.doneAt && step.confirmedAt && <span>确认 {formatTimestamp(step.confirmedAt)}</span>}
                      {!step.doneAt && !step.confirmedAt && step.executedAt && <span>执行 {formatTimestamp(step.executedAt)}</span>}
                      {step.confirmedBy && step.doneAt && <span className="text-slate-600">· by {step.confirmedBy}</span>}
                    </div>
                  )}







                  {/* 操作按钮（结案后不显示） */}



                  {!wf.advanced && (



                    <div className="mt-2 flex flex-wrap gap-1.5">

                      {/* 结案归档步骤：特殊交互 - 自动生成风险预测+AI报告，确认后自动结案 */}
                      {step.type === 'archive' && step.status !== 'done' && step.status !== 'skipped' && (() => {
                        // 检查所有前置步骤是否已完成
                        const stepIdx = wf.steps.findIndex((s) => s.id === step.id)
                        const prevSteps = stepIdx > 0 ? wf.steps.slice(0, stepIdx) : []
                        const allPrevDone = prevSteps.every((s) => s.status === 'done' || s.status === 'skipped' || !!s.confirmedBy)

                        if (!allPrevDone) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
                              <Clock size={11} /> 未完成 · 等待前置步骤完成
                            </span>
                          )
                        }

                        // 前置步骤全部完成，显示可点击按钮打开风险推演+AI报告模态框
                        return (
                          <button
                            onClick={() => setShowClosureRisk(true)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.2)] transition hover:bg-red-500/25 hover:shadow-[0_0_12px_rgba(239,68,68,0.4)] cursor-pointer"
                          >
                            <Archive size={12} /> 点击开始结案归档
                          </button>
                        )
                      })()}



                      {isMine && step.type !== 'archive' && (



                        <button



                          onClick={() => confirmStep(step)}



                          disabled={busy === step.id}



                          className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"



                        >



                          <UserCheck size={11} /> {currentRole === 'admin' ? '管理员代确认' : '确认完成'}



                        </button>



                      )}



                      {/* 非负责人步骤：显示等待谁确认 */}



                      {needsConfirm && !isMine && !step.confirmedBy && (



                        <span className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">



                          <Clock size={11} className="animate-pulse" /> 等待{ROLE_LABEL[step.assignedRole] || step.assignedRole}确认



                        </span>



                      )}



                      {!needsConfirm && step.type !== 'archive' && step.status === 'pending' && (



                        <button



                          onClick={() => updateStep(step.id, 'executing')}



                          disabled={busy === step.id}



                          className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"



                        >



                          <Play size={11} /> 开始执行



                        </button>



                      )}



                      {!needsConfirm && step.type !== 'archive' && step.status === 'executing' && (



                        <button



                          onClick={() => updateStep(step.id, 'done')}



                          disabled={busy === step.id}



                          className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"



                        >



                          <CheckCircle2 size={11} /> 标记完成



                        </button>



                      )}



                      {!needsConfirm && step.type !== 'archive' && (step.status === 'pending' || step.status === 'executing') && (



                        <button



                          onClick={() => updateStep(step.id, 'skipped')}



                          disabled={busy === step.id}



                          className="inline-flex items-center gap-1 rounded border border-slate-600/60 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-700/40 disabled:opacity-50"



                        >



                          <SkipForward size={11} /> 跳过



                        </button>



                      )}



                      {/* 无人机抵近跟踪等步骤：即使无数据也允许手动确认完成 */}



                      {step.type === 'uav' && step.status !== 'done' && step.status !== 'skipped' && (



                        <button



                          onClick={() => updateStep(step.id, 'done')}



                          disabled={busy === step.id}



                          className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"



                          title="无无人机数据时手动标记完成"



                        >



                          <CheckCircle2 size={11} /> 手动确认完成（无数据）



                        </button>



                      )}



                      {busy === step.id && <Loader2 size={12} className="animate-spin text-slate-400" />}



                      {/* 手动编辑（结案后不显示；处置流程区域不允许删除步骤） */}



                      {!wf.advanced && editingStepId !== step.id && currentRole === 'admin' && (



                        <>



                          <button onClick={() => startEdit(step)}



                            className="inline-flex items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-500/20">



                            <Edit3 size={10} /> 编辑



                          </button>



                          {step.type !== 'receive' && step.type !== 'archive' && (



                            <button onClick={() => { if (window.confirm('确定删除此步骤？')) deleteStep(step.id, step.type) }}



                              className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/20">



                              <X size={10} /> 删除



                            </button>



                          )}



                        </>



                      )}



                    </div>



                  )}



                  {/* 内联编辑表单 */}



                  {!wf.advanced && editingStepId === step.id && editDraft && (



                    <div className="mt-2 rounded-md border border-sky-400/30 bg-sky-500/5 p-2.5">



                      <div className="grid grid-cols-2 gap-2">



                        <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}



                          placeholder="步骤标题" className="col-span-2 rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-sky-400/50" />



                        <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}



                          placeholder="步骤说明" rows={2} className="col-span-2 rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-sky-400/50" />



                        <select value={editDraft.type} onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value as DisposalStepType })}



                          className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none">



                          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}



                        </select>



                        <select value={editDraft.assignedRole} onChange={(e) => setEditDraft({ ...editDraft, assignedRole: e.target.value as AlertRole })}



                          className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none">



                          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}



                        </select>



                        <input type="number" min={1} value={editDraft.estimatedMinutes} onChange={(e) => setEditDraft({ ...editDraft, estimatedMinutes: Math.max(1, Number(e.target.value) || 15) })}



                          className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none" />



                      </div>



                      <div className="mt-2 flex gap-1.5">



                        <button onClick={saveEdit} className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-sky-500">保存</button>



                        <button onClick={() => { setEditingStepId(null); setEditDraft(null) }} className="rounded border border-slate-600/60 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-700/40">取消</button>



                      </div>



                    </div>



                  )}



                </div>



              </div>



            </div>



          )



        })}



      </div>







      {/* 添加步骤（结案后不显示，仅管理员） */}



      {wf && !wf.advanced && currentRole === 'admin' && (



        <div className="mt-2">



          {!showAddStep ? (



            <button onClick={() => setShowAddStep(true)}



              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-600/50 bg-slate-800/20 py-2 text-[12px] text-slate-400 transition hover:border-sky-400/40 hover:text-sky-300 hover:bg-sky-500/5">



              <Plus size={13} /> 添加处置步骤



            </button>



          ) : (



            <div className="rounded-md border border-sky-400/30 bg-sky-500/5 p-2.5">



              <div className="mb-2 flex items-center justify-between">



                <span className="text-[12px] font-medium text-sky-200">添加处置步骤</span>



                <button onClick={() => { setShowAddStep(false); setNewStepDraft({ title: '', description: '', assignedRole: 'center', estimatedMinutes: 15, type: 'verify' }) }}



                  className="text-slate-500 hover:text-slate-300"><X size={13} /></button>



              </div>



              <div className="grid grid-cols-2 gap-2">



                <input value={newStepDraft.title} onChange={(e) => setNewStepDraft({ ...newStepDraft, title: e.target.value })}



                  placeholder="步骤标题（必填）" className="col-span-2 rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-sky-400/50" />



                <textarea value={newStepDraft.description} onChange={(e) => setNewStepDraft({ ...newStepDraft, description: e.target.value })}



                  placeholder="步骤说明" rows={2} className="col-span-2 rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[12px] text-slate-100 outline-none focus:border-sky-400/50" />



                <select value={newStepDraft.type} onChange={(e) => setNewStepDraft({ ...newStepDraft, type: e.target.value as DisposalStepType })}



                  className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none">



                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}



                </select>



                <select value={newStepDraft.assignedRole} onChange={(e) => setNewStepDraft({ ...newStepDraft, assignedRole: e.target.value as AlertRole })}



                  className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none">



                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}



                </select>



                <input type="number" min={1} value={newStepDraft.estimatedMinutes} onChange={(e) => setNewStepDraft({ ...newStepDraft, estimatedMinutes: Math.max(1, Number(e.target.value) || 15) })}



                  className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 outline-none" placeholder="预估分钟" />



              </div>



              <div className="mt-2 flex gap-1.5">



                <button onClick={addStep} className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-sky-500">添加</button>



                <button onClick={() => { setShowAddStep(false); setNewStepDraft({ title: '', description: '', assignedRole: 'center', estimatedMinutes: 15, type: 'verify' }) }} className="rounded border border-slate-600/60 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-700/40">取消</button>



              </div>



            </div>



          )}



        </div>



      )}



    </div>



  )



}







