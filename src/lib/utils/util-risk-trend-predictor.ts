/**
 * @/lib/utils/trendPredictor.ts
 * 「天眼护象」未来 6 小时入侵风险时序推演引擎
 * —— 忠实移植自 2.py (Elephant6HourTrendPredictor)。
 *
 * 依据：当前空间位姿、航向角、速度、象群昼夜节律曲线、未来气象预报，
 * 推演 T+0 到 T+6 小时的风险指数走向与峰值窗口。
 */

export interface TrendPrediction {
  timeLabels: string[]
  riskValues: number[]
  peakHourOffset: number
  peakRiskValue: number
  trendStatus: 'RISK_RISING' | 'RISK_DROPPING' | 'RISK_STABLE'
  trendTitle: string
  trendDescription: string
}

export class Elephant6HourTrendPredictor {
  // 亚洲象昼夜活动节律系数 (0-24小时，黄昏和前半夜最活跃)
  circadianRhythmMap: Record<number, number> = {
    0: 1.2, 1: 1.1, 2: 0.9, 3: 0.7, 4: 0.6, 5: 0.5,
    6: 0.6, 7: 0.7, 8: 0.8, 9: 0.7, 10: 0.6, 11: 0.5,
    12: 0.5, 13: 0.5, 14: 0.6, 15: 0.7, 16: 0.9, 17: 1.1,
    18: 1.3, 19: 1.4, 20: 1.5, 21: 1.5, 22: 1.4, 23: 1.3,
  }

  predict6hTrend(
    currentRisk: number,
    distVillageKm: number,
    speedKmH: number,
    headingVectorDot: number, // 0~1，朝向村寨的矢量投影
    futureWeatherRainProb: number[], // 未来6小时降水概率
  ): TrendPrediction {
    const startTime = new Date()
    const timeLabels = ['现在'].concat(Array.from({ length: 6 }, (_, i) => `+${i + 1}h`))
    const riskSeries: number[] = []

    const currentDist = distVillageKm

    for (let h = 0; h < 7; h++) {
      if (h === 0) {
        riskSeries.push(Math.round(currentRisk))
        continue
      }

      // 1. 空间距离外推：按当前移动矢量，推算 h 小时后的位置与距离
      const travelledTowardsVillage = speedKmH * h * headingVectorDot
      const projectedDist = Math.max(0.05, currentDist - travelledTowardsVillage)

      // 距离越近，非线性风险越高
      const spatialDelta = (1 / projectedDist) * 8

      // 2. 昼夜生物节律加权
      const futureHour = (startTime.getHours() + h) % 24
      const rhythmFactor = this.circadianRhythmMap[futureHour] ?? 1

      // 3. 气象风险加权 (降水/大雾增加防护难度)
      const rainProb = h - 1 < futureWeatherRainProb.length ? futureWeatherRainProb[h - 1] : 0
      const weatherDelta = rainProb * 15

      // 4. 综合推算 T+h 小时的风险值
      let projectedRisk = (currentRisk * 0.5 + spatialDelta * 0.3) * rhythmFactor + weatherDelta
      projectedRisk = Math.round(Math.max(10, Math.min(99, projectedRisk)))
      riskSeries.push(projectedRisk)
    }

    // 分析趋势走向
    const peakIndex = riskSeries.indexOf(Math.max(...riskSeries))
    const peakValue = Math.max(...riskSeries)
    const firstVal = riskSeries[0]
    const lastVal = riskSeries[riskSeries.length - 1]

    let trendStatus: TrendPrediction['trendStatus']
    let trendTitle: string
    let trendDesc: string
    if (peakValue - firstVal >= 8) {
      trendStatus = 'RISK_RISING'
      trendTitle = '风险上升'
      trendDesc = `受半夜活动高峰与下坡移动影响，预计在 +${peakIndex}h 达到风险峰值（${peakValue}%），请注意提前布防。`
    } else if (firstVal - lastVal >= 8) {
      trendStatus = 'RISK_DROPPING'
      trendTitle = '风险趋缓'
      trendDesc = '象群正逐渐背离敏感区域移动，未来 6 小时侵入风险呈现持续下降趋势。'
    } else {
      trendStatus = 'RISK_STABLE'
      trendTitle = '高位高频波动'
      trendDesc = `象群在防护围栏外围高频徘徊，未来 6 小时风险维持在 ${Math.min(...riskSeries)}%–${Math.max(...riskSeries)}% 区间高位震荡。`
    }

    return {
      timeLabels,
      riskValues: riskSeries,
      peakHourOffset: peakIndex,
      peakRiskValue: peakValue,
      trendStatus,
      trendTitle,
      trendDescription: trendDesc,
    }
  }
}

