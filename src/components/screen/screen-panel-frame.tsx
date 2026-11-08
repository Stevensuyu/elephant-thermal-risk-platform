'use client'

// ───────────────────────────────────────────────────────────────────────────
// DataV 风格面板框:四角亮色包角 + 渐变标题条
// ───────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'

export default function ScreenPanelFrame({
  title,
  extra,
  children,
  className = '',
  bodyClass = '',
}: {
  title: string
  extra?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section
      className={`relative flex h-full min-h-0 flex-col border border-[#1d4ed8]/30 ${className}`}
      style={{ background: 'linear-gradient(180deg, rgba(10,28,64,0.85) 0%, rgba(5,16,42,0.92) 100%)', boxShadow: 'inset 0 0 24px rgba(20,80,180,0.18)' }}
    >
      {/* 四角包角 */}
      {(['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'] as const).map((pos) => (
        <span key={pos} className={`pointer-events-none absolute h-3 w-3 border-cyan-300/80 ${pos}`} />
      ))}

      {/* 标题条 */}
      <header className="flex shrink-0 items-center justify-between px-4 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-1 rounded-sm bg-gradient-to-b from-cyan-300 to-blue-500" />
          <h2 className="text-[17px] font-bold tracking-wide text-cyan-100" style={{ textShadow: '0 0 12px rgba(34,211,238,0.45)' }}>
            {title}
          </h2>
        </div>
        {extra && <div className="text-[12px] text-cyan-300/70">{extra}</div>}
      </header>
      <div className="mx-4 h-px shrink-0 bg-gradient-to-r from-cyan-400/60 via-blue-500/30 to-transparent" />

      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  )
}
