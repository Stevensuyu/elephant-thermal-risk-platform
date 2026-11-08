'use client'

import { useEffect, useRef, useState } from 'react'
import { readIntegrationDraft } from '@/lib/integration-client'

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
    TMap?: any
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

interface ChinaMapProps {
  markers: ChinaMapMarker[]
}

type MapProvider = 'amap' | 'tencent'

export default function ChinaMap({ markers }: ChinaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing-key' | 'failed'>('loading')
  const [provider, setProvider] = useState<MapProvider>('amap')
  const [key, setKey] = useState('')
  const [securityCode, setSecurityCode] = useState('')

  useEffect(() => {
    void (async () => {
      const draft = readIntegrationDraft()
      try {
        const response = await fetch('/api/integrations/config', { cache: 'no-store' })
        const serverConfig = response.ok ? await response.json() : null
        const mapConfig = draft?.map || serverConfig?.map
        const nextProvider = mapConfig?.provider || 'amap'
        const nextKey = mapConfig?.apiKey || process.env.NEXT_PUBLIC_AMAP_KEY || ''
        const nextSecurityCode = mapConfig?.securityJsCode || process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE || ''
        setProvider(nextProvider)
        setKey(nextKey)
        setSecurityCode(nextSecurityCode)
      } catch {
        const mapConfig = draft?.map
        const nextProvider = mapConfig?.provider || 'amap'
        const nextKey = mapConfig?.apiKey || process.env.NEXT_PUBLIC_AMAP_KEY || ''
        const nextSecurityCode = mapConfig?.securityJsCode || process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE || ''
        setProvider(nextProvider)
        setKey(nextKey)
        setSecurityCode(nextSecurityCode)
      }
    })()
  }, [])

  useEffect(() => {
    if (!key) {
      setState('missing-key')
      return
    }

    if (provider === 'amap') {
      if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode }
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
      return
    }

    if (window.TMap) {
      setState('ready')
      return
    }
    const scriptId = 'tencent-map-js-api'
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => setState('ready'))
      existing.addEventListener('error', () => setState('failed'))
      return
    }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => setState('ready')
    script.onerror = () => setState('failed')
    document.head.appendChild(script)
  }, [key, provider, securityCode])

  useEffect(() => {
    if (state !== 'ready' || !containerRef.current) return

    if (provider === 'amap' && window.AMap) {
      if (!mapRef.current || mapRef.current.__provider !== 'amap') {
        containerRef.current.innerHTML = ''
        mapRef.current = new window.AMap.Map(containerRef.current, {
          viewMode: '2D',
          zoom: 5,
          center: [102.7123, 25.0406],
          mapStyle: 'amap://styles/normal',
        })
        mapRef.current.__provider = 'amap'
      }
      overlaysRef.current.forEach((marker) => marker.setMap?.(null))
      overlaysRef.current = markers.map((item) => {
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
      if (markers.length) mapRef.current.setFitView(overlaysRef.current, false, [60, 60, 60, 60])
      return
    }

    if (provider === 'tencent' && window.TMap) {
      containerRef.current.innerHTML = ''
      mapRef.current = new window.TMap.Map(containerRef.current, {
        center: new window.TMap.LatLng(25.0406, 102.7123),
        zoom: 5,
      })
      const geometries = markers.map((item) => ({
        id: item.id,
        position: new window.TMap.LatLng(item.lat, item.lng),
        properties: { title: item.name, status: item.status },
      }))
      const markerLayer = new window.TMap.MultiMarker({
        map: mapRef.current,
        styles: {
          default: new window.TMap.MarkerStyle({
            width: 20,
            height: 30,
            anchor: { x: 10, y: 30 },
          }),
        },
        geometries: geometries.map((item) => ({ ...item, styleId: 'default' })),
      })
      const infoWindow = new window.TMap.InfoWindow({
        map: mapRef.current,
        position: new window.TMap.LatLng(0, 0),
        offset: { x: 0, y: -32 },
      })
      infoWindow.close()
      markerLayer.on('click', (event: any) => {
        const target = geometries.find((item) => item.id === event.geometry.id)
        if (!target) return
        infoWindow.setPosition(target.position)
        infoWindow.setContent(
          `<div style="font-size:13px;line-height:1.7"><b>${target.properties.title}</b><br/>经纬度：${target.position.getLng().toFixed(4)}, ${target.position.getLat().toFixed(4)}<br/>状态：${target.properties.status}</div>`,
        )
        infoWindow.open()
      })
      overlaysRef.current = [markerLayer, infoWindow]
    }
  }, [markers, provider, state])

  if (state === 'missing-key') {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        未配置地图 Key。请在系统设置里确认高德或腾讯地图的 Key。
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        {provider === 'tencent'
          ? '腾讯地图脚本加载失败，请检查 Key、域名白名单和网络状态。'
          : '高德地图脚本加载失败，请重点检查 Web JS API Key、域名白名单，以及是否需要填写安全密钥。'}
      </div>
    )
  }

  return <div ref={containerRef} className="h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100" />
}
