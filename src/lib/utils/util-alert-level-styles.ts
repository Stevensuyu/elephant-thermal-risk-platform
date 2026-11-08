import type { WarningLevel } from '@/lib/utils/util-app-types'

/** 预警等级 UI 样式（与态势/研判/处置各模块共享，保证视觉一致） */
export const levelStyle: Record<
  WarningLevel,
  { label: string; short: string; bg: string; text: string; bar: string; ring: string }
> = {
  RED: { label: '红色预警', short: '红', bg: 'bg-red-600', text: 'text-red-700', bar: 'bg-red-500', ring: 'ring-red-200' },
  ORANGE: { label: '橙色预警', short: '橙', bg: 'bg-orange-500', text: 'text-orange-700', bar: 'bg-orange-500', ring: 'ring-orange-200' },
  YELLOW: { label: '黄色预警', short: '黄', bg: 'bg-amber-400', text: 'text-amber-700', bar: 'bg-amber-400', ring: 'ring-amber-200' },
  BLUE: { label: '蓝色预警', short: '蓝', bg: 'bg-blue-600', text: 'text-blue-700', bar: 'bg-blue-500', ring: 'ring-blue-200' },
}

export const warningOrder: WarningLevel[] = ['RED', 'ORANGE', 'YELLOW', 'BLUE']
