'use client'

import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { geoMercator } from 'd3-geo'
import yunnanGeoData from '@/assets/yunnan-geojson.json'

// ────────────────────────────────────────────────────────────
// 类型定义（与现有 RealMap 兼容）
// ────────────────────────────────────────────────────────────

export type MapMode = 'flat' | 'extruded' | 'historical'

export interface ScDatavMapMarker {
  id: string
  name: string
  lng: number
  lat: number
  level: 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'
  risk?: number
  simulated?: boolean
  time?: string
  location?: string
  detectionCount?: number
  alertType?: string
  description?: string
  status?: string
}

export interface ScDatavMapDrone {
  id: string
  name: string
  lng: number
  lat: number
  status: string
  battery: number
  altitude: number
}

interface ScDatavMapProps {
  markers: ScDatavMapMarker[]
  drones?: ScDatavMapDrone[]
  center?: [number, number]
  zoom?: number
  onMarkerClick?: (marker: ScDatavMapMarker) => void
  onMapClick?: (lat: number, lng: number, label?: string) => void
  className?: string
}

// ────────────────────────────────────────────────────────────
// 常量
// ────────────────────────────────────────────────────────────

// 地图组在世界坐标中的 X 偏移（与相机 target、OrbitControls target 一致）
const MAP_X_OFFSET = 10

const LEVEL_COLOR: Record<string, string> = {
  RED: '#ef4444',
  ORANGE: '#fb923c',
  YELLOW: '#facc15',
  BLUE: '#22d3ee',
}

const LEVEL_EMISSIVE: Record<string, string> = {
  RED: '#7f1d1d',
  ORANGE: '#7c2d12',
  YELLOW: '#713f12',
  BLUE: '#164e63',
}

const DRONE_STATUS_COLOR: Record<string, string> = {
  飞行中: '#22c55e',
  巡航: '#22c55e',
  返航: '#f59e0b',
  充电中: '#a855f7',
  待命: '#64748b',
  离线: '#475569',
  故障: '#ef4444',
}

// GeoJSON 类型
interface GeoFeature {
  type: 'Feature'
  properties: {
    adcode: number
    name: string
    center: [number, number]
    centroid: [number, number]
    childrenNum: number
    level: string
    parent: { adcode: number }
    subFeatureIndex: number
    acroutes: number[]
  }
  geometry: {
    type: 'MultiPolygon'
    coordinates: number[][][][]
  }
}

interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

// ────────────────────────────────────────────────────────────
// 投影工具
// ────────────────────────────────────────────────────────────

function createProjection(
  geoData: GeoFeatureCollection,
  center?: [number, number],
  zoom: number = 8,
) {
  let centerLng: number
  let centerLat: number

  // 优先使用传入的 center（[lng, lat] 顺序，与 d3-geo 一致）
  if (center && center.length === 2 && typeof center[0] === 'number' && typeof center[1] === 'number') {
    centerLng = center[0]
    centerLat = center[1]
  } else {
    // 回退：从 GeoJSON 各州市质心计算全省平均中心
    const centroids = geoData.features.map((f) => f.properties.centroid)
    centerLng = centroids.reduce((s, c) => s + c[0], 0) / centroids.length
    centerLat = centroids.reduce((s, c) => s + c[1], 0) / centroids.length
  }

  // 由 zoom 推导 scale：zoom=8 时基准 1200，每提升 2 级放大一倍
  const scale = 1200 * Math.pow(2, (zoom - 8) / 2)

  return geoMercator()
    .center([centerLng, centerLat])
    .scale(scale)
    .translate([0, 0])
}

/** 将经纬度投影为 3D 世界坐标 (x, 0, z) */
function projectToWorld(
  lng: number,
  lat: number,
  projection: ReturnType<typeof geoMercator>,
): [number, number, number] {
  const [px, py] = projection([lng, lat])!
  // 旋转 -PI/2 后：group (px, -py, 0) -> world (px, 0, py)
  return [px, 0, py]
}

