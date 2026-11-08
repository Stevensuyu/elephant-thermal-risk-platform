'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { WarningLevel } from '@/lib/utils/util-app-types'
import type { Drone } from '@/lib/utils/util-use-drone-fleet-hook'

export interface MapMarker {
  id: string
  name: string
  lng: number
  lat: number
  level: WarningLevel
  risk: number
  detectedCount: number
  /** 警情类型（如 象群入侵 / 人象冲突 / 农作物损毁），用于标记图标与详情 */
  type?: string
}

/** 点击地图平面后反算出的地理位置 */
export interface PickResult {
  lat: number
  lng: number
  /** 最近的州市名称 */
  city: string
}

interface RiskMap3DProps {
  markers: MapMarker[]
  /** 无人机机队实时遥测 —— 与实时监控共享同一数据源，直接汇聚到态势总览三维地图 */
  fleet?: Drone[]
  className?: string
  /** 放大态下点击地图平面时回调（反算经纬度 + 最近城市） */
  onPick?: (r: PickResult) => void
  /** 放大态下点击警情处置点（光柱球体）时回调，传入警情 id —— 触发警情详情卡片 */
  onPickAlert?: (alertId: string) => void
  /** 缩放越过阈值（进入/退出"放大可拾取"态）时回调 */
  onZoomLevelChange?: (zoomedIn: boolean) => void
  /** 相机距离阈值：小于该值视为"放大态"，可拾取；默认 5.8 */
  zoomThreshold?: number
}

const LEVEL_COLOR: Record<WarningLevel, number> = {
  RED:    0xff3b3b,
  ORANGE: 0xff8a3b,
  YELLOW: 0xffd93b,
  BLUE:   0x34f5c5,
}
// ── 云南真实经纬度边界（来自权威 GeoJSON 实测，与态势总览省界共用同一投影）──
const LNG_MIN = 97.4
const LNG_MAX = 106.3
const LAT_MIN = 21.0
const LAT_MAX = 29.35
// 等比例投影：经度方向按 cos(参考纬度) 缩放，避免地图横向/纵向拉伸失真
const LAT_REF = 25.2
const COS_REF = Math.cos((LAT_REF * Math.PI) / 180)
const K = 0.42
// 平面尺寸由真实经纬度跨度推导，确保省界 GeoJSON、城市标签、事件点共用同一坐标尺度
const MAP_W = (LNG_MAX - LNG_MIN) * COS_REF * K
const MAP_H = (LAT_MAX - LAT_MIN) * K

/* ── 云南省 16 州市真实中心坐标 ─────────────────────────── */
export interface CityLabel { name: string; lng: number; lat: number }
export const YUNNAN_CITIES: CityLabel[] = [
  { name: '昆明市',     lng: 102.83, lat: 24.88 },
  { name: '曲靖市',     lng: 103.80, lat: 25.49 },
  { name: '玉溪市',     lng: 102.55, lat: 24.35 },
  { name: '保山市',     lng:  99.17, lat: 25.11 },
  { name: '昭通市',     lng: 103.72, lat: 27.34 },
  { name: '丽江市',     lng: 100.23, lat: 26.86 },
  { name: '普洱市',     lng: 100.97, lat: 22.78 },
  { name: '临沧市',     lng: 100.09, lat: 23.88 },
  { name: '楚雄州',     lng: 101.55, lat: 25.04 },
  { name: '红河州',     lng: 103.38, lat: 23.37 },
  { name: '文山州',     lng: 104.24, lat: 23.37 },
  { name: '西双版纳',   lng: 100.80, lat: 22.00 },
  { name: '大理州',     lng: 100.27, lat: 25.61 },
  { name: '德宏州',     lng:  98.58, lat: 24.43 },
  { name: '怒江州',     lng:  98.85, lat: 25.85 },
  { name: '迪庆州',     lng:  99.71, lat: 27.83 },
]

/** 全云南经纬度范围 → 平面坐标（与省界 GeoJSON / 城市标签 / 事件点完全一致） */
function lngLatToPlane(lng: number, lat: number): [number, number] {
  const x = (lng - (LNG_MIN + LNG_MAX) / 2) * COS_REF * K
  const z = (lat - (LAT_MIN + LAT_MAX) / 2) * K
  return [x, z]
}

