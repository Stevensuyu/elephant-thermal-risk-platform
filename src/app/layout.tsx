import type { Metadata } from 'next'
import './globals.css'
import Watermark from '@/components/common/common-watermark-layer'

export const metadata: Metadata = {
  title: '空中智能象群风险研判预警与处置系统',
  description: '面向无人机热成像和边缘 AI 的动态 YOLO 训练与分级预警联动大屏',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t!=='light');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="antialiased">{children}<Watermark /></body>
    </html>
  )
}
