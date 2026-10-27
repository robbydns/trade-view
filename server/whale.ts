export type WhaleBreakoutState =
  | 'EARLY_WHALE_ALERT'
  | 'BREAKOUT_CONFIRMED'
  | 'FAILED_BREAKOUT'
  | 'DISTRIBUTION_ALERT'
  | 'SIGNAL_INVALIDATED'
  | 'WAIT'

export type WhaleCategory =
  | 'not-convincing'
  | 'activity-rising'
  | 'possible-accumulation'
  | 'strong-whale-activity'

export type WhaleDataQuality = 'LOW' | 'MEDIUM' | 'HIGH'

export interface WhaleScoreInput {
  largeTradeActivity: number
  volumeSpikeRatio: number
  tradeImbalance: number
  orderBookImbalance: number
  netTakerFlow: number
  consistency: number
  dataQuality: number
}

export interface WhaleBreakoutContext {
  whaleScore: number
  price: number
  resistance: number
  volumeSpikeRatio: number
  netTakerFlow: number
  orderBookImbalance: number
  priceNearResistancePct: number
  dataQuality: number
  invalidationPressure: number
  confirmed: boolean
  failed: boolean
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum)
const round = (value: number, digits = 4) => Number(value.toFixed(digits))

export const calculateNotional = (price: number, quantity: number) => round(price * quantity, 8)

export const detectVolumeSpike = (currentVolume: number, baselineVolume: number) => {
  const volumeRatio = baselineVolume > 0 ? currentVolume / baselineVolume : 0
  const normalized = round(volumeRatio, 3)
  if (normalized >= 4) return { volumeRatio: normalized, level: 'extreme' as const }
  if (normalized >= 2.5) return { volumeRatio: normalized, level: 'significant' as const }
  if (normalized >= 1.5) return { volumeRatio: normalized, level: 'increased' as const }
  return { volumeRatio: normalized, level: 'normal' as const }
}

export const calculateTradeImbalance = (buyVolume: number, sellVolume: number) => {
  const total = buyVolume + sellVolume
  if (!total) return 0
  return (buyVolume - sellVolume) / total
}

export const calculateOrderBookImbalance = (bidNotional: number, askNotional: number) => {
  const total = bidNotional + askNotional
  if (!total) return 0
  return (bidNotional - askNotional) / total
}

export const calculateWhaleScore = (input: WhaleScoreInput) => {
  const normalizedQuality = clamp(input.dataQuality, 0, 1)
  const largeTradeComponent = clamp(input.largeTradeActivity, 0, 1) * 25
  const volumeComponent = clamp(input.volumeSpikeRatio / 4, 0, 1) * 20
  const tradeImbalanceComponent = clamp(input.tradeImbalance, -1, 1) * 20
  const orderBookImbalanceComponent = clamp(input.orderBookImbalance, -1, 1) * 20
  const takerFlowComponent = clamp(input.netTakerFlow, -1, 1) * 10
  const consistencyComponent = clamp(input.consistency, 0, 1) * 10

  let score = largeTradeComponent + volumeComponent + tradeImbalanceComponent + orderBookImbalanceComponent + takerFlowComponent + consistencyComponent
  score *= normalizedQuality
  return Math.max(0, Math.min(100, Number(score.toFixed(1))))
}

export const determineWhaleCategory = (score: number): WhaleCategory => {
  if (score < 40) return 'not-convincing'
  if (score < 60) return 'activity-rising'
  if (score < 75) return 'possible-accumulation'
  return 'strong-whale-activity'
}

export const determineDataQuality = (quality: number): WhaleDataQuality => {
  if (quality >= 0.8) return 'HIGH'
  if (quality >= 0.5) return 'MEDIUM'
  return 'LOW'
}

export const detectBreakoutState = (input: WhaleBreakoutContext): WhaleBreakoutState => {
  if (input.failed) {
    if (input.invalidationPressure >= 0.85 || (input.netTakerFlow <= -0.35 && input.orderBookImbalance <= -0.2)) {
      return 'DISTRIBUTION_ALERT'
    }
    if (input.invalidationPressure >= 0.55 || input.netTakerFlow <= -0.2 || input.orderBookImbalance <= -0.1) {
      return 'FAILED_BREAKOUT'
    }
    return 'SIGNAL_INVALIDATED'
  }

  if (input.confirmed && input.whaleScore >= 60 && input.netTakerFlow > 0.15 && input.volumeSpikeRatio >= 2.5 && input.priceNearResistancePct <= 2) {
    return 'BREAKOUT_CONFIRMED'
  }

  if (
    input.whaleScore >= 60 &&
    input.netTakerFlow > 0 &&
    input.volumeSpikeRatio >= 1.5 &&
    input.priceNearResistancePct <= 2 &&
    input.orderBookImbalance > 0 &&
    input.dataQuality >= 0.8 &&
    input.invalidationPressure < 0.5
  ) {
    return 'EARLY_WHALE_ALERT'
  }

  return 'WAIT'
}