/** 创建文字 Sprite（始终面向相机，清爽描边风格） */
function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width  = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  ctx.font = 'bold 56px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  // 细描边 + 柔光，确保在任何底图上都清爽可读
  ctx.lineWidth   = 6
  ctx.strokeStyle = 'rgba(3,10,24,0.95)'
  ctx.strokeText(text, 256, 64)
  ctx.fillStyle   = '#eaf6ff'
  ctx.fillText(text, 256, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace  = THREE.SRGBColorSpace
  tex.anisotropy  = 4
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
  const spr = new THREE.Sprite(mat)
  spr.scale.set(0.66, 0.165, 1)
  return spr
}

/** 警情类型 → 图标字符（canvas 文本精灵可直接渲染 emoji） */
function alertEmoji(type?: string): string {
  if (!type) return '🐘'
  if (type.includes('人象') || type.includes('冲突')) return '⚠️'
  if (type.includes('农作物') || type.includes('损毁') || type.includes('庄稼')) return '🌾'
  if (type.includes('村庄') || type.includes('闯入') || type.includes('居民')) return '🏠'
  if (type.includes('道路') || type.includes('交通')) return '🛣️'
  return '🐘'
}

/** Deterministic position from task id */
export function seedMarkerPosition(id: string): { lng: number; lat: number } {
  const [x, z] = seedPos(id)
  // 逆投影：把确定性散点（平面坐标）还原到真实云南经纬度范围，保证落点在省内
  const lng = x / (COS_REF * K) + (LNG_MIN + LNG_MAX) / 2
  const lat = z / K + (LAT_MIN + LAT_MAX) / 2
  return { lng, lat }
}

function seedPos(id: string): [number, number] {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  h = h >>> 0
  const x = ((h & 0xffff) / 0xffff) * MAP_W * 0.82 - MAP_W * 0.41
  const z = ((h >>> 16) / 0xffff) * MAP_H * 0.82 - MAP_H * 0.41
  return [x, z]
}

