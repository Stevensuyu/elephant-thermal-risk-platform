# 修复报告：4个严重问题深度修复

**修复日期**：2026-09-02
**项目**：空中智能象群风险研判预警与处置系统
**部署环境**：ECS 39.104.20.182 /opt/elephant-platform (PM2 elephant-platform)

---

## 问题1：结案归档不同步（最严重）

### 根因
- 后端 `PATCH /api/disposal` 的 `advance=true` 分支已正确调用 `upsertServerTask` 将 `task.status` 设为 `COMPLETED` 并持久化到 `data/alert_tasks.json`，后端逻辑正确。
- 前端结案后仅调用 `onChanged?.(d.workflow)`，未触发全局警情列表刷新。
- 主页面 `page.tsx` 的警情列表仅靠 3 秒轮询刷新，结案后左侧列表不能立即更新。
- 警情详情页 `alert-detail-client-page.tsx` 的 `confirmArchive` 结案后也未通知其他组件刷新。

### 修复方案
1. 在 `disposal-timeline-panel.tsx` 的 `handleClosureConfirm` 结案成功后，派发全局 CustomEvent `'task:closed'`。
2. 在 `alert-detail-client-page.tsx` 的 `confirmArchive` 结案成功后，同样派发 `'task:closed'` 事件。
3. 在 `page.tsx` 中添加 `'task:closed'` 事件监听器，收到事件后立即调用 `fetchAll()` 重新获取 `/api/tasks` 列表。
4. 结案后 `wf.advanced=true`，时间线中 `effectiveStatus = wf.advanced ? 'done' : step.status` 自动将所有步骤显示为绿色"已完成"，且编辑/删除/添加步骤按钮全部隐藏（只读）。

### 修改文件
- `src/components/disposal/disposal-timeline-panel.tsx` — 结案后派发 `task:closed` 事件
- `src/app/alert/[id]/alert-detail-client-page.tsx` — 结案后派发 `task:closed` 事件
- `src/app/page.tsx` — 监听 `task:closed` 事件并刷新警情列表

### 验证结果
- ✅ 结案后立即写入服务端 `alert_tasks.json`，`status=COMPLETED`
- ✅ 结案后左侧警情列表立即刷新，已结案警情从"处置中"移除
- ✅ 刷新页面后结案状态保持（后端持久化 + 3秒轮询）
- ✅ 结案后案件只读，处置时间线显示全部已完成（绿色）

---

## 问题2：刷新要重新登录 + 刷新后页面丢失

### 根因
- `src/lib/auth/auth-session-store.ts` 第9行明确写着"内存级存储：页面刷新即丢失，必须重新登录（禁止 localStorage/sessionStorage 持久化）"。auth 状态只存在内存变量 `let auth: AuthState | null = null` 中，刷新即丢失。
- `page.tsx` 中的 `activeTab` 只存在 React `useState` 中，刷新后丢失，回到默认页 `dashboard`。

### 修复方案
1. **auth-session-store.ts 持久化**：
   - 新增 `STORAGE_KEY = 'elephant_auth'`
   - 模块初始化时（SSR 安全 `typeof window !== 'undefined'`）从 localStorage 恢复登录状态
   - 恢复时检查 30 分钟会话超时，超时则清除 localStorage
   - `setAuth()` 时同步写入/清除 localStorage
   - 保留 30 分钟无操作自动登出机制（`resetTimer`）
   - `AuthState` 接口新增 `loginTime: number` 字段用于超时判断
2. **page.tsx activeTab 持久化**：
   - `useState` 初始化时从 `localStorage.getItem('elephant_active_tab')` 读取
   - 新增 `useEffect` 监听 `activeTab` 变化，写入 localStorage
   - 支持所有 tab：dashboard / monitor / judge / alerts / settings / mytasks

### 修改文件
- `src/lib/auth/auth-session-store.ts` — localStorage 持久化登录状态 + 会话超时
- `src/app/page.tsx` — activeTab localStorage 持久化

### 验证结果
- ✅ 登录后刷新页面保持登录状态，无需重新登录
- ✅ 30 分钟无操作自动登出并清除 localStorage
- ✅ 登出时清除 localStorage
- ✅ 刷新后保持在原来的页面（态势总览/实时监控/警情研判/警情中心/系统设置/我的任务）
- ✅ SSR 安全，模块顶部有 `typeof window !== 'undefined'` 检查

---

## 问题3：待办弹窗/我的任务确认不了 + 信息不同步

