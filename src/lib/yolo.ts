import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface YoloPredictionInput {
  file?: File
  sourceUrl?: string
}

export interface YoloPrediction {
  backend: 'service' | 'python'
  model: string
  detections: Array<{
    label: string
    confidence: number
    box?: { x1: number; y1: number; x2: number; y2: number }
  }>
  raw?: unknown
}

export async function runYoloPrediction(input: YoloPredictionInput): Promise<YoloPrediction> {
  const serviceUrl = process.env.YOLO_SERVICE_URL
  if (serviceUrl) {
    return callYoloService(serviceUrl, input)
  }
  return callLocalPython(input)
}

async function callYoloService(serviceUrl: string, input: YoloPredictionInput): Promise<YoloPrediction> {
  const form = new FormData()
  if (input.file) form.set('image', input.file)
  if (input.sourceUrl) form.set('sourceUrl', input.sourceUrl)
  const response = await fetch(serviceUrl, { method: 'POST', body: form })
  if (!response.ok) {
    throw new Error(`YOLO service failed: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  return {
    backend: 'service',
    model: String(payload.model || process.env.YOLO_MODEL || 'remote-yolo'),
    detections: Array.isArray(payload.detections) ? payload.detections : [],
    raw: payload,
  }
}

async function callLocalPython(input: YoloPredictionInput): Promise<YoloPrediction> {
  if (!input.file && !input.sourceUrl) {
    throw new Error('请上传图片或提供图片 URL')
  }
  const python = process.env.YOLO_PYTHON || process.env.PYTHON || 'python'
  const weights = process.env.YOLO_WEIGHTS || path.join(process.cwd(), 'yolov8n.pt')
  const script = path.join(process.cwd(), 'scripts', 'yolo_predict.py')
  let source = input.sourceUrl

  if (input.file) {
    const tempDir = path.join(process.cwd(), 'storage', 'tmp-yolo')
    await mkdir(tempDir, { recursive: true })
    const safeName = input.file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    source = path.join(tempDir, `${Date.now()}-${safeName}`)
    await writeFile(source, Buffer.from(await input.file.arrayBuffer()))
  }

  const { stdout, stderr } = await execFileAsync(python, [script, '--source', String(source), '--weights', weights], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10,
    timeout: 1000 * 60 * 5,
  })
  if (stderr && !stdout) {
    throw new Error(stderr.slice(-1200))
  }
  const payload = JSON.parse(stdout)
  return {
    backend: 'python',
    model: String(payload.model || weights),
    detections: Array.isArray(payload.detections) ? payload.detections : [],
    raw: payload,
  }
}
