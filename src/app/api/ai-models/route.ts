// ───────────────────────────────────────────────────────────────────────────
// 真·AI模型CRUD：服务端路由（Next.js App Router Route Handler）
// 读写 storage/ai-models.json，替代前端 mock-router 的 localStorage 方案，
// 使 UI 中配置/启用的模型对服务端 LLM 客户端（ai-llm-client.ts）真实生效。
// ───────────────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORAGE_FILE = path.join(process.cwd(), 'storage', 'ai-models.json')

/** 厂商模板（与 mock-router AI_TEMPLATES 保持一致，供前端「一键填入」） */
const AI_TEMPLATES = [
  { provider: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'minimax/minimax-m3:free', hint: 'OpenRouter 聚合平台，免费模型 minimax/minimax-m3:free' },
  { provider: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: '智谱 GLM-4 系列，OpenAI 兼容' },
  { provider: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '深度求索 DeepSeek-V3/R1' },
  { provider: 'Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '月之暗面 Kimi 长上下文' },
  { provider: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max', hint: '阿里云通义千问' },
  { provider: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: 'OpenAI 官方兼容端点' },
]

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

/** 读取模型列表（文件不存在或解析失败时返回空数组） */
function readModels(): AiModel[] {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data.models) ? data.models : []
  } catch {
    return []
  }
}

/** 写入模型列表（确保 storage 目录存在） */
function writeModels(models: AiModel[]): void {
  const dir = path.dirname(STORAGE_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(STORAGE_FILE, JSON.stringify({ models }, null, 2), 'utf-8')
}

/** 生成唯一 ID */
function genId(): string {
  return 'MDL_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

/** 归一化模型形状 */
function normModel(m: any): AiModel {
  return {
    id: m.id || genId(),
    name: m.name || m.model || '未命名模型',
    provider: m.provider || m.vendor || '自定义',
    baseURL: m.baseURL || m.endpoint || '',
    model: m.model || '',
    apiKey: m.apiKey ?? '',
    active: m.active ?? m.enabled ?? false,
    createdAt: m.createdAt || new Date().toISOString(),
  }
}

// GET: 返回模型列表 + 厂商模板
export async function GET() {
  const models = readModels()
  return Response.json({ models, templates: AI_TEMPLATES })
}

// POST: 新增模型
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* 保持空对象 */
  }
  const list = readModels()
  const nm = normModel({ ...body, id: genId() })
  // 同一时刻仅启用一个模型：启用新模型时其余自动停用
  const next = nm.active ? list.map((x) => ({ ...x, active: false })) : list
  next.push(nm)
  writeModels(next)
  return Response.json({ success: true, ok: true, model: nm })
}

// PATCH: 更新模型（支持设为 active，同时其余设为 false）
export async function PATCH(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* 保持空对象 */
  }
  const list = readModels()
  const idx = list.findIndex((m) => m.id === body.id)
  if (idx < 0) {
    return Response.json({ success: false, ok: false, error: '模型不存在' }, { status: 404 })
  }
  const updated = normModel({ ...list[idx], ...body, id: body.id })
  let next = list.map((m) => (m.id === body.id ? updated : m))
  if (body.active) {
    next = next.map((m) => (m.id === body.id ? m : { ...m, active: false }))
  }
  writeModels(next)
  return Response.json({ success: true, ok: true, model: updated })
}

// DELETE: 删除模型（通过 query param id）
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  const list = readModels()
  const next = list.filter((m) => m.id !== id)
  writeModels(next)
  return Response.json({ success: true, ok: true })
}