### 根因
1. **admin 角色筛选不匹配**：`common-todo-popup.tsx` 第57行筛选条件 `s.assignedRole === currentRole` 对 admin 角色不匹配（admin 通常不是 assignedRole），导致管理员看不到待办步骤。而 `common-my-tasks-view.tsx` 第68行正确处理了 admin（`|| currentRole === 'admin'`）。
2. **task 为 null 时确认按钮被禁用**：`common-todo-popup.tsx` 第228-229行 `onClick={() => task && handleConfirmStep(...)}` 且 `disabled={!task || ...}`。当 tasks 数组中找不到对应的 task 时，task 为 null，按钮被禁用且点击无反应——这就是"点击确认不了"的直接原因。
3. **待处理警情显示所有未结案警情**：`pendingAlerts = tasks.filter((t) => t.status !== 'COMPLETED')` 显示所有未结案警情，包括与当前用户无关的。
4. **已结案警情的步骤仍显示**：筛选条件未排除 `task.status === 'COMPLETED'` 的警情对应的步骤。
5. **跨组件同步缺失**：待办弹窗确认步骤后，我的任务页面通过 `todo:step-confirmed` 事件刷新，但弹窗本身不监听该事件（从我的任务确认后弹窗不刷新）。

### 修复方案
1. **admin 角色筛选**：`common-todo-popup.tsx` 筛选条件改为 `(s.assignedRole === currentRole || currentRole === 'admin')`，与 my-tasks-view 保持一致。
2. **确认按钮修复**：
   - `onClick` 改为直接调用 `handleConfirmStep(taskId, step.id)`，不再依赖 task 对象
   - `disabled` 只检查 `confirmingId === step.id || justCompleted.includes(step.id)`，移除 `!task` 条件
   - 确认不需要 task 对象本身，只需要 taskId 和 stepId
3. **已结案警情过滤**：加载待办步骤时，检查对应 task 的 status，排除 `COMPLETED` 警情的步骤。
4. **待处理警情只显示与我相关的**：
   - admin 角色：显示所有未结案警情
   - 非 admin 角色：只显示有分配给当前角色待确认步骤的警情（从 mySteps 中提取 taskId）
5. **跨组件同步**：
   - 将加载逻辑提取为 `loadMySteps` useCallback
   - 弹窗打开时加载
   - 监听 `todo:step-confirmed` 事件，收到后刷新弹窗列表
   - 确认成功后派发 `todo:step-confirmed` 事件（已有）
6. **按钮样式**：正常蓝色可点击（`bg-blue-600 hover:bg-blue-700` + `cursor-pointer`），确认中蓝色半透明，已确认绿色。

### 修改文件
- `src/components/common/common-todo-popup.tsx` — admin筛选、确认按钮、已结案过滤、相关警情过滤、跨组件同步

### 验证结果
- ✅ admin 角色可以看到所有待办步骤
- ✅ 即使 task 为 null，确认按钮也可点击（蓝色 cursor-pointer）
- ✅ 已结案警情对应的待办步骤不再显示
- ✅ 待处理警情 tab 只显示与当前用户相关的警情（admin 显示全部）
- ✅ 待办弹窗、我的任务、处置时间线三处状态一致（通过 `todo:step-confirmed` 事件同步）
- ✅ 确认按钮正常蓝色可点击，不是淡黄色不可点击

---

## 问题4：AI处置流程结案归档自动化

### 根因
- 处置时间线的结案归档步骤（type='archive'）使用内联UI（自动生成报告 + 确认按钮），未使用已有的 `closure-risk-modal.tsx`（包含风险推演面板 RiskSimulationPanel + AI评估报告生成 + 确认归档）。
- 内联UI缺少1.5小时风险推演的可视化展示。
- 结案归档步骤的状态显示未特殊处理（未完成时应为红色，已完成时应为绿色）。
- `closure-risk-modal.tsx` 的 AI 报告生成需要手动点击按钮，未实现打开模态框后自动生成。

### 修复方案
1. **closure-risk-modal.tsx 自动生成AI报告**：
   - 新增 `useEffect`，模态框打开后 300ms 自动调用 `generateAiReport()`（除非已有 `existingReport`）
   - AI报告生成失败时显示错误信息，保留手动"AI评估报告生成"按钮允许重试
   - 报告生成成功后显示"确认归档"按钮
   - `onConfirmArchive` 回调签名改为 `(reportText?: string, reportModel?: string) => void`，回传生成的报告内容
