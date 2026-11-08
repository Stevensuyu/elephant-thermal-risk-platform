'use client'

// ───────────────────────────────────────────────────────────────────────────
// iDataV 风格自适应大屏容器:按 1920×1080 设计稿等比缩放(宽高各自拉伸,铺满)
// 参考 github.com/yyhsong/iDataV 的 scale 适配方案
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from 'react'

const DESIGN_W = 1920
const DESIGN_H = 1080

export default function ScreenContainer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState({ x: 1, y: 1 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setScale({ x: el.clientWidth / DESIGN_W, y: el.clientHeight / DESIGN_H })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="h-full w-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #07204a 0%, #030e26 55%, #010814 100%)' }}
    >
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale.x}, ${scale.y})`,
          transformOrigin: 'left top',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  )
}
