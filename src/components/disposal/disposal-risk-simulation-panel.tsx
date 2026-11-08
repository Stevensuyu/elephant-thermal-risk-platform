import React, { useState, useCallback, useEffect } from 'react'
import { Activity, TrendingUp, TrendingDown, Minus, Brain, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react'

interface SimulationPoint {
  offsetMin: number
  timeLabel: string
  riskValue: number
  distVillageKm: number
  riskLevel: string
}

interface SimulationResult {
  points: SimulationPoint[]
  peakRisk: number
  peakOffsetMin: number
  invasionProbability: number
  trend: 'RISK_RISING' | 'RISK_DROPPING' | 'RISK_STABLE'
  mathModel: string
  aiAnalysis?: string
  aiSuggestions?: string[]
  model?: string
}

interface Props {
  task: {
    id: string
    name?: string
    warningLevel?: string
    intrusionRisk?: number
    detectedCount?: number
    location?: string
    isNight?: boolean
    weather?: string
  }
}

const levelColor: Record<string, string> = {
  RED: '#ef4444',
  ORANGE: '#f97316',
  YELLOW: '#eab308',
  BLUE: '#3b82f6',
}

export const RiskSimulationPanel: React.FC<Props> = ({ task }) => {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState('')

  const runSimulation = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/risk-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentRisk: task.intrusionRisk ?? 50,
          warningLevel: task.warningLevel || 'YELLOW',
          detectedCount: task.detectedCount ?? 1,
          distVillageKm: 1.2,
          speedKmH: 0.8,
          headingToVillage: 0.65,
          isNight: task.isNight ?? false,
          weather: task.weather || '晴',
          rainProbability: 25,
          location: task.location || '未知区域',
          alertType: task.name || '象群入侵',
        }),
      })
      const data = await res.json()
      if (data.success && data.simulation) {
        setResult(data.simulation)
      } else {
        setError(data.error || '推演失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误')
    } finally {
      setLoading(false)
    }
  }, [task])

  // 进入页面后自动推演一次
  useEffect(() => {
    runSimulation()
  }, [runSimulation])

  const trendIcon = result?.trend === 'RISK_RISING' ? <TrendingUp size={16} className="text-red-400" />
    : result?.trend === 'RISK_DROPPING' ? <TrendingDown size={16} className="text-green-400" />
    : <Minus size={16} className="text-yellow-400" />

  const trendText = result?.trend === 'RISK_RISING' ? '风险上升'
    : result?.trend === 'RISK_DROPPING' ? '风险趋缓' : '高位震荡'

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">1.6小时风险推演</span>
          {result?.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-700/40">
              AI 推演
            </span>
          )}
        </div>
        <button
          onClick={runSimulation}
          disabled={loading}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '推演中...' : result ? '重新推演' : '开始推演'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1 mb-2">{error}</div>
      )}

      {!result && !loading && (
        <div className="text-xs text-slate-500 text-center py-6 space-y-2">
          <Activity size={24} className="mx-auto text-slate-600" />
          <div>正在初始化风险推演引擎...</div>
          <div className="text-[10px]">基于数学模型 + AI大模型分析未来1.6小时风险走向</div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* 关键指标 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-slate-800/50 p-2 text-center">
              <div className="text-[10px] text-slate-400">峰值风险</div>
              <div className="text-lg font-bold text-orange-400">{result.peakRisk}%</div>
              <div className="text-[10px] text-slate-500">+{result.peakOffsetMin}min</div>
            </div>
            <div className="rounded bg-slate-800/50 p-2 text-center">
              <div className="text-[10px] text-slate-400">入侵概率</div>
              <div className="text-lg font-bold text-red-400">{result.invasionProbability}%</div>
              <div className="text-[10px] text-slate-500">1.6小时内</div>
            </div>
            <div className="rounded bg-slate-800/50 p-2 text-center">
              <div className="text-[10px] text-slate-400">趋势</div>
              <div className="flex items-center justify-center gap-1">
                {trendIcon}
                <span className="text-sm font-semibold text-white">{trendText}</span>
              </div>
            </div>
          </div>

          {/* 风险曲线（简易柱状图） */}
          <div className="rounded bg-slate-800/30 p-2">
            <div className="text-[10px] text-slate-400 mb-1">风险时序（每10分钟）</div>
            <div className="flex items-end gap-1 h-16">
              {result.points.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${(p.riskValue / 100) * 100}%`,
                      backgroundColor: levelColor[p.riskLevel] || '#64748b',
                      minHeight: '4px',
                    }}
                    title={`${p.timeLabel}: ${p.riskValue}%`}
                  />
                  <span className="text-[8px] text-slate-500">{p.offsetMin}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI分析 */}
          {result.aiAnalysis && (
            <div className="rounded bg-cyan-900/20 border border-cyan-700/30 p-2">
              <div className="flex items-center gap-1 mb-1">
                <Brain size={12} className="text-cyan-400" />
                <span className="text-[11px] font-semibold text-cyan-300">AI研判分析</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{result.aiAnalysis}</p>
            </div>
          )}

          {/* AI处置建议 */}
          {result.aiSuggestions && result.aiSuggestions.length > 0 && (
            <div className="rounded bg-slate-800/30 p-2">
              <div className="flex items-center gap-1 mb-1">
                <ShieldCheck size={12} className="text-green-400" />
                <span className="text-[11px] font-semibold text-green-300">AI处置建议</span>
              </div>
              <ul className="space-y-1">
                {result.aiSuggestions.map((s, i) => (
                  <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                    <span className="text-green-400 shrink-0">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
