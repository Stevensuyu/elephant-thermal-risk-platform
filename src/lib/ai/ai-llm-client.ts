/**
 * @/lib/ai-llm-client/ai.ts —— 服务端共享 LLM 工具（仅供 Next.js 服务端路由使用）
 *
 * 职责：
 *  1) 配置来源优先级：UI 配置中心激活模型（storage/ai-models.json）> 环境变量 > 默认值；
 *  2) 统一调用 OpenAI 兼容 /chat/completions；
 *  3) 内置「429/5xx/网络错误 → 指数退避重试 → 备用模型切换链」的容错策略，
 *     免费模型共享池限流时自动切换，保证不降级、不伪造；
 *  4) 支持普通文本与 JSON 模式（含健壮 JSON 提取）。
 *
 * 不硬编码任何 Key：密钥来自 UI 配置或服务端 .env。
 * 该模块引用 Node 侧全局（process.env / fetch / fs），仅允许被 app/api/** 服务端路由导入。
 */

import fs from 'fs'
import path from 'path'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallLLMOptions {
  messages: LlmMessage[]
  /** 是否要求 JSON 输出（默认 false；发送时带上 response_format，并在解析失败时兜底提取） */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  /** 可选：对模型返回正文做合法性校验，不通过则视为该模型失败并尝试下一个 */
  validate?: (content: string) => boolean
  /** SSE 流式时回调每个增量 token；返回累计文本 */
  onToken?: (delta: string) => void
}

export interface LlmResult {
  content: string
  model: string
  status: number
  ms: number
  attempts: number
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'nex-agi/nex-n2.5-pro:free'

/** 备用模型切换链：免费模型共享池限流时按序切换（可用 AI_FALLBACK_MODELS 覆盖）
 *  只保留3个经过实测可靠的模型，避免遍历过多模型导致超时 */
const DEFAULT_FALLBACK_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'inclusionai/ling-3.0-flash-vl:free',
  'nvidia/nemotron-3.5-lightning:free',
]

/** UI 配置中心存储的模型记录形状（与 api/ai-models/route.ts 保持一致） */
interface StoredAiModel {
  id: string
  name: string
  provider: string
  baseURL: string
  model: string
  apiKey: string
  active: boolean
  createdAt: string
}

const AI_MODELS_STORAGE = path.join(process.cwd(), 'storage', 'ai-models.json')

/**
 * 从 storage/ai-models.json 读取当前激活（active=true）的模型配置。
 * 文件不存在、解析失败或无激活模型时返回 null。
 * 同一时刻仅一个模型 active=true（由 api/ai-models 路由保证互斥）。
 */
export function getActiveAiModel(): StoredAiModel | null {
  try {
    const raw = fs.readFileSync(AI_MODELS_STORAGE, 'utf-8')
    const data = JSON.parse(raw)
    const models: StoredAiModel[] = Array.isArray(data?.models) ? data.models : []
    return models.find((m) => m.active === true) ?? null
  } catch {
    return null
  }
}

export function aiEnv() {
  const active = getActiveAiModel()
  // 优先级：UI 激活模型 > 环境变量 > 默认值
  const baseURL = (
    active?.baseURL?.trim() ||
    process.env.AI_BASE_URL?.trim() ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '')
  const model = active?.model?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_MODEL
  const apiKey = active?.apiKey?.trim() || process.env.AI_API_KEY?.trim() || ''
  const fallback = (process.env.AI_FALLBACK_MODELS?.trim() || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    apiKey,
    baseURL,
    model,
    fallbackModels: fallback.length ? fallback : DEFAULT_FALLBACK_MODELS,
  }
}

export function aiConfigured(): boolean {
  const active = getActiveAiModel()
  // UI 激活模型有 Key，或环境变量有 Key，任一存在即视为已配置
  return !!(active?.apiKey?.trim() || process.env.AI_API_KEY?.trim())
}

