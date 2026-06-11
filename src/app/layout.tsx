import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '大象热风险平台',
  description: '中国地图接入、AI 研判和 YOLO 训练的一体化热成像预警平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
