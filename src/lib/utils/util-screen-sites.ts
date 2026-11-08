// ───────────────────────────────────────────────────────────────────────────
// 大屏地点分析:站点注册表(无人机机场 / OS 观察站)与警情归属计算
// 数据驱动:新增/改名站点只需改这里,面板自动跟随
// ───────────────────────────────────────────────────────────────────────────

export type SiteType = 'dock' | 'os' // dock=无人机机场, os=观察站

export interface ScreenSite {
  id: string
  name: string
  type: SiteType
  lat: number
  lng: number
}

/** 站点注册表:机场(dock)与 OS 观察站(os) */
export const SCREEN_SITES: ScreenSite[] = [
  { id: 'dock-jh', name: '景洪无人机机场', type: 'dock', lat: 22.0146, lng: 100.7938 },
  { id: 'dock-ml', name: '勐腊无人机机场', type: 'dock', lat: 21.4506, lng: 101.5943 },
  { id: 'dock-mh', name: '勐海无人机机场', type: 'dock', lat: 21.9571, lng: 100.4512 },
  { id: 'os-sy', name: '尚勇观察站 OS-01', type: 'os', lat: 21.4812, lng: 101.6308 },
  { id: 'os-yxg', name: '野象谷观察站 OS-02', type: 'os', lat: 22.1708, lng: 100.8669 },
  { id: 'os-smg', name: '思茅港观察站 OS-03', type: 'os', lat: 22.4181, lng: 100.7214 },
]

/** 球面距离(km) */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** 归属半径:超过该距离的警情不计入任何站点 */
export const SITE_RADIUS_KM = 60

/** 把警情按最近站点归组(超出半径则归属 null) */
export function nearestSite(lat: number, lng: number): ScreenSite | null {
  let best: ScreenSite | null = null
  let bestD = Infinity
  for (const s of SCREEN_SITES) {
    const d = haversineKm(lat, lng, s.lat, s.lng)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return bestD <= SITE_RADIUS_KM ? best : null
}
