import { useEffect, useState } from 'react'
import { mergeIntegrationDraft, readIntegrationDraft, writeIntegrationDraft } from '@/lib/integration-client'

type IntegrationConfig = {
  map: { provider: 'amap'; apiKey: string; securityJsCode: string }
  ai: { providerName: string; baseUrl: string; apiKey: string; model: string }
  dji: {
    providerName: string
    cloudApiBaseUrl: string
    openApiBaseUrl: string
    websocketUrl: string
    appKey: string
    appId: string
    accessToken: string
    workspaceId: string
  }
  yolo: { providerName: string; serviceUrl: string; apiKey: string; weights: string }
  thermal: { streamUrl: string; snapshotUrl: string; sourceName: string }
  threeD: { providerName: string; serviceUrl: string; snapshotUrl: string }
}

const emptyConfig: IntegrationConfig = {
  map: { provider: 'amap', apiKey: '', securityJsCode: '' },
  ai: { providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4.1-mini' },
  dji: { providerName: 'DJI FlightHub 2', cloudApiBaseUrl: '', openApiBaseUrl: '', websocketUrl: '', appKey: '', appId: '', accessToken: '', workspaceId: '' },
  yolo: { providerName: 'Ultralytics / Roboflow', serviceUrl: '', apiKey: '', weights: 'yolov8n.pt' },
  thermal: { streamUrl: '', snapshotUrl: '', sourceName: '实时热成像流' },
  threeD: { providerName: '三维分析服务', serviceUrl: '', snapshotUrl: '' },
}

export default function IntegrationSettings() {
  const [config, setConfig] = useState<IntegrationConfig>(emptyConfig)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/integrations/config', { cache: 'no-store' })
      if (response.ok) {
        const serverConfig = await response.json()
        setConfig(mergeIntegrationDraft(serverConfig, readIntegrationDraft()))
      }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/integrations/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!response.ok) throw new Error('保存失败')
      const saved = await response.json()
      writeIntegrationDraft(saved)
      setConfig(saved)
      setMessage('已保存')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const input = (value: string, onChange: (value: string) => void, placeholder = '') => (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
    />
  )

  const referenceLinks = [
    { label: 'Ultralytics Platform', href: 'https://docs.ultralytics.com/platform/deploy/inference' },
    { label: 'Roboflow Hosted API', href: 'https://docs.roboflow.com/deploy/serverless-hosted-api-v2/use-with-the-rest-api' },
    { label: 'DJI Cloud API', href: 'https://developer.dji.com/cloud-api' },
    { label: 'FlightHub Mapping API', href: 'https://developer.dji.com/flighthub-api' },
    { label: '腾讯位置服务', href: 'https://lbs.qq.com/webservice_v1/index.html' },
  ]

  const aiKeyHint =
    config.ai.providerName.toLowerCase().includes('openai') && config.ai.apiKey && !config.ai.apiKey.startsWith('sk-')
      ? '当前 AI 服务名是 OpenAI，但这个 Key 看起来不像 OpenAI API Key，通常不会是这种格式。'
      : ''

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <Field title="地图 API Key" note="高德地图 JS API">
          {input(config.map.apiKey, (apiKey) => setConfig({ ...config, map: { ...config.map, apiKey } }))}
        </Field>
        <Field title="地图安全密钥" note="可选">
          {input(config.map.securityJsCode, (securityJsCode) => setConfig({ ...config, map: { ...config.map, securityJsCode } }))}
        </Field>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Field title="AI 服务名" note="如 OpenAI / Azure / 通义">
          {input(config.ai.providerName, (providerName) => setConfig({ ...config, ai: { ...config.ai, providerName } }))}
        </Field>
        <Field title="AI 模型" note="例如 gpt-4.1-mini">
          {input(config.ai.model, (model) => setConfig({ ...config, ai: { ...config.ai, model } }))}
        </Field>
        <Field title="AI Base URL" note="接口地址">
          {input(config.ai.baseUrl, (baseUrl) => setConfig({ ...config, ai: { ...config.ai, baseUrl } }))}
        </Field>
        <Field title="AI API Key" note="保存后可直接调用">
          {input(config.ai.apiKey, (apiKey) => setConfig({ ...config, ai: { ...config.ai, apiKey } }))}
        </Field>
      </section>

      {aiKeyHint ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{aiKeyHint}</div> : null}

      <section className="grid grid-cols-2 gap-3">
        <Field title="DJI 平台名" note="司空 / FlightHub 2">
          {input(config.dji.providerName, (providerName) => setConfig({ ...config, dji: { ...config.dji, providerName } }))}
        </Field>
        <Field title="DJI Cloud API" note="FlightHub 2 / Cloud API">
          {input(config.dji.cloudApiBaseUrl, (cloudApiBaseUrl) => setConfig({ ...config, dji: { ...config.dji, cloudApiBaseUrl } }))}
        </Field>
        <Field title="DJI OpenAPI" note="本地或私有云接口">
          {input(config.dji.openApiBaseUrl, (openApiBaseUrl) => setConfig({ ...config, dji: { ...config.dji, openApiBaseUrl } }))}
        </Field>
        <Field title="实时热成像快照" note="可直接喂给研判链路">
          {input(config.thermal.snapshotUrl, (snapshotUrl) => setConfig({ ...config, thermal: { ...config.thermal, snapshotUrl } }))}
        </Field>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Field title="热成像流地址" note="直播流">
          {input(config.thermal.streamUrl, (streamUrl) => setConfig({ ...config, thermal: { ...config.thermal, streamUrl } }))}
        </Field>
        <Field title="YOLO 服务 URL" note="Ultralytics / Roboflow / 自建 GPU">
          {input(config.yolo.serviceUrl, (serviceUrl) => setConfig({ ...config, yolo: { ...config.yolo, serviceUrl } }))}
        </Field>
        <Field title="YOLO 权重" note="仅作服务端引用">
          {input(config.yolo.weights, (weights) => setConfig({ ...config, yolo: { ...config.yolo, weights } }))}
        </Field>
        <Field title="YOLO 服务名" note="可改成云服务平台">
          {input(config.yolo.providerName, (providerName) => setConfig({ ...config, yolo: { ...config.yolo, providerName } }))}
        </Field>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Field title="三维分析服务名" note="三维立体分析 / 点云 / 重建">
          {input(config.threeD.providerName, (providerName) => setConfig({ ...config, threeD: { ...config.threeD, providerName } }))}
        </Field>
        <Field title="三维分析接口" note="可配置重建或 3D 研判服务">
          {input(config.threeD.serviceUrl, (serviceUrl) => setConfig({ ...config, threeD: { ...config.threeD, serviceUrl } }))}
        </Field>
        <Field title="三维分析快照" note="可选的三维静态结果地址">
          {input(config.threeD.snapshotUrl, (snapshotUrl) => setConfig({ ...config, threeD: { ...config.threeD, snapshotUrl } }))}
        </Field>
        <Field title="三维分析说明" note="用于实时立体分析与分级预警">
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            接入后，系统会在状态面板和研判摘要中显示三维分析状态。
          </div>
        </Field>
      </section>

      <div className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm">
        <span className="text-slate-600">{message || '保存后会写入浏览器本地，并同步到当前服务，实时研判和系统状态会直接读取这里的配置。'}</span>
        <button onClick={save} disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60">
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
        <div className="mb-2 font-semibold text-slate-700">接入参考</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {referenceLinks.map((item) => (
            <a key={item.label} className="text-blue-600 hover:underline" href={item.href} target="_blank" rel="noreferrer">
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <label className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mb-2 text-xs text-slate-500">{note}</div>
      {children}
    </label>
  )
}
