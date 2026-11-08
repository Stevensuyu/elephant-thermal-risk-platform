'use client'

/**
 * MockBootstrap —— 纯前端化的「无后端」引导组件。
 *
 * 它什么都不渲染，只在挂载时安装前端模拟 API 层（覆写 window.fetch）。
 * 之所以做成「第一个子组件」的 useEffect：
 *   React 的 effect 执行顺序是「子组件先于父组件、同级按渲染顺序」。
 *   把它放在 page.tsx 返回 JSX 的最前面，保证它的 effect 早于 MonitorView /
 *   JudgeView / useDroneFleet 等任何会发 /api/* 请求的 effect 执行；
 *   同时 useEffect 在 hydration（Next 自身的 fetch patch）之后运行，
 *   因此无论框架是否覆写过 fetch，这里最终都会把 window.fetch 指向前端 mock，
 *   从而让所有 /api/* 请求在浏览器内被拦截，绝不会落到已删除的服务端路由。
 */
import { useEffect } from 'react'
import { installMockApi } from '@/lib/mock/mock-api-installer'

export default function MockBootstrap() {
  useEffect(() => {
    installMockApi()
  }, [])
  return null
}
