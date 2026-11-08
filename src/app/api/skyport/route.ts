import { NextRequest, NextResponse } from 'next/server'
import {
  getSkyportServerConfig,
  saveSkyportServerConfig,
  isSkyportConfigured,
  type SkyportConfig,
} from '@/lib/store/store-skyport-config'

/**
 * 大疆司空 2 OpenAPI 连接器
 *
 * 官方文档：https://fh2-api.apifox.cn/
 * API 基础 URL（公有云）：https://es-flight-api-cn.djigate.com
 * 认证方式：X-User-Token header
 *
 * POST /api/skyport
 *  - action: 'save'        → 保存配置
 *  - action: 'connect'     → 连接司空平台，拉取设备列表
 *  - action: 'device-state'→ 获取设备物模型信息（位置、热成像状态等）
 *  - action: 'live-start'  → 开启直播推流，返回拉流地址
 *  - action: 'live-stop'   → 停止直播
 *  - action: 'converter-create' → 创建旁路推流转发器
 *  - action: 'converter-start'  → 开启旁路推流转发器
 *  - action: 'converter-stop'   → 停止旁路推流转发器
 *  - action: 'status'      → 返回当前配置状态
 *
 * 注意：
 *  - 实时位置遥测通过 MQTT 推送（thing/product/{sn}/osd），需在司空2配置云端互联
 *  - 视频流支持 RTMP/RTSP/GB28181/WebRTC 协议
 */

interface SkyportDevice {
  sn: string
  name: string
  model: string
  status: string
  online?: boolean
}

interface DeviceState {
  sn: string
  latitude?: number
  longitude?: number
  altitude?: number
  speed?: number
  gimbalPitch?: number
  gimbalYaw?: number
  irMeteringMode?: string
  irMeteringPoint?: { x: number; y: number }
  irMeteringArea?: { x: number; y: number; width: number; height: number }
  batteryLevel?: number
  flightTime?: number
  raw?: any
}

interface ConnectResult {
  ok: boolean
  mode: 'real' | 'sim'
  devices: SkyportDevice[]
  error?: string
  message: string
}

function buildHeaders(cfg: SkyportConfig): Record<string, string> {
  return {
    'X-User-Token': cfg.userToken,
    'Content-Type': 'application/json',
    'X-Language': 'zh',
  }
}

function apiBase(cfg: SkyportConfig): string {
  return cfg.baseUrl.replace(/\/$/, '')
}

/**
 * 获取组织/项目下的设备列表
 * 官方接口可能因版本而异，这里尝试多种路径
 */
async function fetchDeviceList(cfg: SkyportConfig): Promise<SkyportDevice[]> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)

  // 尝试多种设备列表接口路径
  const candidateUrls = [
    `${base}/openapi/v0.1/manage/api/v1/workspaces/${encodeURIComponent(cfg.workspaceId)}/devices`,
    `${base}/openapi/v0.1/workspaces/${encodeURIComponent(cfg.workspaceId)}/devices`,
    `${base}/openapi/v0.1/devices?workspace_id=${encodeURIComponent(cfg.workspaceId)}`,
  ]

  let lastError: any = null
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { method: 'GET', headers })
      if (res.ok) {
        const data = await res.json()
        const list = data?.data?.list || data?.data || data?.devices || data?.list || []
        if (Array.isArray(list) && list.length > 0) {
          return list.map((d: any) => ({
            sn: d.sn || d.device_sn || d.id || '',
            name: d.name || d.device_name || d.nickname || d.sn || '未知设备',
            model: d.model || d.device_model || d.product_type || d.device_model_key || 'Unknown',
            status: d.status || d.online_status || (d.online ? 'online' : 'offline'),
            online: d.online ?? d.status === 'online',
          }))
        }
      } else {
        lastError = `HTTP ${res.status}: ${await res.text().catch(() => '')}`
      }
    } catch (e) {
      lastError = e
    }
  }

  if (lastError) {
    throw new Error(`获取设备列表失败：${lastError?.message || lastError}`)
  }
  return []
}

/**
 * 获取设备物模型信息（位置、热成像状态等）
 * 官方接口：GET /openapi/v0.1/device/{device_sn}/state
 */
