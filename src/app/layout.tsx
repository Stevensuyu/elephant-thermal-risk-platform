import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '天眼护象实时研判平台',
  description: '中国地图、DJI 司空、实时热成像与 AI 分析接口的一体化研判平台',
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
