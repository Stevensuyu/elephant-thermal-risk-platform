import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'storage')
const MODE_FILE = path.join(DATA_DIR, 'live-detection-mode.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readMode(): 'off' | 'demo' {
  try {
    if (!fs.existsSync(MODE_FILE)) return 'off'
    const content = fs.readFileSync(MODE_FILE, 'utf-8')
    const parsed = JSON.parse(content)
    return parsed.mode === 'demo' ? 'demo' : 'off'
  } catch {
    return 'off'
  }
}

function writeMode(mode: 'off' | 'demo') {
  ensureDir()
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode }, null, 2), 'utf-8')
}

/**
 * /api/live-detection — 实时检测数据
 *
 * 优先对接本地真实检测服务（worker/detect，端口 8765）：摄像头/视频流/无人机 +
 * YOLO 最新版 或 英伟达 LocateAnything-3B 的真实识别结果。
 * 检测服务未启动时，仅当 mode='demo'（推演演示）才返回模拟检测，全程标注「推演演示」。
 */
const DETECT_BASE = process.env.DETECT_BASE_URL || 'http://127.0.0.1:8765'

async function fetchRealDetection() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const resp = await fetch(`${DETECT_BASE}/api/live-detection`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (resp.ok) return await resp.json()
    return null
  } catch {
    return null
  }
}

export async function GET() {
  const real = await fetchRealDetection()
  if (real && real.running === true) {
    return NextResponse.json(real)
  }

  const mode = readMode()
  if (mode === 'demo') {
    const detections = [
      { track_id: 1, class_name: 'elephant', score: 0.984, bbox_norm: [0.12, 0.1, 0.34, 0.42] },
      { track_id: 2, class_name: 'elephant', score: 0.951, bbox_norm: [0.46, 0.18, 0.3, 0.4] },
      { track_id: 3, class_name: 'elephant', score: 0.92, bbox_norm: [0.62, 0.52, 0.28, 0.38] },
    ]
    const maxConf = Math.max(...detections.map((d) => d.score))
    return NextResponse.json({
      connected: true,
      mode: 'demo',
      running: true,
      source: 'demo',
      detected: true,
      class_name: 'elephant',
      confidence: maxConf,
      max_confidence: maxConf,
      count: detections.length,
      detected_count: detections.length,
      bbox: detections[0].bbox_norm,
      detections,
      continuous_frames: 27,
      frame: Math.floor(Date.now() / 1000) % 100000,
      timestamp: new Date().toISOString(),
      note: '推演演示（非真实视频源，仅用于流程演示，请勿当作真实警情）',
    })
  }
  return NextResponse.json({
    connected: false,
    mode: 'off',
    running: false,
    detected: false,
    realService: real ? 'online' : 'offline',
    note: '未接入真实视频流（检测服务未启动时请运行 start-detect.bat）',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const next: 'off' | 'demo' = body?.mode === 'demo' ? 'demo' : 'off'
    writeMode(next)
    return NextResponse.json({ ok: true, mode: next, connected: next === 'demo' })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
