'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import {
  COUNTY_BOUNDARIES,
  circleAreaKm2,
  type DrawnShape,
  type DrawResult,
} from './map-utils'

// Leaflet 仅在浏览器端动态加载：其模块在 import 时会访问 window，不能在 SSR 阶段求值。
// CSS 可静态引入（不触碰 window），JS 模块必须按需动态加载。用模块级缓存 + Promise 保证只加载一次。
let LEAFLET: any = null
let leafletPromise: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
  if (!leafletPromise) {
    leafletPromise = (async () => {
      const mod: any = await import('leaflet')
      return mod.default ?? mod
    })()
  }
  return leafletPromise
}

export interface RealMapMarker {
  id: string
  name: string
  lng: number
  lat: number
  level: 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'
  risk?: number
  /** 是否为推演演示生成的模拟警情（非真实视频检测），用于地图上的视觉诚实标注 */
  simulated?: boolean
  /** 弹窗详情字段（有值时点击标记点弹出 Leaflet Popup） */
  time?: string
  location?: string
  detectionCount?: number
  alertType?: string
  description?: string
  status?: string
}

/** 机队信标（与监控页共享 fleet 数据源，仅消费展示所需字段，保持松耦合） */
export interface RealMapDrone {
  id: string
  lng: number
  lat: number
  status: string
  battery: number
  altitude: number
}

/** 命名路线（巡逻/处置/自定义） */
export interface RealMapRoute {
  id: string
  name: string
  /** 路线点 [lat, lng] */
  points: [number, number][]
  color?: string
  mode?: 'patrol' | 'disposal' | 'custom'
}

/** AI 智能推荐分发区域 */
export interface AiRecommendZone {
  markerId: string
  radiusMeters: number
  confidence?: number
  reason?: string
}

interface RealMapProps {
  markers: RealMapMarker[]
  className?: string
  /** 模拟巡逻/路测路线点（[lng, lat]，旧版兼容），画在地图上 */
  routePoints?: Array<[number, number]>
  /** 自定义地图中心 [lat, lng]，默认昆明 */
  center?: [number, number]
  /** 自定义初始缩放级别，默认 7 */
  zoom?: number
  /** 无人机机队实时信标层（与态势总览共享 fleet 数据源） */
  drones?: RealMapDrone[]
  /** 点击警情球回调（不带文字气泡，符合「只显示球状」要求） */
  onMarkerClick?: (marker: RealMapMarker) => void
  /** 点击地图任意位置 / 地理要素回调（lat, lng, 以及可选的地名 label，用于「点一个地方看该地警情」） */
  onMapClick?: (lat: number, lng: number, label?: string) => void
  /** 分发区域高亮：警情ID + 半径(米)，在地图上显示圆形分发范围 */
  dispatchZone?: { markerId: string; radiusMeters: number; color?: string }
  /** 分发区域半径变化回调（滑块调节时触发） */
  onDispatchZoneChange?: (radius: number) => void

  // ── 新增：手动圈画范围 ──
  /** 绘制模式：polygon=多边形点击绘制，circle=圆形拖动绘制，null=关闭 */
  drawMode?: 'polygon' | 'circle' | null
  /** 绘制完成回调 */
  onDrawComplete?: (geo: DrawResult) => void
  /** 外部控制显示的已绘制形状列表 */
  drawnShapes?: DrawnShape[]
  /** 清除绘制：递增此值即触发清空（替代 ref 方案，更符合 React 模式） */
  clearDrawingKey?: number

  // ── 新增：县级行政边界 ──
  /** 是否显示西双版纳州下辖三县（市）行政边界，默认 true */
  showCountyBoundaries?: boolean

  // ── 新增：多条命名路线 ──
  /** 多条命名路线（巡逻/处置/自定义），与旧 routePoints 可共存 */
  routes?: RealMapRoute[]
  /** 路线绘制模式：用户点击地图添加途经点 */
  drawRouteMode?: boolean
  /** 路线绘制完成回调（双击结束） */
  onRouteDrawComplete?: (points: [number, number][]) => void

  // ── 新增：AI 智能推荐分发区域 ──
  /** AI 推荐区域（紫色品红色调，与手动青色区分） */
  aiRecommendZone?: AiRecommendZone
}

const LEVEL_HEX: Record<string, string> = {
  RED: '#ef4444',
  ORANGE: '#fb923c',
  YELLOW: '#facc15',
  BLUE: '#22d3ee',
}

/**
 * 真实地图组件 — 基于本地 Leaflet（已 npm 安装，不再依赖外网 CDN）。
 *
 * 关键设计：采用「离线地理底图 + 在线瓦片」双轨策略。
 *  - 离线底图（永不失败）：云南省轮廓 + 西双版纳州运营区轮廓 + 县级边界 + 经纬网格 + 主要城市点，
 *    全部使用真实经纬度坐标，即使瓦片服务器不可达也始终呈现「真实地理态势」。
 *  - 在线瓦片（高德优先 / OSM 备选）：网络可达时叠加真实卫星/街道地图，失败则透明降级。
 */

// 云南省大致行政轮廓（[lat, lng]），用于离线地理底图，真实坐标近似勾勒
const YUNNAN_OUTLINE: [number, number][] = [
  [28.5, 98.5], [27.6, 98.8], [27.5, 98.3], [25.8, 98.3],
  [24.5, 98.0], [23.5, 99.0], [22.0, 99.2], [21.1, 99.8],
  [21.0, 101.8], [22.4, 101.5], [22.3, 102.0], [23.5, 103.5],
  [24.5, 102.5], [25.5, 101.0], [26.8, 100.0], [27.0, 99.0],
  [28.5, 98.5],
]

