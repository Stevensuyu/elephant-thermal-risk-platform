'use client'

import { useEffect, useState, useRef } from 'react'
import { getAuth, subscribeAuth, type AuthState } from '@/lib/auth/auth-session-store'
import type { WatermarkConfig } from '@/lib/store/store-watermark-config'

const WM_KEY = 'tyhx_watermark_enabled'

export function isWatermarkEnabled(): boolean {
  try {
    return localStorage.getItem(WM_KEY) !== '0'
  } catch {
    return true
  }
}

export function setWatermarkEnabled(enabled: boolean) {
  try {
    localStorage.setItem(WM_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const COLOR_MAP: Record<string, string> = {
  white: '255,255,255',
  gray: '148,163,184',
  black: '0,0,0',
  red: '239,68,68',
}

const FONT_MAP: Record<string, string> = {
  song: '"SimSun", "宋体", serif',
  hei: '"SimHei", "黑体", sans-serif',
  yahei: '"Microsoft YaHei", "微软雅黑", sans-serif',
  arial: 'Arial, sans-serif',
  monospace: 'monospace',
}

export default function Watermark() {
  const [auth, setAuth] = useState<AuthState | null>(() => (typeof window !== 'undefined' ? getAuth() : null))
  const [enabled, setEnabled] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [config, setConfig] = useState<WatermarkConfig | null>(null)
  const wmRef = useRef<HTMLDivElement>(null)

  // 从服务端获取水印配置
  const loadConfig = () => {
    fetch('/api/watermark-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.config) setConfig(d.config) })
      .catch(() => {})
  }
  useEffect(() => {
    loadConfig()
    const onConfigUpdate = () => loadConfig()
    window.addEventListener('watermark-config-updated', onConfigUpdate)
    return () => window.removeEventListener('watermark-config-updated', onConfigUpdate)
  }, [])

  useEffect(() => {
    const unsub = subscribeAuth((a) => setAuth(a))
    setEnabled(isWatermarkEnabled())
    const timer = setInterval(() => setNow(new Date()), 60000)
    const onStorage = () => setEnabled(isWatermarkEnabled())
    window.addEventListener('storage', onStorage)

    // 防伪：MutationObserver 检测水印被隐藏/删除
    if (typeof window !== 'undefined' && wmRef.current) {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.removedNodes.length > 0) {
            for (const node of Array.from(m.removedNodes)) {
              if (node instanceof HTMLElement && node.getAttribute('data-watermark') === 'true') {
                console.warn('[安全] 检测到水印被移除，已自动恢复')
                window.dispatchEvent(new CustomEvent('watermark-tampered'))
              }
            }
          }
          if (m.type === 'attributes' && m.target === wmRef.current) {
            const el = m.target as HTMLElement
            const style = window.getComputedStyle(el)
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
              console.warn('[安全] 检测到水印被隐藏，已自动恢复')
              el.style.display = 'block'
              el.style.visibility = 'visible'
              el.style.opacity = '1'
              window.dispatchEvent(new CustomEvent('watermark-tampered'))
            }
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
      return () => { unsub(); clearInterval(timer); window.removeEventListener('storage', onStorage); observer.disconnect() }
    }

    return () => { unsub(); clearInterval(timer); window.removeEventListener('storage', onStorage) }
  }, [])

  if (!enabled || !auth) return null

  const cfg = config || {
    enabled: true, content: 'username_time', customText: '', fontSize: 14,
    fontFamily: 'monospace', opacity: 12, direction: 'diagonal25', density: 320,
    color: 'gray',
  }

  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const text = cfg.content === 'custom' && cfg.customText ? cfg.customText : `${auth.name} ${timeStr}`

  const rgb = COLOR_MAP[cfg.color] || COLOR_MAP.gray
  const fontFamily = FONT_MAP[cfg.fontFamily] || 'monospace'
  const rotate = cfg.direction === 'horizontal' ? 0 : cfg.direction === 'diagonal25' ? -25 : cfg.direction === 'diagonal45' ? -45 : 90
  const tileSize = cfg.density

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize * 0.6}">
    <defs>
      <pattern id="wm" patternUnits="userSpaceOnUse" width="${tileSize}" height="${tileSize * 0.6}" patternTransform="rotate(${rotate})">
        <text x="${tileSize / 2}" y="${tileSize * 0.3}" text-anchor="middle" fill="rgba(${rgb},${cfg.opacity / 100})" font-size="${cfg.fontSize}" font-family="${fontFamily}">${text}</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)" />
  </svg>`
  const bgUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

  return (
    <div
      ref={wmRef}
      data-watermark="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
      style={{
        backgroundImage: bgUrl,
        backgroundRepeat: 'repeat',
      }}
      aria-hidden="true"
    />
  )
}