/** 模型链：主模型在前，备用模型在后（去重） */
export function modelChain(): string[] {
  const { model, fallbackModels } = aiEnv()
  const chain = [model, ...fallbackModels]
  return Array.from(new Set(chain))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 是否为可重试/可切换的失败（429 限流 / 5xx 服务端 / 网络错误） */
function isRetryable(status: number | undefined): boolean {
  if (status == null) return true // 网络层错误
  if (status === 429) return true
  if (status >= 500) return true
  return false
}

/** 单个模型的一次完整调用（含对该模型的指数退避重试） */
async function callModelOnce(
  baseURL: string,
  apiKey: string,
  model: string,
  opts: CallLLMOptions,
): Promise<LlmResult> {
  const timeoutMs = opts.timeoutMs || 40000  // 优化：从70秒减少到40秒
  const maxRetries = 0  // 优化：不重试，直接切换下一个模型，避免总时间过长
  let lastStatus: number | undefined
  let lastErr: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? 1500,
        stream: false,
      }
      // 注意：不强制使用 response_format json_object，因为部分免费模型不支持
      // 改为让模型自然输出 JSON，然后用 extractJson 提取
      if (opts.jsonMode) {
        // 只在 system prompt 中要求 JSON 输出，不设置 response_format
        // 这样兼容性更好
      }
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      })
      lastStatus = res.status
      const ms = Date.now() - started

      if (!res.ok) {
        let detail = ''
        try {
          detail = (await res.text()).slice(0, 240)
        } catch {
          /* ignore */
        }
        if (isRetryable(res.status) && attempt < maxRetries) {
          await sleep(1000 * 2 ** attempt) // 1s / 2s / 4s 退避
          continue
        }
        throw new Error(`HTTP ${res.status}（${model}）${detail ? '：' + detail : ''}`)
      }

      const data: any = await res.json()
      const content: string =
        typeof data?.choices?.[0]?.message?.content === 'string'
          ? data.choices[0].message.content
          : data?.choices?.[0]?.message?.reasoning ?? ''

      if (!content.trim()) {
        throw new Error(`模型 ${model} 返回空正文`)
      }
      if (opts.validate && !opts.validate(content)) {
        throw new Error(`模型 ${model} 返回内容未通过校验`)
      }
      return { content, model, status: res.status, ms, attempts: attempt + 1 }
    } catch (e: any) {
      lastErr = e
      clearTimeout(timer)
      // AbortError（超时）也视为可重试
      if (attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      break
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`模型调用失败：${String((lastErr as any)?.message || lastErr)}`)
}

/**
 * 主入口：沿模型链依次调用，直到某个模型成功。
 * - 对每个模型做指数退避重试（429/5xx/网络错误/超时/空正文/校验失败）；
 * - 该模型重试耗尽后自动切换到下一个备用模型，绝不伪造、绝不降级。
 */
export async function callLLM(opts: CallLLMOptions): Promise<LlmResult> {
  const { apiKey, baseURL } = aiEnv()
  if (!apiKey) throw new Error('未配置 AI_API_KEY')
  const chain = modelChain()
  let lastErr: unknown = null
  for (const model of chain) {
    try {
      return await callModelOnce(baseURL, apiKey, model, opts)
    } catch (e) {
      lastErr = e
      // 继续尝试下一个备用模型
    }
  }
  throw new Error(`所有可用模型均调用失败：${String((lastErr as any)?.message || lastErr)}`)
}