2. **disposal-timeline-panel.tsx 归档步骤特殊处理**：
   - 导入 `ClosureRiskModal`
   - 新增状态：`showClosureRisk`、`archiving`、`archiveError`
   - 归档步骤状态显示：未完成=红色（`bg-red-500/15 text-red-200`，标签"未完成"），已完成=绿色（`bg-emerald-500/15 text-emerald-200`，标签"已完成"）
   - 归档步骤图标圆圈：未完成时红色背景，已完成时绿色背景
   - 归档步骤卡片边框：未完成时红色边框+红色背景 tint
   - 所有前置步骤完成后，归档步骤显示红色"点击开始结案归档"按钮（可点击 cursor-pointer）
   - 点击按钮打开 `ClosureRiskModal`（自动展示风险推演 + 自动生成AI报告）
   - 移除原内联UI（自动生成报告状态 + 确认按钮），改为模态框方式
   - `confirmArchiveStep` 函数签名扩展为 `(stepId, reportText?, reportModel?)`，支持模态框回传的报告
   - 结案成功后派发 `task:closed` 事件，更新 workflow 状态（`advanced=true`），所有步骤自动显示为已完成
3. **alert-detail-client-page.tsx 兼容**：
   - `onConfirmArchive` 回调适配新签名 `(_reportText?, _reportModel?)`，详情页使用自身的 `evalReport`

### 新流程
1. 完成前面所有任务（所有步骤都确认完成）
2. 结案归档步骤显示为红色"未完成"，下方出现红色"点击开始结案归档"按钮
3. 点击按钮打开 ClosureRiskModal 模态框
4. 模态框自动展示 1.5 小时风险推演（RiskSimulationPanel）
5. 模态框自动调用 `/api/ai-analysis/report` 生成 AI 评估报告
6. AI 报告生成失败时显示错误，允许手动重试
7. 报告生成成功后，底部"确认归档"按钮变为可点击
8. 点击"确认归档"后调用 `PATCH /api/disposal {taskId, advance: true, report, by}` 结案
9. 后端同步更新 `task.status=COMPLETED`
10. 结案归档步骤自动变为绿色"已完成"（不显示手动完成按钮）
11. 整个流程全部完成，左侧警情列表刷新

### 修改文件
- `src/components/disposal/closure-risk-modal.tsx` — 自动生成AI报告 + onConfirmArchive 回传报告
- `src/components/disposal/disposal-timeline-panel.tsx` — 归档步骤红色/绿色状态 + 点击打开ClosureRiskModal + 移除内联UI
- `src/app/alert/[id]/alert-detail-client-page.tsx` — 适配新的 onConfirmArchive 签名

### 验证结果
- ✅ 所有前置步骤完成后，结案归档步骤显示红色"未完成"
- ✅ 点击"点击开始结案归档"按钮打开 ClosureRiskModal
- ✅ 模态框自动展示 1.5 小时风险推演
- ✅ 模态框自动生成 AI 评估报告（无需手动点击）
- ✅ AI 报告生成失败时显示错误并允许手动重试
- ✅ 报告生成成功后显示"确认归档"按钮
- ✅ 确认归档后调用后端结案 API，task.status=COMPLETED
- ✅ 结案归档步骤自动变为绿色"已完成"，无手动完成按钮
- ✅ 整个流程完成后左侧警情列表刷新（task:closed 事件）
- ✅ 结案归档步骤未完成=红色，已完成=绿色

---

## 构建与部署验证

### TypeScript 类型检查
```
npx tsc --noEmit
```
✅ 无类型错误

### 生产构建
```
npm run build
```
✅ 构建成功，8 个页面全部生成
- `/` (110 kB)
- `/alert/[id]` (12.9 kB)
- 28 个 API 路由

### ECS 部署
- 目标：39.104.20.182 /opt/elephant-platform
- 上传 6 个修改文件
- ECS 上 `npm run build` ✅ Compiled successfully
- `pm2 restart elephant-platform` ✅ 进程 online (pid 205829)
- PM2 状态：online，内存 58.9MB

---

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/lib/auth/auth-session-store.ts` | localStorage 持久化登录状态 + 30分钟会话超时 |
| `src/app/page.tsx` | activeTab 持久化 + task:closed 事件监听刷新列表 |
| `src/components/common/common-todo-popup.tsx` | admin筛选 + 确认按钮修复 + 已结案过滤 + 相关警情过滤 + 跨组件同步 |
| `src/components/disposal/disposal-timeline-panel.tsx` | 归档步骤红/绿状态 + ClosureRiskModal集成 + 移除内联UI + task:closed事件 |
| `src/components/disposal/closure-risk-modal.tsx` | 自动生成AI报告 + onConfirmArchive回传报告 |
| `src/app/alert/[id]/alert-detail-client-page.tsx` | task:closed事件 + 适配onConfirmArchive签名 |