/** 将 3D 世界坐标反投影为经纬度 */
function invertFromWorld(
  x: number,
  z: number,
  projection: ReturnType<typeof geoMercator>,
): [number, number] {
  // world (x, 0, z) -> d3 projected (x, z) -> invert
  // geoMercator 始终支持 invert，类型声明为可选故此处断言
  const invert = projection.invert as ((point: [number, number]) => [number, number] | undefined) | undefined
  return invert ? (invert([x, z]) ?? [101.5, 24.5]) : [101.5, 24.5]
}

// ────────────────────────────────────────────────────────────
// 单个州市区域（3D 挤出 + 发光边框，按 mapMode 切换配色）
// ────────────────────────────────────────────────────────────

interface RegionProps {
  feature: GeoFeature
  projection: ReturnType<typeof geoMercator>
  depth: number
  sidesOpacity?: number
  onRegionClick?: (name: string) => void
  mapMode: MapMode
}

function MapRegion({ feature, projection, depth, sidesOpacity = 1, onRegionClick, mapMode }: RegionProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const [hovered, setHovered] = useState(false)

  const isHistorical = mapMode === 'historical'
  const topColor = hovered
    ? (isHistorical ? '#e8d5b7' : '#e2e8f0')
    : (isHistorical ? '#f5e6d3' : '#f1f5f9')
  const topEmissive = hovered
    ? (isHistorical ? '#fcd34d' : '#bfdbfe')
    : (isHistorical ? '#fde68a' : '#eff6ff')
  const sideColor = isHistorical ? '#d4b896' : '#cbd5e1'
  const sideEmissive = isHistorical ? '#d97706' : '#93c5fd'
  const borderColor = hovered
    ? (isHistorical ? '#b45309' : '#3b82f6')
    : (isHistorical ? '#92400e' : '#60a5fa')
  const labelColor = hovered
    ? (isHistorical ? '#7c2d12' : '#1e40af')
    : (isHistorical ? '#78350f' : '#475569')
  const labelShadow = isHistorical
    ? '0 0 6px rgba(255, 248, 235, 0.9)'
    : '0 0 6px rgba(255, 255, 255, 0.9)'

  const { shapes, shapeGeometry, centroidWorld } = useMemo(() => {
    const shapes: THREE.Shape[] = []

    feature.geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        const points: THREE.Vector2[] = ring.map((coord) => {
          const [px, py] = projection(coord as [number, number])!
          return new THREE.Vector2(px, -py)
        })
        if (points.length >= 3) {
          shapes.push(new THREE.Shape(points))
        }
      })
    })

    const shapeGeometry = new THREE.ShapeGeometry(shapes)

    // 州市中心的世界坐标
    const [cx, cy] = projection(feature.properties.centroid)!
    const centroidWorld: [number, number, number] = [cx, 0, cy]

    return { shapes, shapeGeometry, centroidWorld }
  }, [feature, projection])

  return (
    <group ref={groupRef}>
      {/* 顶面 */}
      <mesh
        geometry={shapeGeometry}
        position-z={depth + 0.05}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          onRegionClick?.(feature.properties.name)
        }}
      >
        <meshStandardMaterial
          color={topColor}
          transparent
          opacity={0.9}
          metalness={0.3}
          roughness={0.7}
          emissive={topEmissive}
          emissiveIntensity={hovered ? 0.4 : 0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 挤出侧面 */}
      <mesh visible={sidesOpacity > 0.01}>
        <extrudeGeometry
          args={[shapes, { depth, steps: 1, bevelEnabled: false }]}
        />
        <meshStandardMaterial
          color={sideColor}
          transparent
          opacity={0.95 * sidesOpacity}
          metalness={0.4}
          roughness={0.6}
          emissive={sideEmissive}
          emissiveIntensity={0.2 * sidesOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 发光边框线 */}
      <lineSegments position-z={depth + 0.1} raycast={() => null}>
        <edgesGeometry args={[shapeGeometry]} />
        <lineBasicMaterial
          color={borderColor}
          transparent
          opacity={hovered ? 1 : 0.7}
        />
      </lineSegments>

      {/* 州市名称标签 —— 位于旋转组内，需用 (cx, -cy, depth+2) 才能在旋转后落到世界 (cx, depth+2, cy) */}
      <Html
        position={[centroidWorld[0], -centroidWorld[2], depth + 2]}
        center
        style={{
          pointerEvents: 'none',
          color: labelColor,
          fontSize: '11px',
          fontWeight: 600,
          textShadow: labelShadow,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          zIndex: 5,
        }}
      >
        {feature.properties.name}
      </Html>
    </group>
  )
}

