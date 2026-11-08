'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError] 客户端渲染异常:', error)
    // 部署后旧页面引用的 chunk 已被替换,懒加载会失败(ChunkLoadError)。
    // 此时整页刷新一次即可拿到新版本;用 sessionStorage 防止无限刷新循环。
    const msg = error?.message || ''
    if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg)) {
      const key = 'tyhx_chunk_reload_at'
      const last = Number(sessionStorage.getItem(key) || 0)
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 40,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600 }}>页面组件渲染出现异常</div>
      <div
        style={{
          maxWidth: 560,
          fontSize: 13,
          lineHeight: 1.6,
          color: '#94a3b8',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          wordBreak: 'break-word',
        }}
      >
        {error?.message || '未知错误'}
      </div>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px',
          borderRadius: 8,
          background: '#0ea5e9',
          color: '#0f172a',
          border: 'none',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        重新加载
      </button>
      <div style={{ fontSize: 12, color: '#64748b' }}>
        若反复出现，请硬刷新（Ctrl/Cmd + Shift + R）或清除浏览器缓存后重试
      </div>
    </div>
  )
}
