// 警情类型 → 图标 emoji（与 3D 地图标记、详情卡片保持一致）
export function alertEmoji(type?: string): string {
  if (!type) return '🐘'
  if (type.includes('人象') || type.includes('冲突')) return '⚠️'
  if (type.includes('农作物') || type.includes('损毁') || type.includes('庄稼')) return '🌾'
  if (type.includes('村庄') || type.includes('闯入') || type.includes('居民')) return '🏠'
  if (type.includes('道路') || type.includes('交通')) return '🛣️'
  return '🐘'
}