// ────────────────────────────────────────────────────────────
// 警情标记（3D 发光柱 + 脉冲环）
// ────────────────────────────────────────────────────────────

interface AlertMarkerProps {
  marker: ScDatavMapMarker
  projection: ReturnType<typeof geoMercator>
  depth: number
  onClick: (marker: ScDatavMapMarker) => void
  mapMode: MapMode
}

function AlertMarker({ marker, projection, depth, onClick, mapMode }: AlertMarkerProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  const pillarRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  const color = LEVEL_COLOR[marker.level] ?? '#22d3ee'
  const emissive = LEVEL_EMISSIVE[marker.level] ?? '#164e63'
  const labelBg = mapMode === 'historical' ? 'rgba(255, 250, 240, 0.88)' : 'rgba(255, 255, 255, 0.88)'

  const worldPos = useMemo(() => {
    return projectToWorld(marker.lng, marker.lat, projection)
  }, [marker.lng, marker.lat, projection])

  // 柱高根据风险值
  const pillarHeight = useMemo(() => {
    const base = 3
    const riskBonus = marker.risk ? (marker.risk / 100) * 5 : 2
    return base + riskBonus
  }, [marker.risk])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // 脉冲环动画
    if (ringRef.current) {
      const scale = 1 + Math.sin(t * 2 + worldPos[0]) * 0.3
      ringRef.current.scale.set(scale, scale, 1)
      const mat = ringRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.4 + Math.sin(t * 2 + worldPos[0]) * 0.2
    }
    // 柱子呼吸光
    if (pillarRef.current) {
      const mat = pillarRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3
    }
  })

  return (
    <group
      ref={groupRef}
      position={[worldPos[0], depth, worldPos[2]]}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(marker)
      }}
    >
      {/* 地面脉冲环 */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position-y={0.1}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* 发光柱 */}
      <mesh ref={pillarRef} position-y={pillarHeight / 2}>
        <cylinderGeometry args={[0.25, 0.35, pillarHeight, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.8}
          transparent
          opacity={0.85}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* 顶部发光球 */}
      <mesh position-y={pillarHeight + 0.3}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 2 : 1.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 顶部点光源 */}
      <pointLight position-y={pillarHeight + 0.5} color={color} intensity={hovered ? 3 : 1.5} distance={8} />

      {/* 警情名称标签 */}
      <Html
        position={[0, pillarHeight + 1.5, 0]}
        center
        style={{
          pointerEvents: 'none',
          color: color,
          fontSize: '10px',
          fontWeight: 700,
          textShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          backgroundColor: labelBg,
          padding: '2px 6px',
          borderRadius: '4px',
          border: `1px solid ${color}40`,
          zIndex: 5,
        }}
      >
        {marker.name}
        {marker.simulated && <span style={{ opacity: 0.6, marginLeft: 4 }}>[模拟]</span>}
      </Html>
    </group>
  )
}

// ────────────────────────────────────────────────────────────
// 无人机标记（八面体 + 高度线 + 旋转动画）
// ────────────────────────────────────────────────────────────

interface DroneMarkerProps {
  drone: ScDatavMapDrone
  projection: ReturnType<typeof geoMercator>
  depth: number
  mapMode: MapMode
}

