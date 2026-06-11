'use client'

import { useEffect, useRef, useState } from 'react'

export interface ChinaMapMarker {
  id: string
  name: string
  lng: number
  lat: number
  status: string
}

declare global {
  interface Window {
    AMap?: any
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

interface ChinaMapProps {
  markers: ChinaMapMarker[]
}

export default function ChinaMap({ markers }: ChinaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing-key' | 'failed'>('loading')
  const key = process.env.NEXT_PUBLIC_AMAP_KEY
  const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE

  useEffect(() => {
    if (!key) {
      setState('missing-key')
      return
    }
    if (securityCode) {
      window._AMapSecurityConfig = { securityJsCode: securityCode }
    }
    if (window.AMap) {
      setState('ready')
      return
    }
    const scriptId = 'amap-js-api'
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => setState('ready'))
      existing.addEventListener('error', () => setState('failed'))
      return
    }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => setState('ready')
    script.onerror = () => setState('failed')
    document.head.appendChild(script)
  }, [key, securityCode])

  useEffect(() => {
    if (state !== 'ready' || !containerRef.current || !window.AMap) return
    if (!mapRef.current) {
      mapRef.current = new window.AMap.Map(containerRef.current, {
        viewMode: '2D',
        zoom: 5,
        center: [102.7123, 25.0406],
        mapStyle: 'amap://styles/normal',
      })
    }
    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = markers.map((item) => {
      const marker = new window.AMap.Marker({
        position: [item.lng, item.lat],
        title: item.name,
        label: {
          content: `<div style="padding:4px 8px;border-radius:6px;background:white;border:1px solid #cbd5e1;font-size:12px">${item.name}</div>`,
          direction: 'top',
        },
      })
      marker.setMap(mapRef.current)
      marker.on('click', () => {
        const info = new window.AMap.InfoWindow({
          content: `<div style="font-size:13px;line-height:1.7"><b>${item.name}</b><br/>经纬度：${item.lng.toFixed(4)}, ${item.lat.toFixed(4)}<br/>状态：${item.status}</div>`,
          offset: new window.AMap.Pixel(0, -28),
        })
        info.open(mapRef.current, marker.getPosition())
      })
      return marker
    })
    if (markers.length) {
      mapRef.current.setFitView(markerRefs.current, false, [60, 60, 60, 60])
    }
  }, [markers, state])

  if (state === 'missing-key') {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        未配置高德地图 Key。请在 Vercel 环境变量中设置 NEXT_PUBLIC_AMAP_KEY，必要时设置 NEXT_PUBLIC_AMAP_SECURITY_JS_CODE。
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        高德地图脚本加载失败，请检查域名白名单、Key 和网络状态。
      </div>
    )
  }

  return <div ref={containerRef} className="h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100" />
}
