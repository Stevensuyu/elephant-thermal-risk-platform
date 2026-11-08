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
        若反复出现，请硬刷新（Ctrl/Cmd + Shift + R）或重启开发服务器
      </div>
    </div>
  )
}
