'use client'

import { useCallback, useEffect, useState } from 'react'

export interface AlertItem {
  id: string
  taskId: string
  level: 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'
  title: string
  message: string
  roles: string[]
  alertType?: string
  location?: string
  risk?: number
  detectionCount?: number
  predictionWindow?: string
  /** active / closed */
  status?: string
  pendingConfirm?: boolean
  confirmedAt?: string
  confirmedBy?: string
  simulated?: boolean
  createdAt: string
  updatedAt: string
  read: boolean
}

/** 铃铛与系统警情中心之间的即时联动事件名 */
const EVENT = 'tyhx-alerts-changed'

/**
 * 共享警情数据钩子：铃铛与系统警情中心共用同一份 alert-messages 真相源。
 * 任一端「标记已读 / 标记未读 / 删除」操作后都会广播事件，另一端监听到即时刷新，
 * 彻底解决「右上角铃铛与总系统警情不联动」的问题。
 *
 * @param role 指定角色则只读下发到该层级的警情；传 undefined（管理员）则读全部。
 */
export function useAlerts(role?: string) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const url = role ? `/api/alerts?role=${encodeURIComponent(role)}` : '/api/alerts'
      const r = await fetch(url, { cache: 'no-store' })
      const d = await r.json()
      setAlerts(Array.isArray(d.alerts) ? (d.alerts as AlertItem[]) : [])
      setUnread(typeof d.unread === 'number' ? d.unread : 0)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    reload()
    const onChanged = () => reload()
    window.addEventListener(EVENT, onChanged)
    const t = setInterval(reload, 5000)
    return () => {
      window.removeEventListener(EVENT, onChanged)
      clearInterval(t)
    }
  }, [reload])

  const notify = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
  }

  const setRead = useCallback(
    async (id: string, read: boolean) => {
      // 乐观更新
      setAlerts((a) => a.map((x) => (x.id === id ? { ...x, read } : x)))
      setUnread((u) => {
        const t = alerts.find((x) => x.id === id)
        if (!t) return u
        if (read && !t.read) return Math.max(0, u - 1)
        if (!read && t.read) return u + 1
        return u
      })
      try {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, read }),
        })
      } catch {
        /* ignore */
      }
      notify()
    },
    [alerts]
  )

  const remove = useCallback(
    async (id: string) => {
      setAlerts((a) => a.filter((x) => x.id !== id))
      setUnread((u) => Math.max(0, u - 1))
      try {
        await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch {
        /* ignore */
      }
      notify()
    },
    []
  )

  return { alerts, unread, loading, reload, setRead, remove }
}