// 西双版纳傣族自治州运营区轮廓（[lat, lng]），真实坐标近似勾勒，是核心监测区
const XISHUANGBANNA_OUTLINE: [number, number][] = [
  [22.5, 99.9], [22.4, 100.3], [22.0, 100.4], [21.9, 100.2],
  [21.5, 100.3], [21.1, 100.5], [21.2, 101.0], [21.4, 101.6],
  [21.5, 101.8], [21.9, 101.7], [22.2, 101.4], [22.5, 100.9],
  [22.5, 99.9],
]

// 主要城市/监测节点（真实经纬度）
const CITIES: Array<{ name: string; lat: number; lng: number; major?: boolean }> = [
  { name: '昆明', lat: 24.88, lng: 102.83, major: true },
  { name: '景洪（州府）', lat: 22.0, lng: 100.79, major: true },
  { name: '勐海', lat: 21.95, lng: 100.45 },
  { name: '勐腊', lat: 21.45, lng: 101.55 },
  { name: '普洱', lat: 22.78, lng: 100.97 },
  { name: '玉溪', lat: 24.35, lng: 102.54 },
  { name: '大理', lat: 25.6, lng: 100.27 },
  { name: '临沧', lat: 23.95, lng: 100.08 },
  { name: '楚雄', lat: 25.05, lng: 101.55 },
]

// 1x1 透明 gif，用于瓦片加载失败时的占位（避免灰块）
const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