/** 便捷函数：推演未来 6 小时风险走向 */
export function predict6hTrend(
  currentRisk: number,
  distVillageKm: number,
  speedKmH: number,
  headingVectorDot: number,
  futureWeatherRainProb: number[],
): TrendPrediction {
  return new Elephant6HourTrendPredictor().predict6hTrend(currentRisk, distVillageKm, speedKmH, headingVectorDot, futureWeatherRainProb)
}

// ───────────────────────────────────────────────────────────────────────────
// 「入侵概率滚动预测」（研究要点③）：30 分钟至 2 小时之内的滚动预测窗口
// 对应申请书口径 —— 实时位置/速率/方向与村庄、农田、边境线的空间关系定量计算，
// 输出 30/60/90/120 分钟四个滚动窗口的入侵概率与对应预警级别，供分级警情推送。
// ───────────────────────────────────────────────────────────────────────────

export interface RollingWindow {
  /** 窗口标签，如 '+30min' / '30 分钟后' */
  label: string
  minutes: number
  /** 入侵概率 0-100 */
  probability: number
  /** 对应四级预警级别 */
  level: 'RED' | 'ORANGE' | 'YELLOW' | 'BLUE'
  /** 抵达窗口描述，如「约 42 分钟后」 */
  etaText: string
}

export interface RollingRiskPrediction {
  windows: RollingWindow[]
  peakWindow: RollingWindow
  currentLevel: RollingWindow['level']
  note: string
}

const ROLLING_MINUTES = [30, 60, 90, 120]

/** 由风险指数映射四级预警级别（与 superRiskEngine 阈值口径一致） */
export function levelOfRisk(risk: number): RollingWindow['level'] {
  if (risk >= 75) return 'RED'
  if (risk >= 55) return 'ORANGE'
  if (risk >= 30) return 'YELLOW'
  return 'BLUE'
}

/**
 * 30 分钟–2 小时入侵概率滚动预测。
 * 依据：当前空间位姿、距村寨距离、移动速率、朝向投影、象群昼夜节律与未来降水概率，
 * 逐窗口外推位置并计算入侵概率（距离越近非线性抬升，夜间/降水加大防护难度）。
 */
export function predictRollingRisk(
  currentRisk: number,
  distVillageKm: number,
  speedKmH: number,
  headingVectorDot: number,
  futureRainProb30: number,
): RollingRiskPrediction {
  const startTime = new Date()
  const currentDist = Math.max(0.05, distVillageKm)
  const windows: RollingWindow[] = ROLLING_MINUTES.map((min) => {
    const h = min / 60
    // 1. 空间距离外推：按当前移动矢量推算 min 分钟后的位置与距村寨距离
    const travelled = speedKmH * h * headingVectorDot
    const projectedDist = Math.max(0.05, currentDist - travelled)
    // 距离越近，非线性风险越高（近程 0.3km 内显著抬升）
    const spatialDelta = (1 / projectedDist) * 5.5 * (h * 2)

    // 2. 昼夜生物节律加权（黄昏与前半夜活跃）
    const futureHour = (startTime.getHours() + Math.round(min / 60)) % 24
    const rhythm = new Elephant6HourTrendPredictor().circadianRhythmMap[futureHour] ?? 1

    // 3. 气象加权：未来 30 分钟降水概率（无更细粒度时以给定值近似）
    const weatherDelta = futureRainProb30 * 12 * (h * 1.5)

    // 4. 综合推算：当前风险基线 + 空间逼近增量 + 气象增量，节律调制
    let prob = (currentRisk * 0.55 + spatialDelta * 0.3) * rhythm + weatherDelta
    prob = Math.round(Math.max(5, Math.min(99, prob)))

    const level = levelOfRisk(prob)
    // 已在窗口内抵达敏感区（距离被钳制在 <100m）：文案明确「已逼近」，不再按速度反推分钟数
    const etaText =
      projectedDist <= 0.1
        ? `已逼近敏感区（${Math.round(currentDist * 1000)}m 外，窗口内可达）`
        : `约 ${Math.max(2, Math.round((projectedDist / Math.max(0.5, speedKmH)) * 60))} 分钟后抵达`
    return {
      label: `+${min}min`,
      minutes: min,
      probability: prob,
      level,
      etaText,
    }
  })

  const peakWindow = windows.reduce((a, b) => (b.probability > a.probability ? b : a), windows[0])
  const currentLevel = levelOfRisk(currentRisk)

  const note =
    currentLevel === 'RED' || currentLevel === 'ORANGE'
      ? `象群正在逼近敏感区域，未来 2 小时内入侵概率预计于 +${peakWindow.minutes} 分钟窗口达到峰值（${peakWindow.probability}%），建议按${currentLevel === 'RED' ? '红' : '橙'}色预案立即联动处置。`
      : `象群活动平稳，未来 2 小时内入侵概率总体处于${currentLevel === 'YELLOW' ? '黄色' : '蓝色'}区间，保持滚动跟踪并按预案观察。`

  return { windows, peakWindow, currentLevel, note }
}