async function fetchDeviceState(cfg: SkyportConfig, deviceSn: string): Promise<DeviceState> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/device/${encodeURIComponent(deviceSn)}/state`

  const res = await fetch(url, { method: 'GET', headers })
  if (!res.ok) {
    throw new Error(`获取设备物模型失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }

  const data = await res.json()
  const state = data?.data || data

  // 解析物模型字段（不同设备型号字段名可能不同）
  const result: DeviceState = {
    sn: deviceSn,
    raw: state,
  }

  // 位置信息
  if (state.latitude !== undefined) result.latitude = state.latitude
  else if (state.lat !== undefined) result.latitude = state.lat
  else if (state.gps?.latitude !== undefined) result.latitude = state.gps.latitude

  if (state.longitude !== undefined) result.longitude = state.longitude
  else if (state.lng !== undefined) result.longitude = state.lng
  else if (state.gps?.longitude !== undefined) result.longitude = state.gps.longitude

  if (state.altitude !== undefined) result.altitude = state.altitude
  else if (state.height !== undefined) result.altitude = state.height

  if (state.speed !== undefined) result.speed = state.speed
  else if (state.flight_speed !== undefined) result.speed = state.flight_speed

  // 云台角度
  if (state.gimbal_pitch !== undefined) result.gimbalPitch = state.gimbal_pitch
  if (state.gimbal_yaw !== undefined) result.gimbalYaw = state.gimbal_yaw

  // 热成像相关
  if (state.ir_metering_mode !== undefined) result.irMeteringMode = state.ir_metering_mode
  if (state.ir_metering_point !== undefined) result.irMeteringPoint = state.ir_metering_point
  if (state.ir_metering_area !== undefined) result.irMeteringArea = state.ir_metering_area

  // 电池
  if (state.battery_level !== undefined) result.batteryLevel = state.battery_level
  else if (state.battery?.capacity_percent !== undefined) result.batteryLevel = state.battery.capacity_percent

  // 飞行时间
  if (state.flight_time !== undefined) result.flightTime = state.flight_time

  return result
}

/**
 * 开启直播推流
 * 官方接口：POST /openapi/v0.1/live-stream/start
 */
async function startLiveStream(cfg: SkyportConfig, deviceSn: string, cameraIndex: number = 0): Promise<{ playUrl: string; streamId?: string }> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/live-stream/start`

  const body = {
    device_sn: deviceSn,
    camera_index: cameraIndex,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`开启直播失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }

  const data = await res.json()
  return {
    playUrl: data?.data?.play_url || data?.data?.url || data?.play_url || '',
    streamId: data?.data?.stream_id || data?.stream_id,
  }
}

/**
 * 停止直播
 * 官方接口：POST /openapi/v0.1/live-stream/stop
 */
async function stopLiveStream(cfg: SkyportConfig, deviceSn: string): Promise<void> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/live-stream/stop`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ device_sn: deviceSn }),
  })

  if (!res.ok) {
    throw new Error(`停止直播失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }
}

/**
 * 创建旁路推流转发器
 * 官方接口：POST /openapi/v0.1/live-stream/converter
 */
async function createConverter(cfg: SkyportConfig, deviceSn: string, rtmpUrl: string): Promise<{ converterId: string }> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/live-stream/converter`

  const body = {
    device_sn: deviceSn,
    url_type: 1, // RTMP
    url: rtmpUrl,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`创建转发器失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }

  const data = await res.json()
  return {
    converterId: data?.data?.converter_id || data?.data?.uuid || data?.converter_id || '',
  }
}

/**
 * 开启旁路推流转发器
 * 官方接口：POST /openapi/v0.1/live-stream/converter/{converter_id}
 */
async function startConverter(cfg: SkyportConfig, converterId: string): Promise<void> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/live-stream/converter/${encodeURIComponent(converterId)}`

  const res = await fetch(url, { method: 'POST', headers })
  if (!res.ok) {
    throw new Error(`开启转发器失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }
}

/**
 * 停止旁路推流转发器
 * 官方接口：DELETE /openapi/v0.1/live-stream/converter/{uuid}
 */
