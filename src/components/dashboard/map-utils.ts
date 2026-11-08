/**
 * 地图共享工具：县级行政边界数据、haversine 距离、路线插值、面积估算
 * 所有坐标约定：[lat, lng]（Leaflet 惯例）
 */

// ── 西双版纳州下辖三县（市）近似行政边界 ──────────────────────────
// 基于真实经纬度近似勾勒，用于离线底图的县级区块展示
export interface CountyBoundary {
  name: string
  center: [number, number]
  color: string
  /** 多边形顶点 [lat, lng]，闭合（首尾相同） */
  latlngs: [number, number][]
}

export const COUNTY_BOUNDARIES: CountyBoundary[] = [
  {
    name: '景洪市',
    center: [22.0, 100.79],
    color: '#22d3ee',
    latlngs: [
      [22.45, 100.55], [22.50, 100.80], [22.42, 101.05], [22.25, 101.20],
      [22.05, 101.15], [21.85, 101.00], [21.70, 100.85], [21.68, 100.60],
      [21.80, 100.42], [22.00, 100.38], [22.20, 100.45], [22.45, 100.55],
    ],
  },
  {
    name: '勐海县',
    center: [21.95, 100.45],
    color: '#a78bfa',
    latlngs: [
      [22.35, 100.10], [22.40, 100.35], [22.20, 100.45], [22.00, 100.38],
      [21.80, 100.42], [21.68, 100.60], [21.55, 100.50], [21.50, 100.25],
      [21.60, 100.00], [21.75, 99.85], [21.95, 99.80], [22.15, 99.90],
      [22.35, 100.10],
    ],
  },
  {
    name: '勐腊县',
    center: [21.45, 101.55],
    color: '#34d399',
    latlngs: [
      [22.00, 101.20], [22.10, 101.50], [22.00, 101.80], [21.80, 102.00],
      [21.55, 101.95], [21.30, 101.85], [21.10, 101.65], [21.00, 101.40],
      [21.05, 101.15], [21.25, 101.00], [21.50, 101.00], [21.70, 101.05],
      [21.85, 101.00], [22.00, 101.20],
    ],
  },
]

// ── Haversine 距离（米） ─────────────────────────────────────────
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 折线总长度（米） */
export function polylineLengthMeters(points: [number, number][]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i])
  }
  return total
}

// ── 圆形面积（平方公里） ─────────────────────────────────────────
export function circleAreaKm2(radiusMeters: number): number {
  const r = radiusMeters / 1000
  return Math.PI * r * r
}

// ── 路线插值：在起点终点之间生成自然弯曲的模拟路线 ──────────────
/**
 * 基于经纬度线性插值 + 正弦扰动生成看起来自然的途经点
 * @param from 起点 [lat, lng]
 * @param to 终点 [lat, lng]
 * @param waypointCount 途经点数量（不含起终点）
 */
export function interpolateRoute(
  from: [number, number],
  to: [number, number],
  waypointCount = 3,
): [number, number][] {
  const points: [number, number][] = [from]
  const dLat = to[0] - from[0]
  const dLng = to[1] - from[1]
  // 垂直方向扰动幅度（使路线不那么笔直）
  const perpLat = -dLng * 0.06
  const perpLng = dLat * 0.06

  for (let i = 1; i <= waypointCount; i++) {
    const t = i / (waypointCount + 1)
    const wobble = Math.sin(t * Math.PI) * 0.5
    points.push([
      from[0] + dLat * t + perpLat * wobble,
      from[1] + dLng * t + perpLng * wobble,
    ])
  }
  points.push(to)
  return points
}

// ── 绘制形状类型 ─────────────────────────────────────────────────
export interface DrawnShape {
  type: 'polygon' | 'circle'
  latlngs?: [number, number][]
  center?: [number, number]
  radius?: number
  id?: string
}

export interface DrawResult {
  type: 'polygon' | 'circle'
  latlngs?: [number, number][]
  center?: [number, number]
  radius?: number
}