function DroneMarker({ drone, projection, depth, mapMode }: DroneMarkerProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const diamondRef = useRef<THREE.Mesh>(null!)

  const statusColor = DRONE_STATUS_COLOR[drone.status] ?? '#64748b'
  const isActive = drone.status === '飞行中' || drone.status === '巡航' || drone.status === '返航'
  const labelBg = mapMode === 'historical' ? 'rgba(255, 250, 240, 0.9)' : 'rgba(255, 255, 255, 0.9)'

  const worldPos = useMemo(() => {
    return projectToWorld(drone.lng, drone.lat, projection)
  }, [drone.lng, drone.lat, projection])

  // 飞行高度（缩放后）
  const flightHeight = useMemo(() => {
    return Math.min(depth + 2 + (drone.altitude / 100), depth + 12)
  }, [drone.altitude, depth])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (diamondRef.current && isActive) {
      diamondRef.current.rotation.y = t * 2
      diamondRef.current.position.y = flightHeight + Math.sin(t * 3) * 0.3
    }
  })

  return (
    <group ref={groupRef} position={[worldPos[0], 0, worldPos[2]]}>
      {/* 地面标记点 */}
      <mesh position-y={depth + 0.15} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.5, 16]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* 高度连接线 */}
      <mesh position-y={(depth + flightHeight) / 2}>
        <cylinderGeometry args={[0.03, 0.03, flightHeight - depth, 6]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.4} />
      </mesh>

      {/* 无人机八面体 */}
      <mesh ref={diamondRef} position-y={flightHeight}>
        <octahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={isActive ? 1 : 0.4}
          transparent
          opacity={0.9}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* 无人机光源 */}
      {isActive && (
        <pointLight position-y={flightHeight} color={statusColor} intensity={1} distance={5} />
      )}

      {/* 无人机名称标签 */}
      <Html
        position={[0, flightHeight + 1.2, 0]}
        center
        style={{
          pointerEvents: 'none',
          color: statusColor,
          fontSize: '9px',
          fontWeight: 600,
          textShadow: `0 0 4px ${statusColor}`,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          backgroundColor: labelBg,
          padding: '1px 5px',
          borderRadius: '3px',
          border: `1px solid ${statusColor}40`,
          zIndex: 5,
        }}
      >
        {drone.name} · {Math.round(drone.battery)}%
      </Html>
    </group>
  )
}

// ────────────────────────────────────────────────────────────
// 地图点击平面（不可见，用于捕获空白区域点击）
// ────────────────────────────────────────────────────────────

interface ClickPlaneProps {
  projection: ReturnType<typeof geoMercator>
  depth: number
  onMapClick: (lat: number, lng: number, label?: string) => void
}