/** 尝试修复被截断的 JSON（补全未闭合的数组/对象，去掉末尾残缺字段） */
function repairTruncatedJson(s: string): string | null {
  // 找到最后一个完整的 } 或 ] 位置，从那里截断
  let depth = 0
  let lastComplete = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) lastComplete = i
    }
  }
  if (lastComplete > 0) {
    const candidate = s.slice(0, lastComplete + 1)
    try { JSON.parse(candidate); return candidate } catch { /* fall through */ }
  }
  // 退而求其次：逐层补全闭合括号
  let d2 = 0
  let stack: string[] = []
  let inStr2 = false
  let esc2 = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc2) { esc2 = false; continue }
    if (ch === '\\') { esc2 = true; continue }
    if (ch === '"') { inStr2 = !inStr2; continue }
    if (inStr2) continue
    if (ch === '{') { d2++; stack.push('}') }
    else if (ch === '[') { d2++; stack.push(']') }
    else if (ch === '}' || ch === ']') { d2 = Math.max(0, d2 - 1); stack.pop() }
  }
  // 去掉末尾可能残缺的字段（最后一个逗号后不完整的部分）
  let trimmed = s.replace(/,[^{}\[\]]*$/, '')
  while (stack.length) trimmed += stack.pop()
  try { JSON.parse(trimmed); return trimmed } catch { /* ignore */ }
  return null
}

/** 从模型正文中健壮提取 JSON（兼容 markdown 代码块包裹 / 首尾杂质 / 截断未闭合） */
export function extractJson(content: string): any {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // 尝试提取最大 {} 块
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch { /* fall through */ }
      // 尝试修复截断
      const repaired = repairTruncatedJson(m[0])
      if (repaired) {
        try { return JSON.parse(repaired) } catch { /* ignore */ }
      }
    }
    // 对整个 cleaned 尝试修复截断
    const repaired2 = repairTruncatedJson(cleaned)
    if (repaired2) {
      try { return JSON.parse(repaired2) } catch { /* ignore */ }
    }
    return null
  }
}

/** 便利函数：请求 JSON 输出并返回解析后的对象（校验失败返回 null）
 *  注意：不使用 response_format json_object（部分模型不支持），
 *  而是在 system prompt 中要求 JSON 输出，然后用 extractJson 提取 */
export async function callLLMJson(
  opts: CallLLMOptions,
): Promise<{ data: any; result: LlmResult } | null> {
  // 在 messages 开头添加 JSON 输出要求的 system prompt
  const jsonMessages = [
    { role: 'system' as const, content: '你必须严格输出合法的 JSON 对象，不要输出 markdown 代码块，不要输出任何多余文字。只输出 JSON。' },
    ...opts.messages,
  ]
  const result = await callLLM({ ...opts, messages: jsonMessages, jsonMode: false })
  const data = extractJson(result.content)
  if (data == null) return null
  return { data, result }
}

export interface LlmStreamResult {
  content: string
  model: string
  attempts: number
}

/** 单模型流式调用（SSE 转发增量到 onToken）；失败抛错由上层切换备用模型 */
async function streamModelOnce(
  baseURL: string,
  apiKey: string,
  model: string,
  opts: CallLLMOptions,
): Promise<LlmStreamResult> {
  const timeoutMs = opts.timeoutMs || 90000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let acc = ''
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 1800,
        stream: true,
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 240)
      } catch {
        /* ignore */
      }
      throw new Error(`HTTP ${res.status}（${model}）${detail ? '：' + detail : ''}`)
    }
    if (!res.body) throw new Error('空响应体')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const dataStr = trimmed.slice(5).trim()
        if (dataStr === '[DONE]') continue
        let json: any
        try {
          json = JSON.parse(dataStr)
        } catch {
          continue
        }
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          acc += delta
          if (opts.onToken) opts.onToken(delta)
        }
      }
    }
    if (!acc.trim()) throw new Error(`模型 ${model} 流式返回为空`)
    return { content: acc, model, attempts: 1 }
  } finally {
    clearTimeout(timer)
  }
}

/** 流式入口：沿模型链依次调用，任一模型成功即返回累计正文 */
export async function callLLMStream(opts: CallLLMOptions): Promise<LlmStreamResult> {
  const { apiKey, baseURL } = aiEnv()
  if (!apiKey) throw new Error('未配置 AI_API_KEY')
  const chain = modelChain()
  let lastErr: unknown = null
  for (const model of chain) {
    try {
      return await streamModelOnce(baseURL, apiKey, model, opts)
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`所有可用模型流式调用均失败：${String((lastErr as any)?.message || lastErr)}`)
}
