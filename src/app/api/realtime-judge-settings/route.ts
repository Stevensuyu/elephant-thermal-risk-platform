import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'storage')
const SETTINGS_FILE = path.join(DATA_DIR, 'realtime-judge-settings.json')

const DEFAULT_SETTINGS = {
  enabled: false,
  autoDispatch: true,
  levelThreshold: 'ORANGE',
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readSettings(): any {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS }
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function writeSettings(data: any) {
  ensureDir()
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * /api/realtime-judge-settings — 实时研判设置
 * GET: 返回设置
 * POST/PUT: 合并更新设置并保存
 */
export async function GET() {
  return NextResponse.json(readSettings())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prev = readSettings()
    const next = { ...prev, ...body }
    writeSettings(next)
    return NextResponse.json(next)
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  return POST(req)
}
