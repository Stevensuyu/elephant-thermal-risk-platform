/**
 * @/lib/mock-local-storage/dispatchChannels.ts
 * 设备分发通道「类型定义」模块（纯前端化）。
 *
 * 原服务端持久化逻辑（fs / storage）已随后端移除；本文件仅保留
 * 客户端组件所需的通道类型与默认通道清单，供 DispatchChannelsPanel
 * 等纯前端组件做类型标注与初始数据使用。通道配置的读写现由前端
 * mock API 层（localStorage）统一接管。
 */

export type DispatchChannelKind = 'sse' | 'webhook' | 'udp'

export interface DispatchChannel {
  /** 通道 id（与 dispatchMiddleware 的 target 对应） */
  id: string
  /** 展示名（终端名） */
  name: string
  kind: DispatchChannelKind
  /** 是否启用（未启用不发送） */
  enabled: boolean
  /** webhook：目标 URL（POST JSON 警情卡片） */
  url?: string
  /** webhook：可选自定义请求头（如 Authorization: Bearer xxx） */
  headers?: Record<string, string>
  /** udp：目标主机 */
  host?: string
  /** udp：目标端口 */
  port?: number
  /** 发送超时（ms） */
  timeoutMs?: number
  /** 说明（协议 / 用途） */
  note: string
}

/** 默认分发通道清单（纯数据，作为前端展示与 mock 初始值） */
export const DEFAULT_CHANNELS: DispatchChannel[] = [
  {
    id: 'Police_Gis_Dashboard',
    name: '公安指挥大屏',
    kind: 'sse',
    enabled: true,
    note: '站内实时广播（SSE）：指挥中心大屏自动弹窗、高亮标绘警情位置。零配置，平台内立即可用。',
  },
  {
    id: 'Command_Dashboard',
    name: '指挥调度看板',
    kind: 'sse',
    enabled: true,
    note: '站内实时广播（SSE）：态势总览/历史回放/处置留痕看板同步警情。零配置，平台内立即可用。',
  },
  {
    id: 'Ranger_App_FCM',
    name: '护林员APP',
    kind: 'webhook',
    enabled: false,
    url: '',
    timeoutMs: 6000,
    note: 'HTTP Webhook：向护林员APP服务网关 POST 警情卡片（FCM/自建推送由你的APP服务端接收后下发）。',
  },
  {
    id: 'Village_GPIO_Broadcaster',
    name: '村委广播(MQTT桥)',
    kind: 'webhook',
    enabled: false,
    url: '',
    timeoutMs: 6000,
    note: 'HTTP 桥：把警情 POST 到你的广播网关（网关再转 MQTT 触发高音喇叭）。真实 MQTT 需 broker 凭证，见文档。',
  },
  {
    id: 'UAV_Autopilot_Gateway',
    name: '无人机MAVLink',
    kind: 'udp',
    enabled: false,
    host: '',
    port: 14550,
    timeoutMs: 2000,
    note: 'UDP 指令包：向 MAVLink 网关（如地面站/无人机数传）发送 JSON 指令，由网关转 MAVLink 协议。',
  },
  {
    id: 'SMS_Gateway',
    name: '短信网关',
    kind: 'webhook',
    enabled: false,
    url: '',
    timeoutMs: 6000,
    note: 'HTTP Webhook：向短信服务商网关 POST（阿里云/腾讯云短信等），由服务商下发至村干部及农户手机。',
  },
]
