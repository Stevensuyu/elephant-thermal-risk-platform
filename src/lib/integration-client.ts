import type { IntegrationConfig } from '@/lib/integrations'

const STORAGE_KEY = 'skyguard.integration-config'

export function readIntegrationDraft(): Partial<IntegrationConfig> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<IntegrationConfig>
  } catch {
    return null
  }
}

export function writeIntegrationDraft(config: IntegrationConfig) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function buildIntegrationQuery(config?: Partial<IntegrationConfig> | null) {
  if (!config) return ''
  return `?config=${encodeURIComponent(JSON.stringify(config))}`
}

export function mergeIntegrationDraft(base: IntegrationConfig, draft?: Partial<IntegrationConfig> | null): IntegrationConfig {
  if (!draft) return base
  return {
    map: { ...base.map, ...(draft.map || {}) },
    ai: { ...base.ai, ...(draft.ai || {}) },
    dji: { ...base.dji, ...(draft.dji || {}) },
    yolo: { ...base.yolo, ...(draft.yolo || {}) },
    thermal: { ...base.thermal, ...(draft.thermal || {}) },
    threeD: { ...base.threeD, ...(draft.threeD || {}) },
  }
}