async function stopConverter(cfg: SkyportConfig, converterId: string): Promise<void> {
  const headers = buildHeaders(cfg)
  const base = apiBase(cfg)
  const url = `${base}/openapi/v0.1/live-stream/converter/${encodeURIComponent(converterId)}`

  const res = await fetch(url, { method: 'DELETE', headers })
  if (!res.ok) {
    throw new Error(`停止转发器失败 (${res.status}): ${await res.text().catch(() => '')}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, patch, deviceSn, cameraIndex, rtmpUrl, converterId } = body

    if (action === 'save') {
      const config = saveSkyportServerConfig(patch || {})
      const { userToken, mqttPassword, ...safeConfig } = config
      return NextResponse.json({ success: true, config: safeConfig })
    }

    if (action === 'status') {
      const config = getSkyportServerConfig()
      const { userToken, mqttPassword, ...safeConfig } = config
      return NextResponse.json({
        success: true,
        config: safeConfig,
        configured: isSkyportConfigured(config),
      })
    }

    const cfg = getSkyportServerConfig()

    if (!isSkyportConfigured(cfg)) {
      return NextResponse.json({
        ok: false,
        error: 'not_configured',
        message: '司空平台未配置完整，请先填写 baseUrl / userToken / workspaceId 并启用。',
      })
    }

    switch (action) {
      case 'connect': {
        try {
          const devices = await fetchDeviceList(cfg)
          return NextResponse.json({
            ok: true,
            mode: 'real',
            devices,
            message: `成功连接司空平台，获取 ${devices.length} 台设备。`,
          } as ConnectResult)
        } catch (e: any) {
          return NextResponse.json({
            ok: false,
            mode: 'sim',
            devices: [],
            error: e?.message || String(e),
            message: `连接司空平台失败：${e?.message || String(e)}`,
          } as ConnectResult)
        }
      }

      case 'device-state': {
        try {
          if (!deviceSn) throw new Error('缺少 deviceSn 参数')
          const state = await fetchDeviceState(cfg, deviceSn)
          return NextResponse.json({ success: true, state })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      case 'live-start': {
        try {
          if (!deviceSn) throw new Error('缺少 deviceSn 参数')
          const result = await startLiveStream(cfg, deviceSn, cameraIndex || 0)
          return NextResponse.json({ success: true, ...result })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      case 'live-stop': {
        try {
          if (!deviceSn) throw new Error('缺少 deviceSn 参数')
          await stopLiveStream(cfg, deviceSn)
          return NextResponse.json({ success: true, message: '直播已停止' })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      case 'converter-create': {
        try {
          if (!deviceSn) throw new Error('缺少 deviceSn 参数')
          const targetUrl = rtmpUrl || cfg.rtmpServerUrl
          if (!targetUrl) throw new Error('缺少 RTMP 服务器地址，请在配置中设置 rtmpServerUrl')
          const result = await createConverter(cfg, deviceSn, targetUrl)
          return NextResponse.json({ success: true, ...result })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      case 'converter-start': {
        try {
          if (!converterId) throw new Error('缺少 converterId 参数')
          await startConverter(cfg, converterId)
          return NextResponse.json({ success: true, message: '旁路推流已开启' })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      case 'converter-stop': {
        try {
          if (!converterId) throw new Error('缺少 converterId 参数')
          await stopConverter(cfg, converterId)
          return NextResponse.json({ success: true, message: '旁路推流已停止' })
        } catch (e: any) {
          return NextResponse.json(
            { success: false, error: e?.message || String(e) },
            { status: 500 }
          )
        }
      }

      default:
        return NextResponse.json(
          { success: false, error: `未知 action: ${action}` },
          { status: 400 }
        )
    }
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '请求处理失败' },
      { status: 500 }
    )
  }
}

export async function GET(_req: NextRequest) {
  try {
    const config = getSkyportServerConfig()
    const { userToken, mqttPassword, ...safeConfig } = config
    return NextResponse.json({
      success: true,
      config: safeConfig,
      configured: isSkyportConfigured(config),
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '获取配置失败' },
      { status: 500 }
    )
  }
}
