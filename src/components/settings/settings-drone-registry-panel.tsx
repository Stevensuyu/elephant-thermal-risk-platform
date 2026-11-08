'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Plane, Plus, Trash2, Link2, Unlink, Radio, MapPin, Cpu, AlertTriangle, Send,
  CheckCircle2, XCircle, KeyRound, Globe2, RefreshCw, Satellite, Flame, Pencil,
} from 'lucide-react'
import {
  getDrones, onDronesChange, addDrone, removeDrone, updateDrone, nextDroneId,
  type ManagedDrone, type DroneConnection,
} from '@/lib/store/store-drone-registry'
import {
  getSkyportConfig, setSkyportConfig, onSkyportChange, connectSkyport, isRealSkyport,
  getDeviceState, startLiveStream, stopLiveStream,
  type SkyportConfig, type DeviceState,
} from '@/lib/utils/util-dji-skyport-api'

const CONNECTION_META: Record<DroneConnection, { label: string; cls: string; dot: string }> = {
  simulated: { label: '未接入', cls: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', dot: 'bg-sky-400' },
  connected: { label: '已接入司空', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', dot: 'bg-emerald-400' },
  connecting: { label: '连接中', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', dot: 'bg-amber-400' },
  disconnected: { label: '未连接', cls: 'bg-slate-500/15 text-slate-300 ring-slate-400/30', dot: 'bg-slate-400' },
  error: { label: '异常', cls: 'bg-red-500/15 text-red-300 ring-red-400/30', dot: 'bg-red-400' },
}

const YUNNAN = { minLat: 21.0, maxLat: 28.5, minLng: 97.0, maxLng: 106.0 }

export default function DroneRegistryPanel() {
  const [drones, setDrones] = useState<ManagedDrone[]>(() => getDrones())
  const [cfg, setCfg] = useState<SkyportConfig>(() => getSkyportConfig())
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<ManagedDrone | null>(null)

  useEffect(() => {
    const offD = onDronesChange(() => setDrones(getDrones()))
    const offS = onSkyportChange(() => setCfg(getSkyportConfig()))
    return () => { offD(); offS() }
  }, [])

  const real = isRealSkyport(cfg)
  const summary = useMemo(() => {
    const s: Record<DroneConnection, number> = { simulated: 0, connected: 0, connecting: 0, disconnected: 0, error: 0 }
    drones.forEach((d) => { s[d.connection]++ })
    return s
  }, [drones])

  const handleTestConnect = async () => {
    setTesting(true); setTestMsg(null)
    const res = await connectSkyport(cfg)
    setTestMsg({ ok: res.ok || res.mode === 'sim', text: res.message })
    setDrones(getDrones())
    setTesting(false)
  }

  return (
    <div className="space-y-5">
      {/* 司空平台接入 */}
      <section className="dv-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={18} className="text-cyan-300" />
          <h3 className="text-base font-semibold text-slate-100">大疆司空平台接入</h3>
          <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${real ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' : 'bg-sky-500/15 text-sky-300 ring-sky-400/30'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${real ? 'bg-emerald-400' : 'bg-sky-400'}`} />
            {real ? '已配置 · 可接入真实设备' : '未接入司空 · 不产生模拟数据'}
          </span>
        </div>
        <p className="mb-4 text-[11px] leading-5 text-slate-500">
          填入大疆司空 2 OpenAPI 凭证（X-User-Token）并启用后，平台将拉取工作空间设备、获取物模型信息（位置/热成像）、开启直播推流。
          实时位置通过 MQTT 推送（需配置云端互联），视频流通过 RTMP 转发。未配置/未连接时不显示任何虚假无人机。
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={Globe2} label="司空网关地址 (baseUrl)">
            <input className={inp} value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://es-flight-api-cn.djigate.com" />
          </Field>
          <Field icon={KeyRound} label="用户 Token (X-User-Token)">
            <input type="password" className={inp} value={cfg.userToken} onChange={(e) => setCfg({ ...cfg, userToken: e.target.value })} placeholder="司空2 OpenAPI 用户 Token" />
          </Field>
          <Field icon={Satellite} label="工作空间 ID (workspaceId)">
            <input className={inp} value={cfg.workspaceId} onChange={(e) => setCfg({ ...cfg, workspaceId: e.target.value })} placeholder="workspace-xxxx" />
          </Field>
          <Field icon={Radio} label="RTMP 服务器地址（视频流）">
            <input className={inp} value={cfg.rtmpServerUrl} onChange={(e) => setCfg({ ...cfg, rtmpServerUrl: e.target.value })} placeholder="rtmp://your-server:1935/live" />
          </Field>
        </div>

        {/* MQTT 遥测配置 */}
        <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Radio size={14} className="text-cyan-300" />
            <span className="text-xs font-semibold text-slate-200">MQTT 遥测配置（实时位置推送）</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={cfg.mqttEnabled} onChange={(e) => setCfg({ ...cfg, mqttEnabled: e.target.checked })} className="h-3.5 w-3.5 accent-cyan-400" />
              启用
            </label>
          </div>
          <p className="mb-2 text-[10px] leading-4 text-slate-500">
            实时位置通过 MQTT 推送（topic: thing/product/{'{'}sn{'}'}/osd），需在司空2平台配置「云端互联」转发到此 MQTT 服务器。
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={inp} value={cfg.mqttHost} onChange={(e) => setCfg({ ...cfg, mqttHost: e.target.value })} placeholder="MQTT Host" />
            <input className={inp} type="number" value={cfg.mqttPort} onChange={(e) => setCfg({ ...cfg, mqttPort: Number(e.target.value) })} placeholder="1883" />
            <input className={inp} value={cfg.mqttUsername} onChange={(e) => setCfg({ ...cfg, mqttUsername: e.target.value })} placeholder="用户名（可选）" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => { const n = { ...cfg, enabled: e.target.checked }; setCfg(n); setSkyportConfig(n) }} className="h-4 w-4 accent-cyan-400" />
            启用司空实时接入
          </label>
          <button
            onClick={handleTestConnect}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600/90 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
          >
            <RefreshCw size={15} className={testing ? 'animate-spin' : ''} />
            {testing ? '连接中…' : '测试连接 / 同步设备'}
          </button>
          {testMsg && (
            <span className={`inline-flex items-center gap-1.5 text-[12px] ${testMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {testMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {testMsg.text}
            </span>
          )}
        </div>
      </section>

      {/* 无人机列表 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Plane size={18} className="text-cyan-300" />巡检无人机</h3>
          <span className="text-[11px] text-slate-500">共 {drones.length} 架</span>
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">实时 {summary.connected}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">未接入 {summary.simulated}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-300">未连 {summary.disconnected}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drones.map((d) => (
            <DroneRow key={d.id} d={d}
              // 诚实原则：未配置真实司空凭证时禁止把无人机标记为已连接（不伪造接入）
              onConnect={() => updateDrone(d.id, { connection: 'connecting' })}
              onDisconnect={() => updateDrone(d.id, { connection: 'disconnected' })}
              onDelete={() => removeDrone(d.id)}
              onToggleThermal={() => updateDrone(d.id, { hasThermal: !d.hasThermal })}
              onEdit={() => setEditing(d)}
              onTestAlert={async (level) => {
                const r = await fetch('/api/drone-alert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ droneId: d.id, name: d.name, lat: d.homeLat, lng: d.homeLng, warningLevel: level, intrusionRisk: 72, note: '巡检无人机测试预警（取自该机GPS坐标）' }),
                })
                return r.ok
              }}
            />
          ))}
        </div>
      </section>

      {/* 添加 / 编辑无人机 */}
      <AddDroneForm
        key={editing ? `edit-${editing.id}` : 'add'}
        onAdd={(input) => { addDrone(input); setDrones(getDrones()) }}
        edit={editing ?? undefined}
        onEdit={(input) => { if (editing) { updateDrone(editing.id, input); setDrones(getDrones()) } ; setEditing(null) }}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function DroneRow({
  d, onConnect, onDisconnect, onDelete, onToggleThermal, onEdit, onTestAlert,
}: {
  d: ManagedDrone
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onToggleThermal: () => void
  onEdit: () => void
  onTestAlert: (level: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const [level, setLevel] = useState('ORANGE')
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const m = CONNECTION_META[d.connection]
  const active = d.connection === 'connected'
  const canConnect = isRealSkyport()
  const deviceSn = d.skyport?.deviceSn

  const fetchState = async () => {
    if (!deviceSn) return
    setStateLoading(true)
    const state = await getDeviceState(deviceSn)
    setDeviceState(state)
    setStateLoading(false)
  }

  const toggleLive = async () => {
    if (!deviceSn) return
    setLiveLoading(true)
    if (liveUrl) {
      await stopLiveStream(deviceSn)
      setLiveUrl(null)
    } else {
      const result = await startLiveStream(deviceSn)
      if (result?.playUrl) setLiveUrl(result.playUrl)
    }
    setLiveLoading(false)
  }

  return (
    <div className="dv-panel relative overflow-hidden p-4">
      <div className={`absolute inset-y-0 left-0 w-[3px] ${m.dot}`} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{d.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="font-mono">{d.id}</span><span>·</span><span>{d.model}</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${d.connection === 'connected' ? 'animate-pulse' : ''}`} />
          {m.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
        <MapPin size={12} className="text-slate-500" />
        <span className="font-mono text-slate-300">
          {deviceState?.latitude !== undefined ? `${deviceState.latitude.toFixed(4)}°N, ${deviceState?.longitude?.toFixed(4)}°E` : `${d.homeLat.toFixed(4)}°N, ${d.homeLng.toFixed(4)}°E`}
        </span>
        {deviceState?.altitude !== undefined && (
          <span className="ml-2 font-mono text-cyan-300">↑{deviceState.altitude.toFixed(1)}m</span>
        )}
        {deviceState?.speed !== undefined && (
          <span className="ml-2 font-mono text-emerald-300">{deviceState.speed.toFixed(1)}m/s</span>
        )}
        {deviceSn && <span className="ml-auto font-mono text-slate-500">SN {deviceSn}</span>}
      </div>

      {/* 物模型信息：热成像、电池 */}
      {active && deviceSn && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          {deviceState?.irMeteringMode && deviceState.irMeteringMode !== 'metering_off' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-300 ring-1 ring-orange-400/30">
              <Flame size={10} /> 热成像测温中
            </span>
          )}
          {deviceState?.batteryLevel !== undefined && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${deviceState.batteryLevel > 30 ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' : 'bg-red-500/15 text-red-300 ring-red-400/30'}`}>
              电量 {deviceState.batteryLevel}%
            </span>
          )}
          {deviceState?.flightTime !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-300 ring-1 ring-slate-400/30">
              飞行 {Math.floor(deviceState.flightTime / 60)}分{deviceState.flightTime % 60}秒
            </span>
          )}
          <button
            onClick={fetchState}
            disabled={stateLoading}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
          >
            <RefreshCw size={10} className={stateLoading ? 'animate-spin' : ''} />
            刷新状态
          </button>
        </div>
      )}

      {/* 视频流控制 */}
      {active && deviceSn && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={toggleLive}
            disabled={liveLoading}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-60 ${
              liveUrl
                ? 'border border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                : 'border border-cyan-400/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
            }`}
          >
            {liveUrl ? '■ 停止直播' : '▶ 开启直播'}
          </button>
          {liveUrl && (
            <span className="truncate text-[10px] text-emerald-300" title={liveUrl}>
              拉流地址: {liveUrl}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {active ? (
          <button onClick={onDisconnect} className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-800/40 px-2.5 py-1.5 text-[11px] text-slate-200 hover:border-rose-400/50">
            <Unlink size={13} /> 断开
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={!canConnect}
            title={canConnect ? '向司空平台发起接入' : '请先在上方配置并启用大疆司空凭证，真实接入后才能标记为已连接'}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            <Link2 size={13} /> {canConnect ? '接入司空' : '未配置凭证'}
          </button>
        )}
        <button
          onClick={onToggleThermal}
          title={d.hasThermal ? '已配备热成像模块 · 点击关闭' : '未配备热成像模块 · 点击开启'}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] transition ${
            d.hasThermal
              ? 'border-orange-400/60 bg-orange-500/15 text-orange-200 hover:bg-orange-500/25'
              : 'border-slate-600/60 bg-slate-800/40 text-slate-400 hover:border-orange-400/40 hover:text-orange-300'
          }`}
        >
          <Flame size={13} className={d.hasThermal ? 'text-orange-400' : ''} />
          {d.hasThermal ? '热成像·开' : '热成像·关'}
        </button>
        <button onClick={async () => { setBusy(true); const r = await onTestAlert(level); setOk(r); setBusy(false); setTimeout(() => setOk(false), 2500) }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-60">
          <Send size={13} /> {ok ? '已下发' : '下发测试预警'}
        </button>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="ml-auto rounded-md border border-slate-600/60 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-200">
          <option value="RED">红</option><option value="ORANGE">橙</option><option value="YELLOW">黄</option><option value="BLUE">蓝</option>
        </select>
        <button onClick={onDelete} title="删除无人机" className="rounded-md border border-slate-600/60 bg-slate-800/40 p-1.5 text-slate-400 hover:border-rose-400/50 hover:text-rose-300">
          <Trash2 size={14} />
        </button>
        <button onClick={onEdit} title="编辑无人机" className="rounded-md border border-slate-600/60 bg-slate-800/40 p-1.5 text-slate-400 hover:border-cyan-400/50 hover:text-cyan-300">
          <Pencil size={14} />
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-600">测试预警将按该机 GPS 落点生成真实警情（诚实标注为测试来源）。</p>
    </div>
  )
}

type DroneFormInput = Omit<ManagedDrone, 'id' | 'createdAt' | 'connection'> & { id?: string }

function AddDroneForm({
  onAdd,
  edit,
  onEdit,
  onClose,
}: {
  onAdd: (input: DroneFormInput) => void
  edit?: ManagedDrone
  onEdit?: (input: DroneFormInput) => void
  onClose?: () => void
}) {
  const isEdit = !!edit
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() =>
    edit
      ? {
          name: edit.name,
          model: edit.model,
          sn: edit.skyport?.deviceSn || '',
          lat: String(edit.homeLat),
          lng: String(edit.homeLng),
          streamUrl: edit.streamUrl || '',
          sample: edit.sampleVideo || '',
          thermal: !!edit.hasThermal,
        }
      : { name: '', model: 'DJI M30T', sn: '', lat: '', lng: '', streamUrl: '', sample: '', thermal: false },
  )
  const [err, setErr] = useState<string | null>(null)

  const submit = () => {
    setErr(null)
    const lat = Number(form.lat), lng = Number(form.lng)
    if (!form.name.trim()) return setErr('请填写无人机名称')
    if (!form.lat || !form.lng || Number.isNaN(lat) || Number.isNaN(lng)) return setErr('请填写部署 GPS 经纬度')
    if (lat < YUNNAN.minLat || lat > YUNNAN.maxLat || lng < YUNNAN.minLng || lng > YUNNAN.maxLng)
      return setErr('坐标不在云南省范围内，请核对')
    const payload: DroneFormInput = {
      name: form.name.trim(),
      model: form.model.trim() || 'DJI Unknown',
      homeLat: lat, homeLng: lng,
      skyport: form.sn.trim() ? { deviceSn: form.sn.trim(), streamUrl: form.streamUrl.trim() || undefined } : undefined,
      streamUrl: form.streamUrl.trim() || undefined,
      sampleVideo: form.sample.trim() || undefined,
      hasThermal: form.thermal,
    }
    if (isEdit && onEdit) onEdit(payload)
    else onAdd(payload)
    setForm({ name: '', model: 'DJI M30T', sn: '', lat: '', lng: '', streamUrl: '', sample: '', thermal: false })
    setOpen(false)
  }

  // 编辑模式：直接渲染表单（不显示“添加”按钮）
  if (isEdit) {
    return (
      <section className="dv-panel space-y-3 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Pencil size={18} className="text-cyan-300" />编辑无人机 · {edit.name}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={Plane} label="名称 *"><input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：糯扎渡无人机-09" /></Field>
          <Field icon={Radio} label="机型"><input className={inp} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="DJI M30T" /></Field>
          <Field icon={KeyRound} label="司空设备 SN（可选）"><input className={inp} value={form.sn} onChange={(e) => setForm({ ...form, sn: e.target.value })} placeholder="填入后将按 SN 匹配司空设备" /></Field>
          <Field icon={Satellite} label="真实取流地址（可选）"><input className={inp} value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} placeholder="rtsp/rtmp/hls，接入司空后回传" /></Field>
          <Field icon={MapPin} label="部署纬度 lat *"><input className={inp} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="24.55" /></Field>
          <Field icon={MapPin} label="部署经度 lng *"><input className={inp} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="99.52" /></Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
          <input type="checkbox" checked={form.thermal} onChange={(e) => setForm({ ...form, thermal: e.target.checked })} className="h-4 w-4 accent-orange-400" />
          <Flame size={13} className={form.thermal ? 'text-orange-400' : 'text-slate-500'} />
          配备热成像模块（开启后该机画面可切换热成像 / 分屏视图）
        </label>
        {err && <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300"><AlertTriangle size={14} /> {err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={() => onClose?.()} className="rounded-md border border-slate-600/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/40">取消</button>
          <button onClick={submit} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">保存修改</button>
        </div>
      </section>
    )
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/5 py-3 text-sm font-medium text-cyan-200 hover:bg-cyan-500/10">
        <Plus size={16} /> 添加巡检无人机
      </button>
    )
  }

  return (
    <section className="dv-panel space-y-3 p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Plus size={18} className="text-cyan-300" />添加巡检无人机</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field icon={Plane} label="名称 *"><input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：糯扎渡无人机-09" /></Field>
        <Field icon={Radio} label="机型"><input className={inp} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="DJI M30T" /></Field>
        <Field icon={KeyRound} label="司空设备 SN（可选）"><input className={inp} value={form.sn} onChange={(e) => setForm({ ...form, sn: e.target.value })} placeholder="填入后将按 SN 匹配司空设备" /></Field>
        <Field icon={Satellite} label="真实取流地址（可选）"><input className={inp} value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} placeholder="rtsp/rtmp/hls，接入司空后回传" /></Field>
        <Field icon={MapPin} label="部署纬度 lat *"><input className={inp} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="24.55" /></Field>
        <Field icon={MapPin} label="部署经度 lng *"><input className={inp} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="99.52" /></Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
        <input type="checkbox" checked={form.thermal} onChange={(e) => setForm({ ...form, thermal: e.target.checked })} className="h-4 w-4 accent-orange-400" />
        <Flame size={13} className={form.thermal ? 'text-orange-400' : 'text-slate-500'} />
        配备热成像模块（开启后该机画面可切换热成像 / 分屏视图）
      </label>
      {err && <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300"><AlertTriangle size={14} /> {err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-md border border-slate-600/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/40">取消</button>
        <button onClick={submit} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">确认添加</button>
      </div>
    </section>
  )
}

const inp = 'w-full rounded-md border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400/70'

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-slate-400"><Icon size={12} className="mr-1 inline text-slate-500" />{label}</label>
      {children}
    </div>
  )
}
