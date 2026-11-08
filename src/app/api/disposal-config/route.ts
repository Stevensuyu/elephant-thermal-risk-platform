import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'storage')
const CONFIG_FILE = path.join(DATA_DIR, 'disposal-config.json')

const DEFAULT_CONFIG = {
  requireMemberConfirm: true,
  roleForStepType: {},
  reportFields: [
    { key: 'commander', label: '现场指挥', required: true, placeholder: '现场指挥员姓名' },
    { key: 'result', label: '处置结果', required: true, placeholder: '象群是否已撤离/稳控' },
    { key: 'casualty', label: '人员伤亡/财产损失', required: false, placeholder: '无 / 简述' },
    { key: 'leftover', label: '遗留问题', required: false, placeholder: '需后续跟进的事项' },
  ],
  allowManualEdit: true,
}

async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }) } catch {}
}

async function readConfig() {
  await ensureDir()
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

async function writeConfig(config: any) {
  await ensureDir()
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export async function GET(_req: NextRequest) {
  try {
    const config = await readConfig()
    return NextResponse.json({ success: true, config })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '获取失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const config = body?.config
    if (!config || typeof config !== 'object') {
      return NextResponse.json({ success: false, error: '配置数据无效' }, { status: 400 })
    }
    const merged = { ...DEFAULT_CONFIG, ...config }
    await writeConfig(merged)
    return NextResponse.json({ success: true, config: merged })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '保存失败' }, { status: 500 })
  }
}
