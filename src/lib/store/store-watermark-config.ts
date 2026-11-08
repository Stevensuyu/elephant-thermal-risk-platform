import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const WM_CONFIG_FILE = join(DATA_DIR, 'watermark_config.json')

export interface WatermarkConfig {
  enabled: boolean
  content: string // 'username_time' | 自定义文字
  customText: string
  fontSize: number // 12-48
  fontFamily: string // 'SimSun' | 'SimHei' | 'Microsoft YaHei' | 'Arial'
  opacity: number // 0-100
  direction: string // 'horizontal' | 'diagonal25' | 'diagonal45' | 'vertical'
  density: number // 间距 100-500
  color: string // 'white' | 'gray' | 'black' | 'red'
}

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: true,
  content: 'username_time',
  customText: '',
  fontSize: 14,
  fontFamily: 'monospace',
  opacity: 12,
  direction: 'diagonal25',
  density: 320,
  color: 'gray',
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function getWatermarkConfig(): WatermarkConfig {
  ensureDir()
  if (!existsSync(WM_CONFIG_FILE)) return { ...DEFAULT_CONFIG }
  try {
    const raw = readFileSync(WM_CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveWatermarkConfig(config: Partial<WatermarkConfig>): WatermarkConfig {
  ensureDir()
  const current = getWatermarkConfig()
  const next = { ...current, ...config }
  writeFileSync(WM_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