export default function RiskMap3D({ markers, fleet, className, onPick, onPickAlert, onZoomLevelChange, zoomThreshold = 6.0 }: RiskMap3DProps) {
  const mountRef   = useRef<HTMLDivElement>(null)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const fleetRef = useRef(fleet)
  fleetRef.current = fleet

  // 让一次性初始化的 effect 始终拿到最新的回调/阈值
  const propsRef = useRef({ onPick, onPickAlert, onZoomLevelChange, zoomThreshold })
  propsRef.current = { onPick, onPickAlert, onZoomLevelChange, zoomThreshold }

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    let cancelled = false

    // ── Renderer ──────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.toneMapping        = THREE.ACESFilmicToneMapping  // cinematic colour
    renderer.toneMappingExposure = 1.2
    el.appendChild(renderer.domElement)

    // ResizeObserver for responsive canvas
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { clientWidth, clientHeight } = entry.target
        renderer.setSize(clientWidth, clientHeight)
        camera.aspect = clientWidth / clientHeight
        camera.updateProjectionMatrix()
      }
    })
    observer.observe(el)

    // ── Scene ─────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x060e1f, 0.14)

    // ── Camera ────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 50)
    camera.position.set(0, 3.8, 5.2)
    camera.lookAt(0, 0, 0)

    // ── 3-Point Lighting ─────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x0a1a3a, 1.8))

    const keyLight = new THREE.DirectionalLight(0x4af0ff, 1.8)
    keyLight.position.set(3, 6, 4)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x1a3a7a, 0.9)
    fillLight.position.set(-4, 2, -2)
    scene.add(fillLight)

    const rimLight = new THREE.PointLight(0x35f0ff, 1.2, 12)
    rimLight.position.set(0, 4, -4)
    scene.add(rimLight)

    // ── Pivot (for rotation) ──────────────────────────────────────────
    const pivot = new THREE.Group()
    scene.add(pivot)

    // ── Satellite base map (云南卫星影像 yunnan-base.jpg，源自用户提供的 123.png) ──
    const mapGeo = new THREE.PlaneGeometry(MAP_W, MAP_H)
    const mapMat = new THREE.MeshStandardMaterial({ color: 0x112244, roughness: 0.85, metalness: 0.1 })
    const mapMesh = new THREE.Mesh(mapGeo, mapMat)
    mapMesh.rotation.x = -Math.PI / 2
    pivot.add(mapMesh)

    const loader = new THREE.TextureLoader()
    loader.load(
      '/map/yunnan-base.jpg',
      (tex) => {
        tex.colorSpace  = THREE.SRGBColorSpace
        // 适配贴图比例：保持云南影像在地图平面上的合理拉伸
        tex.anisotropy = 4
        mapMat.map      = tex
        // 卫星影像仅作暗色底纹，权威地理参考以省界 GeoJSON 描边为准，避免影像经纬度范围未知导致点位偏移
        mapMat.color.set(0x2c4a6b)
        mapMat.needsUpdate = true
      },
      undefined,
      () => {
        // Fallback procedural grid texture
        const c = document.createElement('canvas'); c.width = c.height = 512
        const ctx = c.getContext('2d')!
        const grd = ctx.createLinearGradient(0, 0, 512, 512)
        grd.addColorStop(0,   '#0b1e3d')
        grd.addColorStop(0.5, '#0d2845')
        grd.addColorStop(1,   '#091929')
        ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 512)
        ctx.strokeStyle = 'rgba(53,240,255,0.10)'; ctx.lineWidth = 1
        for (let i = 0; i <= 512; i += 28) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
        }
        mapMat.map = new THREE.CanvasTexture(c)
        mapMat.color.set(0xffffff); mapMat.needsUpdate = true
      }
    )

    // Grid overlay
    const grid = new THREE.GridHelper(MAP_W, 14, 0x1a4a6a, 0x0d2a46)
    grid.position.y = 0.003
    pivot.add(grid)

    // ── City labels (云南省 16 州市真实地理标注) ──────────────────
    const labelGroup = new THREE.Group()
    YUNNAN_CITIES.forEach((city) => {
      const [px, pz] = lngLatToPlane(city.lng, city.lat)
      const spr = makeTextSprite(city.name)
      spr.scale.set(0.28, 0.07, 1)     // 缩小城市标注，避免俯视时占用过多视觉
      spr.position.set(px, 0.025, pz)   // 略高于底图平面避免 z-fighting
      labelGroup.add(spr)
    })
    pivot.add(labelGroup)

    // ── Marker & Fly-line groups ──────────────────────────────────────
    const markerGroup  = new THREE.Group()
    const flyLineGroup = new THREE.Group()
    const droneGroup   = new THREE.Group() // 机队实时信标层（与监控页共享 fleet 数据源）
    const geoGroup     = new THREE.Group() // 云南省界 / 州市界（权威地理参考，与事件点同投影）
    pivot.add(markerGroup, flyLineGroup, droneGroup, geoGroup)

    // 云南省界 GeoJSON 描边：用与事件点完全相同的 lngLatToPlane 投影，
    // 保证"事件点落在地图具体点位上"，不再依赖未经地理配准的卫星影像。
    function drawYunnanOutline(json: any) {
      const features: any[] = json?.features || []
      features.forEach((f) => {
        const geom = f?.geometry
        if (!geom) return
        const polys: any[] =
          geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
        polys.forEach((rings: any[]) => {
          rings.forEach((ring: number[][], ri: number) => {
            if (!Array.isArray(ring) || ring.length < 2) return
            const pts = ring.map((c) => {
              const [x, z] = lngLatToPlane(c[0], c[1])
              return new THREE.Vector3(x, 0.012, z)
            })
            const outer = ri === 0
            const mat = new THREE.LineBasicMaterial({
              color: outer ? 0x4ff5d0 : 0x1f6f8f,
              transparent: true,
              opacity: outer ? 0.9 : 0.42,
            })
            geoGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
          })
        })
      })
    }

    ;(async () => {
      try {
        const res = await fetch('/map/yunnan.geojson')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) drawYunnanOutline(json)
      } catch {
        /* 离线或文件缺失时忽略：仍保留城市标签与网格作为参考 */
      }
    })()

    let prevSig = ''
    let prevFleetSig = ''
    // 警情标记标签（放大态放大可读性）+ 可拾取目标（球体）
    const markerLabels: THREE.Sprite[] = []
    const markerPickTargets: THREE.Mesh[] = []

    // 机队状态 → 信标颜色
    function droneColor(d: Drone): number {
      if (d.status === '离线' || d.status === '故障') return 0xff3b3b
      if (d.status === '充电中' || d.status === '待命') return 0xffb020
      return 0x35f0ff // 飞行中 / 巡航 / 返航
    }

    function buildDrones(list: Drone[] | undefined) {
      // 释放旧的机队几何/材质
      droneGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material?.dispose()
        }
        if (obj instanceof THREE.Sprite) {
          const mat = obj.material as THREE.SpriteMaterial
          mat.map?.dispose(); mat.dispose()
        }
      })
      droneGroup.clear()
      if (!list?.length) return
      list.forEach((d) => {
        const [px, pz] = lngLatToPlane(d.lng, d.lat)
        const color = droneColor(d)
        const flying = d.status === '飞行中' || d.status === '巡航' || d.status === '返航'

        // 机身：八面体信标（地面设备压扁）
        const body = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.022, 0),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.6 })
        )
        const y = flying ? 0.12 + d.altitude / 4000 : 0.03
        body.position.set(px, y, pz)
        droneGroup.add(body)

        // 高度柱（飞行中显示，体现实时高度）
        if (flying) {
          const stalk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.003, 0.003, y, 8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
          )
          stalk.position.set(px, y / 2, pz)
          droneGroup.add(stalk)
        }

        // 标签：机号 + 状态 + 电量
        const spr = makeTextSprite(`${d.id.replace('UAV-', 'U')}·${d.battery}%`)
        spr.position.set(px, y + 0.06, pz)
        spr.scale.set(0.26, 0.065, 1)
        droneGroup.add(spr)
      })
    }

    function buildScene(list: MapMarker[]) {
      // Dispose old geometry/material before clearing — prevents GPU leak on rebuild
      ;[markerGroup, flyLineGroup].forEach((g) =>
        g.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose()
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
            else obj.material?.dispose()
          }
          if (obj instanceof THREE.Line) {
            obj.geometry?.dispose()
            ;(Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m?.dispose())
          }
          if (obj instanceof THREE.Sprite) {
            const mat = obj.material as THREE.SpriteMaterial
            mat.map?.dispose(); mat.dispose()
          }
        })
      )
      markerGroup.clear(); flyLineGroup.clear()
      markerLabels.length = 0
      markerPickTargets.length = 0
      if (!list.length) return

      const sorted = [...list].sort((a, b) => b.risk - a.risk)
      const posMap  = new Map<string, [number, number]>()

      list.forEach((m) => {
        // 优先使用真实经纬度（来自真实视频源定位 / 手动警情拾取），无坐标才退回确定性散点
        let px: number, pz: number
        if (typeof m.lng === 'number' && typeof m.lat === 'number') {
          ;[px, pz] = lngLatToPlane(m.lng, m.lat)
        } else {
          ;[px, pz] = seedPos(m.id)
        }
        posMap.set(m.id, [px, pz])

        const color = LEVEL_COLOR[m.level] ?? 0x35f0ff
        const r     = m.level === 'RED' ? 0.05 : m.level === 'ORANGE' ? 0.04 : 0.03
        const ei    = m.level === 'RED' ? 2.8 : m.level === 'ORANGE' ? 2.2 : 1.6

        // Core sphere
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(r, 24, 24),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: ei, roughness: 0.1, metalness: 0.5 })
        )
        sphere.position.set(px, r + 0.01, pz)
        sphere.userData.id = m.id
        markerGroup.add(sphere)
        markerPickTargets.push(sphere)

        // 警情标记标签：类型图标 + #编号（只显标识，不再叠加红/橙/黄/蓝色号文字，避免光标下字体杂乱）
        const label = makeTextSprite(`${alertEmoji(m.type)}`)
        label.position.set(px, r + 0.18, pz)
        label.scale.set(0.32, 0.08, 1)
        markerGroup.add(label)
        markerLabels.push(label)

        // Halo ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.5, r * 2.0, 32),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.2 })
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(px, 0.004, pz)
        markerGroup.add(ring)

        // Dynamic point light for high-risk
        if (m.level === 'RED' || m.level === 'ORANGE') {
          const pt = new THREE.PointLight(color, m.level === 'RED' ? 0.8 : 0.5, 1.5)
          pt.position.set(px, 0.25, pz)
          markerGroup.add(pt)
        }
      })

      // ── Fly lines: hub (highest risk) → others ──────────────────────
      if (sorted.length >= 2) {
        const hub = sorted[0]
        const [hx, hz] = posMap.get(hub.id)!
        for (let i = 1; i < Math.min(sorted.length, 6); i++) {
          const tgt = sorted[i]
          const [tx, tz] = posMap.get(tgt.id)!
          const mid = new THREE.Vector3((hx + tx) / 2, 0.55 + Math.abs(hx - tx) * 0.2, (hz + tz) / 2)
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(hx, 0.06, hz), mid, new THREE.Vector3(tx, 0.06, tz)
          )
          flyLineGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(curve.getPoints(44)),
            new THREE.LineBasicMaterial({ color: LEVEL_COLOR[hub.level], transparent: true, opacity: 0.4 })
          ))
        }
      }
    }

    // ── Interaction ───────────────────────────────────────────────────
    let rotY = 0, isDragging = false, lastX = 0, autoRotate = true
    let resumeTimer: ReturnType<typeof setTimeout> | null = null

    // 点击拾取：区分"轻点"与"拖拽旋转"
    let downX = 0, downY = 0, downT = 0, moved = false
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    function nearestCity(lng: number, lat: number): string {
      let best = YUNNAN_CITIES[0]
      let bestD = Infinity
      for (const c of YUNNAN_CITIES) {
        const d = (c.lng - lng) ** 2 + (c.lat - lat) ** 2
        if (d < bestD) { bestD = d; best = c }
      }
      return best.name
    }

    /** 屏幕坐标 → 射线命中地图平面 → 反算经纬度 → 回调 onPick */
    function doPick(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(mapMesh, false)
      if (!hits.length) return
      const p = hits[0].point
      // 世界坐标 → pivot 局部（仅绕 Y 旋转）→ 经纬度反算
      const ang = -pivot.rotation.y
      const cosA = Math.cos(ang), sinA = Math.sin(ang)
      const lx = p.x * cosA - p.z * sinA
      const lz = p.x * sinA + p.z * cosA
      const LNG_MIN = 97.5, LNG_MAX = 105.5, LAT_MIN = 21.5, LAT_MAX = 29.0
      const lng = (lx / MAP_W + 0.5) * (LNG_MAX - LNG_MIN) + LNG_MIN
      const lat = (lz / MAP_H + 0.5) * (LAT_MAX - LAT_MIN) + LAT_MIN
      // 容差过滤，避免命中平面边缘外的无效拾取
      if (lng < LNG_MIN - 1 || lng > LNG_MAX + 1 || lat < LAT_MIN - 1 || lat > LAT_MAX + 1) return
      propsRef.current.onPick?.({ lat, lng, city: nearestCity(lng, lat) })
    }

    const onDown = (e: PointerEvent) => {
      isDragging = true; lastX = e.clientX; autoRotate = false; moved = false
      downX = e.clientX; downY = e.clientY; downT = Date.now()
      if (resumeTimer) clearTimeout(resumeTimer)
    }
    const onMove = (e: PointerEvent) => {
      if (!isDragging) return
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) moved = true
      rotY += (e.clientX - lastX) * 0.008; lastX = e.clientX
    }
    const onUp = (e: PointerEvent) => {
      isDragging = false
      if (resumeTimer) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => { autoRotate = true }, 2500)
      // 放大态下的"轻点"才触发交互；拖拽/长按不触发
      if (!moved && Date.now() - downT < 400) {
        const threshold = propsRef.current.zoomThreshold ?? 6.0
        if (camera.position.length() < threshold) {
          // 优先判定是否点中警情处置点（光柱球体）
          const rect = renderer.domElement.getBoundingClientRect()
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
          raycaster.setFromCamera(ndc, camera)
          const hit = raycaster.intersectObjects(markerPickTargets, false)[0]
          if (hit && hit.object.userData?.id) {
            propsRef.current.onPickAlert?.(hit.object.userData.id as string)
          } else {
            doPick(e.clientX, e.clientY)
          }
        }
      }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    const onResize = () => {
      if (!el) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // ── Wheel zoom (滚轮拉近 / 推远) ─────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      autoRotate = false
      if (resumeTimer) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => { autoRotate = true }, 2500)
      const factor = e.deltaY > 0 ? 1.1 : 0.9
      const next = camera.position.clone().multiplyScalar(factor)
      const dist = next.length()
      if (dist >= 3.2 && dist <= 13) camera.position.copy(next)
    }
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    // ── Animation loop ────────────────────────────────────────────────
    const clock = new THREE.Clock()
    let raf: number
    let zoomedInState: boolean | null = null

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // FIX: rebuild only when signature changes (was: '' → never changed)
      const sig = markersRef.current.map((m) => `${m.id}:${m.level}:${m.risk}`).join('|')
      if (sig !== prevSig) { buildScene(markersRef.current); prevSig = sig }

      // 机队遥测每 1.5s 演进一次 → 签名变化即重建信标（与实时监控共享同一 fleet 数据源）
      const fleetSig = (fleetRef.current ?? []).map((d) => `${d.id}:${Math.round(d.lng * 1e3)}:${Math.round(d.lat * 1e3)}:${d.battery}:${d.status}`).join('|')
      if (fleetSig !== prevFleetSig) { buildDrones(fleetRef.current); prevFleetSig = fleetSig }

      if (autoRotate) rotY += 0.0025
      pivot.rotation.y = rotY

      // 放大态（可拾取）状态变化时上报，供父组件显示提示
      const zNow = camera.position.length() < (propsRef.current.zoomThreshold ?? 6.0)
      if (zNow !== zoomedInState) {
        zoomedInState = zNow
        propsRef.current.onZoomLevelChange?.(zNow)
      }

      // Bounce markers
      let idx = 0
      markerGroup.children.forEach((c) => {
        if (c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry) {
          c.position.y = c.geometry.parameters.radius + 0.01 + Math.sin(t * 2 + idx * 0.9) * 0.018
          idx++
        }
      })

      // 仅在放大态显示警情标记标签：俯视时只保留发光光柱，避免几百个标签叠成"字墙"
      for (const s of markerLabels) {
        s.visible = zNow
        if (zNow) s.scale.set(0.28, 0.07, 1)
      }

      // Pulse fly lines
      flyLineGroup.children.forEach((c, i) => {
        if (c instanceof THREE.Line)
          (c.material as THREE.LineBasicMaterial).opacity = 0.20 + 0.24 * Math.sin(t * 1.6 + i)
      })

      rimLight.intensity = 0.85 + 0.35 * Math.sin(t * 1.1)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', onResize)
      if (resumeTimer) clearTimeout(resumeTimer)
      // 递归释放所有几何体、材质和纹理，防止 GPU 内存泄漏
      scene.traverse((obj) => {
        const tryDisposeTexture = (mat: THREE.Material) => {
          const m = mat as THREE.MeshBasicMaterial | THREE.SpriteMaterial
          if (m.map) m.map.dispose()
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => { m.dispose(); tryDisposeTexture(m) })
          } else {
            obj.material?.dispose()
            if (obj.material) tryDisposeTexture(obj.material)
          }
        }
        if (obj instanceof THREE.Line) {
          obj.geometry?.dispose()
          obj.material?.dispose()
        }
      })
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className={`h-full w-full ${className ?? ''}`.trim()} style={{ minHeight: 300 }} />
}