function ClickPlane({ projection, depth, onMapClick }: ClickPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!)

  return (
    <mesh
      ref={meshRef}
      position-y={depth + 0.01}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        const point = e.point
        // 点击平面位于 position-x={MAP_X_OFFSET} 的组内，需扣除 X 偏移得到投影坐标
        const [lng, lat] = invertFromWorld(point.x - MAP_X_OFFSET, point.z, projection)
        onMapClick(lat, lng)
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ────────────────────────────────────────────────────────────
// 场景内容（地图 + 标记 + 灯光）
// ────────────────────────────────────────────────────────────

interface SceneContentProps {
  markers: ScDatavMapMarker[]
  drones: ScDatavMapDrone[]
  projection: ReturnType<typeof geoMercator>
  geoData: GeoFeatureCollection
  mapMode: MapMode
  onMarkerClick: (marker: ScDatavMapMarker) => void
  onMapClick: (lat: number, lng: number, label?: string) => void
  onRegionClick: (name: string) => void
}

function SceneContent({
  markers,
  drones,
  projection,
  geoData,
  mapMode,
  onMarkerClick,
  onMapClick,
  onRegionClick,
}: SceneContentProps) {
  const EXTRUDED_DEPTH = 4
  const FLAT_DEPTH = 0.1
  const [animatedDepth, setAnimatedDepth] = useState(mapMode === 'extruded' ? EXTRUDED_DEPTH : FLAT_DEPTH)
  const [sidesOpacity, setSidesOpacity] = useState(mapMode === 'extruded' ? 1 : 0)

  const isHistorical = mapMode === 'historical'

  // 平滑过渡动画：深度和侧面不透明度
  useFrame((_, delta) => {
    const targetDepth = mapMode === 'extruded' || mapMode === 'historical' ? EXTRUDED_DEPTH : FLAT_DEPTH
    const targetSides = mapMode === 'extruded' || mapMode === 'historical' ? 1 : 0
    const lerpFactor = Math.min(delta * 4, 1)
    setAnimatedDepth((prev) => prev + (targetDepth - prev) * lerpFactor)
    setSidesOpacity((prev) => prev + (targetSides - prev) * lerpFactor)
  })

  const DEPTH = animatedDepth

  return (
    <>
      {/* 灯光 —— 浅色主题下使用白光，历史模式使用暖光 */}
      <ambientLight intensity={isHistorical ? 0.7 : 0.6} color="#ffffff" />
      <directionalLight position={[50, 100, 50]} intensity={0.7} color="#ffffff" />
      <pointLight position={[0, 50, 0]} intensity={0.6} color={isHistorical ? '#fbbf24' : '#60a5fa'} distance={200} />
      <pointLight position={[-80, 30, -60]} intensity={0.3} color={isHistorical ? '#f59e0b' : '#93c5fd'} distance={150} />

      {/* 地图组（旋转 -PI/2 平铺） */}
      <group rotation={[-Math.PI / 2, 0, 0]} position-x={MAP_X_OFFSET}>
        {geoData.features.map((feature) => (
          <MapRegion
            key={feature.properties.adcode}
            feature={feature}
            projection={projection}
            depth={DEPTH}
            sidesOpacity={sidesOpacity}
            onRegionClick={onRegionClick}
            mapMode={mapMode}
          />
        ))}
      </group>

      {/* 点击平面（在旋转组外，世界坐标对齐） */}
      <group position-x={MAP_X_OFFSET}>
        <ClickPlane projection={projection} depth={DEPTH} onMapClick={onMapClick} />
      </group>

      {/* 警情标记（在旋转组外，使用世界坐标） */}
      <group position-x={MAP_X_OFFSET}>
        {markers.map((marker) => (
          <AlertMarker
            key={marker.id}
            marker={marker}
            projection={projection}
            depth={DEPTH}
            onClick={onMarkerClick}
            mapMode={mapMode}
          />
        ))}
      </group>

      {/* 无人机标记 */}
      <group position-x={MAP_X_OFFSET}>
        {drones.map((drone) => (
          <DroneMarker
            key={drone.id}
            drone={drone}
            projection={projection}
            depth={DEPTH}
            mapMode={mapMode}
          />
        ))}
      </group>

      {/* 底部反射平面 —— 浅色主题 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position-y={-0.5} position-x={MAP_X_OFFSET}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial
          color={isHistorical ? '#e0c9a8' : '#e2e8f0'}
          transparent
          opacity={0.6}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
    </>
  )
}

// ────────────────────────────────────────────────────────────
// 相机入场动画
// ────────────────────────────────────────────────────────────

function CameraRig() {
  const { camera } = useThree()
  const initialized = useRef(false)

  useFrame((state) => {
    if (initialized.current) return
    const t = Math.min(state.clock.elapsedTime / 2, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    camera.position.set(
      THREE.MathUtils.lerp(-100, 40, eased),
      THREE.MathUtils.lerp(200, 100, eased),
      THREE.MathUtils.lerp(300, 140, eased),
    )
    camera.lookAt(MAP_X_OFFSET, 0, 0)
    if (t >= 1) initialized.current = true
  })

  return null
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

export default function ScDatavMap({
  markers,
  drones = [],
  center = [101.4, 23.6],
  zoom = 8,
  onMarkerClick,
  onMapClick,
  className,
}: ScDatavMapProps) {
  const geoData = yunnanGeoData as unknown as GeoFeatureCollection
  const [mapMode, setMapMode] = useState<MapMode>('extruded')

  const isHistorical = mapMode === 'historical'

  const projection = useMemo(() => createProjection(geoData, center, zoom), [geoData, center, zoom])

  const handleRegionClick = (name: string) => {
    // 点击州市时，找到该州市的中心坐标回调
    const feature = geoData.features.find((f) => f.properties.name === name)
    if (feature && onMapClick) {
      const [lng, lat] = feature.properties.centroid
      onMapClick(lat, lng, name)
    }
  }

  // 浅色主题配色变量
  const containerBg = isHistorical
    ? 'radial-gradient(ellipse at center, #f5e6d3 0%, #e8d5b7 100%)'
    : 'radial-gradient(ellipse at center, #f8fafc 0%, #e2e8f0 100%)'
  const borderColor = isHistorical ? 'rgba(139, 90, 43, 0.35)' : 'rgba(59, 130, 246, 0.25)'
  const borderShadow = isHistorical
    ? 'inset 0 0 20px rgba(139, 90, 43, 0.08)'
    : 'inset 0 0 20px rgba(59, 130, 246, 0.06)'
  const overlayBg = isHistorical ? 'rgba(255, 250, 240, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const overlayBorder = isHistorical ? 'rgba(139, 90, 43, 0.35)' : 'rgba(59, 130, 246, 0.3)'
  const overlayText = isHistorical ? '#92400e' : '#64748b'
  const activeBg = isHistorical ? 'rgba(139, 90, 43, 0.2)' : 'rgba(59, 130, 246, 0.18)'
  const activeText = isHistorical ? '#7c2d12' : '#1e40af'
  const dividerColor = isHistorical ? 'rgba(139,90,43,0.2)' : 'rgba(59,130,246,0.15)'
  const legendBg = isHistorical ? 'rgba(255, 250, 240, 0.92)' : 'rgba(255, 255, 255, 0.92)'
  const legendBorder = isHistorical ? 'rgba(139, 90, 43, 0.3)' : 'rgba(59, 130, 246, 0.25)'
  const legendText = isHistorical ? '#78350f' : '#475569'
  const legendTitle = isHistorical ? '#92400e' : '#1e40af'
  const canvasBg = isHistorical ? '#f0e0c8' : '#f1f5f9'

  const modeButtons: { key: MapMode; label: string }[] = [
    { key: 'flat', label: '平面地图' },
    { key: 'extruded', label: '立体地图' },
    { key: 'historical', label: '历史地图' },
  ]

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: containerBg,
        borderRadius: '8px',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {/* 发光边框 —— 浅色主题 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `1px solid ${borderColor}`,
          borderRadius: '8px',
          pointerEvents: 'none',
          zIndex: 10,
          boxShadow: borderShadow,
        }}
      />

      {/* 平面/立体/历史模式切换 —— 三按钮 */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 20,
          display: 'flex',
          gap: 0,
          backgroundColor: overlayBg,
          border: `1px solid ${overlayBorder}`,
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        {modeButtons.map((m, i) => (
          <button
            key={m.key}
            onClick={() => setMapMode(m.key)}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: mapMode === m.key ? activeBg : 'transparent',
              color: mapMode === m.key ? activeText : overlayText,
              borderLeft: i > 0 ? `1px solid ${dividerColor}` : 'none',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 图例 —— 浅色主题 */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 20,
          backgroundColor: legendBg,
          border: `1px solid ${legendBorder}`,
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '11px',
          color: legendText,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 600, color: legendTitle, marginBottom: 4 }}>图例</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
          红色预警
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c', boxShadow: '0 0 6px #fb923c' }} />
          橙色预警
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 6px #facc15' }} />
          黄色预警
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }} />
          蓝色预警
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${dividerColor}` }}>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #22c55e' }} />
          无人机（飞行中）
        </div>
      </div>

      {/* 操作提示 —— 浅色主题 */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 20,
          backgroundColor: isHistorical ? 'rgba(255, 250, 240, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          border: `1px solid ${isHistorical ? 'rgba(139, 90, 43, 0.25)' : 'rgba(59, 130, 246, 0.2)'}`,
          borderRadius: '6px',
          padding: '6px 10px',
          fontSize: '10px',
          color: isHistorical ? '#92400e' : '#64748b',
          pointerEvents: 'none',
        }}
      >
        左键旋转 · 滚轮缩放 · 右键平移
      </div>

      <Canvas
        camera={{ position: [-100, 200, 300], fov: 45, far: 2000, near: 1 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={[canvasBg]} />
        <fog attach="fog" args={[canvasBg, 200, 500]} />

        <CameraRig />

        <SceneContent
          markers={markers}
          drones={drones}
          projection={projection}
          geoData={geoData}
          mapMode={mapMode}
          onMarkerClick={onMarkerClick ?? (() => {})}
          onMapClick={onMapClick ?? (() => {})}
          onRegionClick={handleRegionClick}
        />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.5}
          panSpeed={0.5}
          rotateSpeed={0.5}
          minDistance={50}
          maxDistance={400}
          maxPolarAngle={Math.PI / 2.1}
          target={[MAP_X_OFFSET, 0, 0]}
        />
      </Canvas>
    </div>
  )
}
