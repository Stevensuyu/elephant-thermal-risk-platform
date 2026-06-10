import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '象群热成像 AI 动态训练平台',
  description: '面向无人机热成像和边缘 AI 的动态 YOLO 训练平台',
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