export default function RealMap({
  markers,
  className,
  routePoints,
  center = [24.88, 102.83],
  zoom = 7,
  drones,
  onMarkerClick,
  onMapClick,
  dispatchZone,
  onDispatchZoneChange,
  drawMode,
  onDrawComplete,
  drawnShapes,
  clearDrawingKey,
  showCountyBoundaries = false,
  routes,
  drawRouteMode,
  onRouteDrawComplete,
  aiRecommendZone,
}: RealMapProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerLayerRef = useRef<any>(null)
  const routeLayerRef = useRef<any>(null)
  const droneLayerRef = useRef<any>(null)
  const dispatchZoneLayerRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  // 新增图层引用
  const drawLayerRef = useRef<any>(null)       // 绘制临时层 + 完成结果
  const drawnShapesLayerRef = useRef<any>(null) // 外部控制的已绘制形状
  const countyLayerRef = useRef<any>(null)      // 县级边界层
  const aiZoneLayerRef = useRef<any>(null)      // AI 推荐区域层

  // 绘制过程状态（ref 避免闭包过期）
  const drawStateRef = useRef<{
    polygonVertices: [number, number][]
    tempMarkers: any[]
    tempLine: any
    tempPolygon: any
    circleCenter: [number, number] | null
    circleTemp: any
    routePoints: [number, number][]
    routeTempMarkers: any[]
    routeTempLine: any
    handlers: Array<[string, (...args: any[]) => void]>
  }>({
    polygonVertices: [],
    tempMarkers: [],
    tempLine: null,
    tempPolygon: null,
    circleCenter: null,
    circleTemp: null,
    routePoints: [],
    routeTempMarkers: [],
    routeTempLine: null,
    handlers: [],
  })

  const [ready, setReady] = useState(false)
  const [onlineTiles, setOnlineTiles] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 分发区域滑块状态
  const [showDispatchSlider, setShowDispatchSlider] = useState(false)
  const [dispatchRadiusLocal, setDispatchRadiusLocal] = useState<number | null>(null)
  // AI 推荐区理由弹窗
  const [aiReason, setAiReason] = useState<string | null>(null)

  // ── 离线地理底图：真实坐标的省界/运营区/经纬网/城市点，永不失败 ──
  function buildOfflineBase(map: any, L: any, onMapClick?: (lat: number, lng: number, label?: string) => void) {
    const group = L.layerGroup()

    // 经纬网格（覆盖云贵高原范围）
    const latFrom = 20.5
    const latTo = 29.5
    const lngFrom = 97.5
    const lngTo = 105.5
    for (let lat = latFrom; lat <= latTo + 0.001; lat += 0.5) {
      L.polyline(
        [
          [lat, lngFrom],
          [lat, lngTo],
        ],
        { color: '#38bdf8', weight: 1, opacity: 0.35 }
      ).addTo(group)
    }
    for (let lng = lngFrom; lng <= lngTo + 0.001; lng += 0.5) {
      L.polyline(
        [
          [latFrom, lng],
          [latTo, lng],
        ],
        { color: '#38bdf8', weight: 1, opacity: 0.35 }
      ).addTo(group)
    }

    // 主要城市/节点
    CITIES.forEach((c) => {
      L.circleMarker([c.lat, c.lng], {
        radius: c.major ? 7 : 5,
        color: c.major ? '#e2e8f0' : '#94a3b8',
        weight: 2,
        fillColor: c.major ? '#f8fafc' : '#cbd5e1',
        fillOpacity: 1,
      })
        .bindTooltip(c.name, { permanent: true, direction: 'right', className: 'rm-city-tip' })
        .on('click', (e: any) => {
          if (onMapClick) {
            L.DomEvent.stopPropagation(e)
            onMapClick(e.latlng.lat, e.latlng.lng, c.name)
          }
        })
        .addTo(group)
    })

    group.addTo(map)
    return group
  }

  // ── 清除所有绘制临时状态 ──
  function clearDrawState(L: any) {
    const s = drawStateRef.current
    s.tempMarkers.forEach((m) => { try { m.remove() } catch { /* noop */ } })
    s.routeTempMarkers.forEach((m) => { try { m.remove() } catch { /* noop */ } })
    if (s.tempLine) { try { s.tempLine.remove() } catch { /* noop */ } }
    if (s.tempPolygon) { try { s.tempPolygon.remove() } catch { /* noop */ } }
    if (s.circleTemp) { try { s.circleTemp.remove() } catch { /* noop */ } }
    if (s.routeTempLine) { try { s.routeTempLine.remove() } catch { /* noop */ } }
    s.polygonVertices = []
    s.tempMarkers = []
    s.tempLine = null
    s.tempPolygon = null
    s.circleCenter = null
    s.circleTemp = null
    s.routePoints = []
    s.routeTempMarkers = []
    s.routeTempLine = null
  }

  // ── 解绑绘制事件 ──
  function detachDrawHandlers(map: any) {
    const s = drawStateRef.current
    s.handlers.forEach(([evt, fn]) => {
      try { map.off(evt, fn) } catch { /* noop */ }
    })
    s.handlers = []
  }

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    if (!mountRef.current) return

    const forceResize = () => {
      if (mapRef.current && mountRef.current) {
        try {
          mapRef.current.invalidateSize()
        } catch {
          /* noop */
        }
      }
    }

    ;(async () => {
      try {
        const L = await loadLeaflet()
        if (cancelled || !mountRef.current) return
        LEAFLET = L

        const el = mountRef.current
        const map = L.map(el, {
          center,
          zoom,
          minZoom: 3,
          maxZoom: 18,
          zoomControl: true,
          attributionControl: true,
        })
        mapRef.current = map

        // 1) 离线底图（始终存在）
        buildOfflineBase(map, L, onMapClick)

        // 2) 在线瓦片（高德优先 / OSM 备选），失败自动透明降级
        const gaode = L.tileLayer(
          'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
          {
            subdomains: ['1', '2', '3', '4'],
            maxZoom: 18,
            attribution: '© AutoNavi',
            errorTileUrl: TRANSPARENT_TILE,
          }
        )
        const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
          errorTileUrl: TRANSPARENT_TILE,
        })
        let failed = 0
        const onTileError = () => {
          failed += 1
          if (failed === 3 && tileLayerRef.current === gaode) {
            gaode.remove()
            osm.addTo(map)
            tileLayerRef.current = osm
            failed = 0
          } else if (failed > 6) {
            if (tileLayerRef.current) {
              tileLayerRef.current.remove()
              tileLayerRef.current = null
            }
            setOnlineTiles(false)
          }
        }
        gaode.on('tileerror', onTileError)
        osm.on('tileerror', onTileError)
        gaode.addTo(map)
        tileLayerRef.current = gaode

        // 底图切换控件
        const LayerToggle = L.Control.extend({
          onAdd() {
            const div = L.DomUtil.create('div', 'leaflet-bar')
            div.style.background = 'rgba(15,23,42,0.85)'
            div.style.padding = '4px 8px'
            div.style.color = '#e2e8f0'
            div.style.fontSize = '11px'
            div.style.cursor = 'pointer'
            div.style.borderRadius = '4px'
            div.innerHTML = '🛰️ 在线'
            div.title = '点击在「在线瓦片 / 离线底图」之间切换'
            div.onclick = () => {
              const has = tileLayerRef.current && map.hasLayer(tileLayerRef.current)
              if (has) {
                map.removeLayer(tileLayerRef.current)
                div.style.opacity = '0.5'
                div.innerHTML = '🗺️ 离线'
              } else {
                if (!tileLayerRef.current) {
                  gaode.addTo(map)
                  tileLayerRef.current = gaode
                } else {
                  map.addLayer(tileLayerRef.current)
                }
                div.style.opacity = '1'
                div.innerHTML = '🛰️ 在线'
              }
            }
            return div
          },
        })
        new LayerToggle({ position: 'topright' }).addTo(map)

        // 初始化所有图层组
        markerLayerRef.current = L.layerGroup().addTo(map)
        routeLayerRef.current = L.layerGroup().addTo(map)
        droneLayerRef.current = L.layerGroup().addTo(map)
        dispatchZoneLayerRef.current = L.layerGroup().addTo(map)
        drawLayerRef.current = L.layerGroup().addTo(map)
        drawnShapesLayerRef.current = L.layerGroup().addTo(map)
        countyLayerRef.current = L.layerGroup().addTo(map)
        aiZoneLayerRef.current = L.layerGroup().addTo(map)

        if (onMapClick) {
          map.on('click', (e: any) => {
            try {
              onMapClick(e.latlng.lat, e.latlng.lng)
            } catch {
              /* noop */
            }
          })
        }

        window.addEventListener('resize', forceResize)
        resizeObserver = new ResizeObserver(forceResize)
        resizeObserver.observe(el)
        setTimeout(forceResize, 0)
        setTimeout(forceResize, 100)
        setTimeout(forceResize, 500)

        setReady(true)
      } catch (e) {
        if (!cancelled) {
          console.error('[RealMap] 初始化失败:', e)
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      window.removeEventListener('resize', forceResize)
      if (mapRef.current) {
        detachDrawHandlers(mapRef.current)
        mapRef.current.remove()
        mapRef.current = null
      }
      markerLayerRef.current = null
      routeLayerRef.current = null
      droneLayerRef.current = null
      tileLayerRef.current = null
      drawLayerRef.current = null
      drawnShapesLayerRef.current = null
      countyLayerRef.current = null
      aiZoneLayerRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // 新增：手动圈画范围（多边形 / 圆形）
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !LEAFLET) return
    const L = LEAFLET
    const s = drawStateRef.current

    // 先解绑旧事件 + 清临时状态
    detachDrawHandlers(map)
    clearDrawState(L)
    if (drawLayerRef.current) drawLayerRef.current.clearLayers()

    if (!drawMode && !drawRouteMode) return

    const isDrawActive = drawMode === 'polygon' || drawMode === 'circle' || drawRouteMode

    if (!isDrawActive) return

    // 改变鼠标样式
    const container = map.getContainer()
    if (container) container.style.cursor = 'crosshair'

    // ── 多边形绘制 ──
    if (drawMode === 'polygon') {
      const onClick = (e: any) => {
        L.DomEvent.stopPropagation(e)
        const latlng: [number, number] = [e.latlng.lat, e.latlng.lng]
        s.polygonVertices.push(latlng)

        // 顶点标记
        const vm = L.circleMarker(latlng, {
          radius: 4, color: '#22d3ee', weight: 2,
          fillColor: '#0f172a', fillOpacity: 1,
        }).addTo(map)
        s.tempMarkers.push(vm)

        // 更新临时连线
        if (s.tempLine) { try { s.tempLine.remove() } catch { /* noop */ } }
        if (s.polygonVertices.length >= 2) {
          s.tempLine = L.polyline(s.polygonVertices, {
            color: '#22d3ee', weight: 2, dashArray: '6 4', opacity: 0.8,
          }).addTo(map)
        }
        // 更新临时填充多边形
        if (s.tempPolygon) { try { s.tempPolygon.remove() } catch { /* noop */ } }
        if (s.polygonVertices.length >= 3) {
          s.tempPolygon = L.polygon(s.polygonVertices, {
            color: '#22d3ee', weight: 1, dashArray: '4 4',
            fillColor: '#22d3ee', fillOpacity: 0.1,
          }).addTo(map)
        }
      }

      const onDblClick = (e: any) => {
        L.DomEvent.stopPropagation(e)
        if (s.polygonVertices.length < 3) {
          // 不足3个点，忽略
          return
        }
        // 完成多边形
        const finalVertices = [...s.polygonVertices]
        const polygon = L.polygon(finalVertices, {
          color: '#22d3ee', weight: 2.5,
          fillColor: '#22d3ee', fillOpacity: 0.18,
        }).addTo(drawLayerRef.current)
        polygon.bindTooltip(`已绘制多边形 · ${finalVertices.length} 顶点`, { permanent: false, direction: 'top' })

        // 清理临时
        clearDrawState(L)

        onDrawComplete?.({ type: 'polygon', latlngs: finalVertices })
      }

      map.on('click', onClick)
      map.on('dblclick', onDblClick)
      s.handlers.push(['click', onClick], ['dblclick', onDblClick])
    }

    // ── 圆形绘制 ──
    if (drawMode === 'circle') {
      let isDragging = false

      const onMouseDown = (e: any) => {
        L.DomEvent.stopPropagation(e)
        isDragging = true
        s.circleCenter = [e.latlng.lat, e.latlng.lng]
        // 圆心标记
        const cm = L.circleMarker(s.circleCenter, {
          radius: 5, color: '#22d3ee', weight: 2,
          fillColor: '#22d3ee', fillOpacity: 1,
        }).addTo(map)
        s.tempMarkers.push(cm)
        // 初始临时圆
        s.circleTemp = L.circle(s.circleCenter, {
          radius: 1, color: '#22d3ee', weight: 2, dashArray: '6 4',
          fillColor: '#22d3ee', fillOpacity: 0.1,
        }).addTo(map)
      }

      const onMouseMove = (e: any) => {
        if (!isDragging || !s.circleCenter || !s.circleTemp) return
        const dx = e.latlng.lng - s.circleCenter[1]
        const dy = e.latlng.lat - s.circleCenter[0]
        // 近似米数（1度纬度≈111km）
        const radiusM = Math.sqrt(dx * dx + dy * dy) * 111000
        s.circleTemp.setRadius(Math.max(10, radiusM))
      }

      const onMouseUp = (e: any) => {
        if (!isDragging || !s.circleCenter) return
        L.DomEvent.stopPropagation(e)
        isDragging = false
        const radius = s.circleTemp ? s.circleTemp.getRadius() : 100
        const center = [...s.circleCenter] as [number, number]

        // 完成圆
        const circle = L.circle(center, {
          radius, color: '#22d3ee', weight: 2.5,
          fillColor: '#22d3ee', fillOpacity: 0.18,
        }).addTo(drawLayerRef.current)
        circle.bindTooltip(`已绘制圆形 · 半径 ${(radius / 1000).toFixed(2)}km`, { permanent: false, direction: 'top' })

        clearDrawState(L)
        onDrawComplete?.({ type: 'circle', center, radius })
      }

      map.on('mousedown', onMouseDown)
      map.on('mousemove', onMouseMove)
      map.on('mouseup', onMouseUp)
      s.handlers.push(['mousedown', onMouseDown], ['mousemove', onMouseMove], ['mouseup', onMouseUp])
    }

    // ── 路线绘制 ──
    if (drawRouteMode) {
      const onRouteClick = (e: any) => {
        L.DomEvent.stopPropagation(e)
        const latlng: [number, number] = [e.latlng.lat, e.latlng.lng]
        s.routePoints.push(latlng)

        const vm = L.circleMarker(latlng, {
          radius: 4, color: '#f59e0b', weight: 2,
          fillColor: '#0f172a', fillOpacity: 1,
        }).addTo(map)
        s.routeTempMarkers.push(vm)

        if (s.routeTempLine) { try { s.routeTempLine.remove() } catch { /* noop */ } }
        if (s.routePoints.length >= 2) {
          s.routeTempLine = L.polyline(s.routePoints, {
            color: '#f59e0b', weight: 3, dashArray: '8 4', opacity: 0.85,
          }).addTo(map)
        }
      }

      const onRouteDblClick = (e: any) => {
        L.DomEvent.stopPropagation(e)
        if (s.routePoints.length < 2) return
        const finalPoints = [...s.routePoints]
        clearDrawState(L)
        onRouteDrawComplete?.(finalPoints)
      }

      map.on('click', onRouteClick)
      map.on('dblclick', onRouteDblClick)
      s.handlers.push(['click', onRouteClick], ['dblclick', onRouteDblClick])
    }

    return () => {
      detachDrawHandlers(map)
      clearDrawState(L)
      if (container) container.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, drawRouteMode, ready])

  // ── 清除绘制（clearDrawingKey 递增触发） ──
  useEffect(() => {
    if (!ready || !LEAFLET || !drawLayerRef.current) return
    drawLayerRef.current.clearLayers()
    clearDrawState(LEAFLET)
  }, [clearDrawingKey, ready])

  // ═══════════════════════════════════════════════════════════════
  // 新增：外部控制已绘制形状（drawnShapes）
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const layer = drawnShapesLayerRef.current
    if (!ready || !layer || !LEAFLET) return
    const L = LEAFLET
    layer.clearLayers()
    ;(drawnShapes ?? []).forEach((shape) => {
      if (shape.type === 'polygon' && shape.latlngs && shape.latlngs.length >= 3) {
        L.polygon(shape.latlngs, {
          color: '#22d3ee', weight: 2.5,
          fillColor: '#22d3ee', fillOpacity: 0.18,
        }).bindTooltip(`自定义范围 · 多边形`, { permanent: false, direction: 'top' }).addTo(layer)
      } else if (shape.type === 'circle' && shape.center && shape.radius) {
        L.circle(shape.center, {
          radius: shape.radius, color: '#22d3ee', weight: 2.5,
          fillColor: '#22d3ee', fillOpacity: 0.18,
        }).bindTooltip(`自定义范围 · 半径 ${(shape.radius / 1000).toFixed(2)}km`, { permanent: false, direction: 'top' }).addTo(layer)
      }
    })
  }, [drawnShapes, ready])

  // ═══════════════════════════════════════════════════════════════
  // 新增：县级行政边界
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const layer = countyLayerRef.current
    if (!ready || !layer || !LEAFLET) return
    const L = LEAFLET
    layer.clearLayers()
    if (!showCountyBoundaries) return

    COUNTY_BOUNDARIES.forEach((county) => {
      const polygon = L.polygon(county.latlngs, {
        color: county.color,
        weight: 2,
        opacity: 0.85,
        fillColor: county.color,
        fillOpacity: 0.06,
        dashArray: '6 3',
      })
      polygon.bindTooltip(county.name, {
        permanent: true,
        direction: 'center',
        className: 'rm-county-tip',
      })
      polygon.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e)
        onMapClick?.(e.latlng.lat, e.latlng.lng, county.name)
      })
      polygon.addTo(layer)
    })
  }, [showCountyBoundaries, ready, onMapClick])

  // ═══════════════════════════════════════════════════════════════
  // 增强：多条命名路线（保持旧 routePoints 兼容）
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!ready || !map || !layer) return
    const L = LEAFLET
    if (!L) return
    map.whenReady(() => {
      try {
        if (map !== mapRef.current) return
        const rl = routeLayerRef.current
        if (!rl) return
        rl.clearLayers()

        // 旧版 routePoints（[lng, lat] 格式，保持兼容）
        if (routePoints && routePoints.length >= 2) {
          const latlngs = routePoints.map(([lng, lat]) => [lat, lng]) as [number, number][]
          L.polyline(latlngs, {
            color: '#22d3ee', weight: 3, opacity: 0.85, dashArray: '6 6',
          }).addTo(rl)
          L.circleMarker(latlngs[0], { radius: 5, color: '#22d3ee', fillColor: '#0f172a', fillOpacity: 1 })
            .addTo(rl).bindTooltip('起点', { permanent: true, direction: 'right' })
          L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, color: '#22d3ee', fillColor: '#0f172a', fillOpacity: 1 })
            .addTo(rl).bindTooltip('终点', { permanent: true, direction: 'right' })
        }

        // 新版命名路线
        ;(routes ?? []).forEach((route) => {
          if (!route.points || route.points.length < 2) return
          const color = route.color || '#22d3ee'
          const mode = route.mode || 'custom'

          // 不同模式线型
          let dashArray: string | undefined
          let weight = 3
          if (mode === 'patrol') {
            dashArray = undefined // 实线
            weight = 3.5
          } else if (mode === 'disposal') {
            dashArray = '8 6' // 虚线
          } else {
            dashArray = '2 6' // 点线
          }

          const polyline = L.polyline(route.points, {
            color, weight, opacity: 0.9, dashArray,
          }).addTo(rl)

          // 巡逻路线添加流动动画效果（通过 CSS class）
          if (mode === 'patrol') {
            const el = polyline.getElement()
            if (el) el.classList.add('rm-route-flow')
          }

          // 起点标记
          L.circleMarker(route.points[0], {
            radius: 6, color, weight: 2, fillColor: '#0f172a', fillOpacity: 1,
          }).addTo(rl).bindTooltip(`${route.name} · 起点`, { permanent: true, direction: 'right', className: 'rm-route-tip' })

          // 终点标记
          L.circleMarker(route.points[route.points.length - 1], {
            radius: 6, color, weight: 2, fillColor: color, fillOpacity: 1,
          }).addTo(rl).bindTooltip(`${route.name} · 终点`, { permanent: true, direction: 'right', className: 'rm-route-tip' })

          // 路线名称标签（中点）
          const midIdx = Math.floor(route.points.length / 2)
          L.marker(route.points[midIdx], {
            icon: L.divIcon({
              html: `<div style="background:rgba(15,23,42,0.85);color:${color};font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid ${color};white-space:nowrap;font-weight:600;">${route.name}</div>`,
              className: 'rm-route-label',
              iconSize: [0, 0],
            }),
            interactive: false,
          }).addTo(rl)
        })

        // 自适应视野（仅当有路线时）
        const allRoutePoints: [number, number][] = []
        if (routePoints && routePoints.length >= 2) {
          allRoutePoints.push(...routePoints.map(([lng, lat]) => [lat, lng] as [number, number]))
        }
        ;(routes ?? []).forEach((r) => {
          if (r.points?.length >= 2) allRoutePoints.push(...r.points)
        })
        if (allRoutePoints.length >= 2) {
          try {
            map.fitBounds(allRoutePoints, { padding: [40, 40] })
          } catch { /* noop */ }
        }
      } catch (e) {
        console.warn('[RealMap] 路线渲染跳过（地图重建中）:', (e as Error)?.message)
      }
    })
  }, [routePoints, routes, ready])

  // ═══════════════════════════════════════════════════════════════
  // 新增：AI 智能推荐分发区域
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const layer = aiZoneLayerRef.current
    if (!ready || !layer || !LEAFLET) return
    const L = LEAFLET
    layer.clearLayers()
    if (!aiRecommendZone) return

    const marker = markers.find((m) => m.id === aiRecommendZone.markerId)
    if (!marker) return

    const center: [number, number] = [marker.lat, marker.lng]
    const radius = aiRecommendZone.radiusMeters
    const confidence = aiRecommendZone.confidence ?? 0.85
    const aiColor = '#c084fc' // 品紫

    // 外层光晕（脉冲）
    L.circle(center, {
      radius: radius * 1.3,
      color: aiColor, weight: 1,
      fillColor: aiColor, fillOpacity: 0.04,
      className: 'rm-ai-pulse-outer',
    }).addTo(layer)

    // 主圆
    const mainCircle = L.circle(center, {
      radius,
      color: aiColor, weight: 2.5,
      fillColor: aiColor, fillOpacity: 0.12,
      dashArray: '6 4',
    }).addTo(layer)

    // AI 标签
    L.marker(center, {
      icon: L.divIcon({
        html: `<div style="background:linear-gradient(135deg,#7c3aed,#c084fc);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;white-space:nowrap;font-weight:700;box-shadow:0 0 12px rgba(192,132,252,0.6);">🤖 AI推荐 · ${Math.round(confidence * 100)}%</div>`,
        className: 'rm-ai-label',
        iconSize: [0, 0],
        iconAnchor: [0, -10],
      }),
      interactive: true,
    }).on('click', (e: any) => {
      L.DomEvent.stopPropagation(e)
      setAiReason(aiRecommendZone.reason || 'AI 基于象群移动轨迹、历史入侵热点和地形遮蔽分析，推荐此区域为最优分发范围。')
    }).addTo(layer)

    mainCircle.bindTooltip(
      `AI 推荐分发区域<br/>半径：${(radius / 1000).toFixed(1)}km<br/>置信度：${Math.round(confidence * 100)}%<br/><span style="font-size:10px;color:#a78bfa;">点击查看推荐理由</span>`,
      { permanent: false, direction: 'top' }
    )
    mainCircle.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e)
      setAiReason(aiRecommendZone.reason || 'AI 基于象群移动轨迹、历史入侵热点和地形遮蔽分析，推荐此区域为最优分发范围。')
    })
  }, [aiRecommendZone, markers, ready])

  // ═══════════════════════════════════════════════════════════════
  // 增强：分发区域高亮（可点击 + 滑块 + 脉冲 + 面积）
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!dispatchZone || !dispatchZoneLayerRef.current || !LEAFLET) return
    const L = LEAFLET
    dispatchZoneLayerRef.current.clearLayers()
    const marker = markers.find((m) => m.id === dispatchZone.markerId)
    if (!marker) return

    // 使用本地覆盖半径（滑块调节时）或 prop 值
    const radius = dispatchRadiusLocal ?? dispatchZone.radiusMeters
    const color = dispatchZone.color || '#35f0ff'
    const area = circleAreaKm2(radius)

    // 脉冲外圈（动画）
    L.circle([marker.lat, marker.lng], {
      radius: radius * 1.15,
      color: color, weight: 1,
      fillColor: color, fillOpacity: 0.03,
      className: 'rm-dispatch-pulse',
    }).addTo(dispatchZoneLayerRef.current)

    // 主圆（可点击）
    const mainCircle = L.circle([marker.lat, marker.lng], {
      radius,
      color: color, weight: 2.5,
      fillColor: color, fillOpacity: 0.1,
      dashArray: '8, 6',
    }).addTo(dispatchZoneLayerRef.current)

    mainCircle.bindTooltip(
      `分发区域<br/>半径：${(radius / 1000).toFixed(1)}km<br/>面积：约 ${area.toFixed(2)} km²<br/><span style="font-size:10px;color:#35f0ff;">点击调节半径</span>`,
      { permanent: false, direction: 'top' }
    )
    mainCircle.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e)
      setShowDispatchSlider((prev) => !prev)
    })

    // 内圈装饰
    L.circle([marker.lat, marker.lng], {
      radius: radius * 0.6,
      color: color, weight: 1,
      fillColor: color, fillOpacity: 0.04,
      dashArray: '4, 4',
    }).addTo(dispatchZoneLayerRef.current)
  }, [dispatchZone, markers, LEAFLET, dispatchRadiusLocal])

  // 当 dispatchZone 的 markerId 变化时重置本地半径
  useEffect(() => {
    setDispatchRadiusLocal(null)
    setShowDispatchSlider(false)
  }, [dispatchZone?.markerId])

  // ── 渲染标注点（地图就绪后再加，避免 StrictMode 竞态）──
  useEffect(() => {
    const map = mapRef.current
    const layer = markerLayerRef.current
    if (!ready || !map || !layer) return
    const L = LEAFLET
    if (!L) return
    map.whenReady(() => {
      try {
        if (map !== mapRef.current || !markerLayerRef.current) return
        markerLayerRef.current.clearLayers()
        markers.forEach((m) => {
          const color = LEVEL_HEX[m.level] || '#94a3b8'
          const html = m.simulated
            ? `
            <div style="position:relative;width:32px;height:32px;" title="推演演示 · 非真实警情">
              <div style="position:absolute;inset:0;border-radius:50%;border:2px dashed ${color};opacity:.55;animation:rm-pulse 2s infinite"></div>
              <div style="position:absolute;inset:7px;border-radius:50%;background:${color};opacity:.6;box-shadow:0 0 8px ${color}"></div>
              <div style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,.85);color:${color};font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid ${color};font-weight:bold;">推演</div>
            </div>
          `
            : `
            <div style="position:relative;width:28px;height:28px;">
              <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.35;animation:rm-pulse 1.6s infinite"></div>
              <div style="position:absolute;inset:6px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color}"></div>
            </div>
          `
          const icon = L.divIcon({ html, className: 'rm-marker', iconSize: m.simulated ? [32, 42] : [28, 28] })
          const mk = L.marker([m.lat, m.lng], { icon }).addTo(markerLayerRef.current)
          const hasDetail = m.time || m.location || m.detectionCount != null || m.alertType || m.description
          if (hasDetail) {
            const levelLabel = { RED: '红色', ORANGE: '橙色', YELLOW: '黄色', BLUE: '蓝色' }[m.level] || m.level
            const riskText = m.risk != null ? `${m.risk}` : '-'
            const countText = m.detectionCount != null ? `${m.detectionCount} 头` : '-'
            const popupHtml = `
              <div style="min-width:200px;font-size:12px;color:#0f172a;line-height:1.6;">
                <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:${LEVEL_HEX[m.level] || '#334155'};">${m.name}</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;">
                  <span style="color:#64748b;">预警等级</span><span style="font-weight:600;">${levelLabel}</span>
                  <span style="color:#64748b;">风险指数</span><span>${riskText}</span>
                  <span style="color:#64748b;">象群规模</span><span>${countText}</span>
                  ${m.alertType ? `<span style="color:#64748b;">警情类型</span><span>${m.alertType}</span>` : ''}
                  ${m.location ? `<span style="color:#64748b;">事发位置</span><span>${m.location}</span>` : ''}
                  ${m.time ? `<span style="color:#64748b;">发生时间</span><span>${m.time}</span>` : ''}
                  ${m.status ? `<span style="color:#64748b;">当前状态</span><span>${m.status}</span>` : ''}
                </div>
                ${m.description ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;color:#475569;font-size:11px;">${m.description}</div>` : ''}
                ${m.simulated ? `<div style="margin-top:4px;font-size:10px;color:#f59e0b;">⚠ 推演演示 · 非真实警情</div>` : ''}
              </div>
            `
            mk.bindPopup(popupHtml, { maxWidth: 280, className: 'rm-alert-popup' })
          }
          if (onMarkerClick)
            mk.on('click', () => {
              try {
                onMarkerClick(m)
              } catch {
                /* noop */
              }
            })
        })
      } catch (e) {
        console.warn('[RealMap] 标注渲染跳过（地图重建中）:', (e as Error)?.message)
      }
    })
  }, [markers, ready])

  // ── 渲染机队信标 ──
  useEffect(() => {
    const map = mapRef.current
    const layer = droneLayerRef.current
    if (!ready || !map || !layer) return
    const L = LEAFLET
    if (!L) return
    map.whenReady(() => {
      try {
        if (map !== mapRef.current || !droneLayerRef.current) return
        const dl = droneLayerRef.current
        dl.clearLayers()
        ;(drones ?? []).forEach((d) => {
          const flying = d.status === '飞行中' || d.status === '巡航' || d.status === '返航'
          let hue = '#22d3ee'
          if (d.status === '离线' || d.status === '故障') hue = '#ef4444'
          else if (d.status === '充电中' || d.status === '待命') hue = '#f59e0b'
          const html = `
            <div style="position:relative;width:24px;height:24px;transform:rotate(45deg);">
              <div style="position:absolute;inset:3px;border-radius:3px;background:${hue};box-shadow:0 0 10px ${hue};border:1px solid rgba(255,255,255,.7)"></div>
            </div>
          `
          const icon = L.divIcon({ html, className: 'rm-drone', iconSize: [24, 24] })
          const mk = L.marker([d.lat, d.lng], { icon }).addTo(dl)
          mk.bindPopup(
            `<div style="font-size:12px;color:#0f172a"><b>${d.id}</b><br/>状态：${d.status}<br/>电量：${d.battery}%<br/>高度：${Math.round(
              d.altitude
            )} m${flying ? '（在飞）' : ''}</div>`
          )
        })
      } catch (e) {
        console.warn('[RealMap] 机队信标渲染跳过（地图重建中）:', (e as Error)?.message)
      }
    })
  }, [drones, ready])

  // 分发区域滑块处理
  const handleRadiusChange = (val: number) => {
    setDispatchRadiusLocal(val)
    onDispatchZoneChange?.(val)
  }

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* 分发区域半径调节滑块浮层 */}
      {showDispatchSlider && dispatchZone && (
        <div className="absolute left-1/2 top-3 z-[1000] w-64 -translate-x-1/2 rounded-lg border border-cyan-400/40 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-cyan-300">调节分发半径</span>
            <button
              onClick={() => setShowDispatchSlider(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <input
            type="range"
            min={100}
            max={10000}
            step={100}
            value={dispatchRadiusLocal ?? dispatchZone.radiusMeters}
            onChange={(e) => handleRadiusChange(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>0.1km</span>
            <span className="font-bold text-cyan-300">
              {((dispatchRadiusLocal ?? dispatchZone.radiusMeters) / 1000).toFixed(1)}km
            </span>
            <span>10km</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            面积：约 {circleAreaKm2(dispatchRadiusLocal ?? dispatchZone.radiusMeters).toFixed(2)} km²
          </div>
        </div>
      )}

      {/* AI 推荐理由弹窗 */}
      {aiReason && (
        <div className="absolute bottom-3 left-1/2 z-[1000] w-72 -translate-x-1/2 rounded-lg border border-purple-400/40 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300">🤖 AI 推荐理由</span>
            <button onClick={() => setAiReason(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <p className="text-[11px] leading-5 text-slate-300">{aiReason}</p>
        </div>
      )}

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-slate-900/80 px-4 py-2 text-xs text-cyan-200 backdrop-blur">
            地图加载中…
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 p-4 text-center">
          <div className="text-sm font-medium text-red-300">地图初始化失败</div>
          <div className="max-w-xs text-xs text-slate-400">{error}</div>
          <button
            className="mt-1 rounded bg-cyan-600 px-3 py-1 text-xs text-white hover:bg-cyan-500"
            onClick={() => window.location.reload()}
          >
            刷新重试
          </button>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rm-pulse {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes rm-dispatch-pulse-anim {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes rm-ai-pulse-anim {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes rm-route-flow-anim {
          to { stroke-dashoffset: -20; }
        }
        .rm-marker { background: transparent !important; border: none !important; }
        .rm-drone { background: transparent !important; border: none !important; }
        .rm-route-label { background: transparent !important; border: none !important; }
        .rm-ai-label { background: transparent !important; border: none !important; }
        .leaflet-container { position: relative; z-index: 0; background: #0b1220; }
        .leaflet-control-attribution { font-size: 10px !important; opacity: 0.6; }
        .rm-city-tip {
          background: rgba(15, 23, 42, 0.9) !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(148, 163, 184, 0.4) !important;
          font-size: 10px !important;
          box-shadow: none !important;
        }
        .rm-city-tip::before { display: none !important; }
        .rm-county-tip {
          background: rgba(15, 23, 42, 0.85) !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(148, 163, 184, 0.3) !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          box-shadow: none !important;
        }
        .rm-county-tip::before { display: none !important; }
        .rm-route-tip {
          background: rgba(15, 23, 42, 0.85) !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(148, 163, 184, 0.3) !important;
          font-size: 10px !important;
          box-shadow: none !important;
        }
        .rm-route-tip::before { display: none !important; }
        .rm-alert-popup .leaflet-popup-content-wrapper {
          background: #ffffff !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important;
        }
        .rm-alert-popup .leaflet-popup-content { margin: 10px 14px !important; }
        .rm-alert-popup .leaflet-popup-tip { background: #ffffff !important; }
        /* 分发区域脉冲动画 */
        .rm-dispatch-pulse {
          animation: rm-dispatch-pulse-anim 2s ease-out infinite;
          transform-origin: center;
        }
        /* AI 推荐区脉冲 */
        .rm-ai-pulse-outer {
          animation: rm-ai-pulse-anim 2.5s ease-in-out infinite;
          transform-origin: center;
        }
        /* 巡逻路线流动动画 */
        .rm-route-flow {
          stroke-dasharray: 12 8;
          animation: rm-route-flow-anim 1s linear infinite;
        }
      `}} />
    </div>
  )
}
