import { Candle } from '../types'

export type MarketTrend = 'BULLISH' | 'BEARISH' | 'SIDEWAYS'
export type MacdTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL'
export type TradeDecision = 'STRONG BUY' | 'BUY WATCH' | 'WAIT' | 'AVOID'

export interface TechnicalAnalysis {
  trend: MarketTrend
  ema9: number[]
  ema21: number[]
  ema50: number[]
  sma20: Array<number | null>
  sma50: Array<number | null>
  sma50Period: number
  rsi: number
  macd: { line: number; signal: number; histogram: number; previousHistogram: number; trend: MacdTrend; crossover: 'BULLISH' | 'BEARISH' | 'NONE' }
  volumeAverage: number
  volumeRatio: number | null
  volumeSpikePct: number | null
  atr: number
  support: number
  resistance: number
  supportTouches: number
  resistanceTouches: number
  entryLow: number
  entryHigh: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  riskReward: number | null
  priceChangePct: number
  overheated: boolean
  score: number
  decision: TradeDecision
  reasons: string[]
  candleCount: number
  complete: boolean
}

const last = <T>(values: T[], offset = 1): T | undefined => values[values.length - offset]

const round = (value: number, digits = 8) => Number(value.toFixed(digits))
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export const calculateEma = (values: number[], period: number) => {
  if (!values.length) return []
  const multiplier = 2 / (period + 1)
  const seedCount = Math.min(period, values.length)
  const seed = average(values.slice(0, seedCount))
  const result = Array<number>(seedCount).fill(seed)
  for (let index = seedCount; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier))
  }
  return result
}

const calculateSma = (values: number[], period: number) => values.map((_, index) => index < period - 1 ? null : average(values.slice(index - period + 1, index + 1)))

export const calculateRsi = (candles: Candle[], period = 14) => {
  if (candles.length <= period) return null
  const changes = candles.slice(1).map((candle, index) => candle.close - candles[index].close)
  let averageGain = average(changes.slice(0, period).map((change) => Math.max(change, 0)))
  let averageLoss = average(changes.slice(0, period).map((change) => Math.max(-change, 0)))
  for (let index = period; index < changes.length; index += 1) {
    averageGain = (averageGain * (period - 1) + Math.max(changes[index], 0)) / period
    averageLoss = (averageLoss * (period - 1) + Math.max(-changes[index], 0)) / period
  }
  if (averageLoss === 0) return 100
  if (averageGain === 0) return 0
  return round(100 - 100 / (1 + averageGain / averageLoss), 2)
}

const calculateAtr = (candles: Candle[], period = 14) => {
  if (candles.length < period + 1) return null
  const trueRanges = candles.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - candles[index].close),
    Math.abs(candle.low - candles[index].close)
  ))
  let atr = average(trueRanges.slice(0, period))
  for (let index = period; index < trueRanges.length; index += 1) atr = (atr * (period - 1) + trueRanges[index]) / period
  return atr
}

const calculateMacd = (closes: number[]) => {
  const fast = calculateEma(closes, 12)
  const slow = calculateEma(closes, 26)
  const line = fast.map((value, index) => value - slow[index])
  const signal = calculateEma(line, 9)
  const histogram = line.map((value, index) => value - signal[index])
  const currentLine = last(line) || 0
  const currentSignal = last(signal) || 0
  const currentHistogram = last(histogram) || 0
  const previousHistogram = last(histogram, 2) || 0
  return {
    line: round(currentLine),
    signal: round(currentSignal),
    histogram: round(currentHistogram),
    previousHistogram: round(previousHistogram),
    trend: currentLine > currentSignal && currentHistogram > 0 ? 'BULLISH' as const : currentLine < currentSignal && currentHistogram < 0 ? 'BEARISH' as const : 'NEUTRAL' as const,
    crossover: previousHistogram <= 0 && currentHistogram > 0 ? 'BULLISH' as const : previousHistogram >= 0 && currentHistogram < 0 ? 'BEARISH' as const : 'NONE' as const
  }
}

type Level = { price: number; touches: number }
const findLevel = (candles: Candle[], price: number, side: 'support' | 'resistance'): Level => {
  const start = Math.max(1, candles.length - 100)
  const pivots: number[] = []
  for (let index = start; index < candles.length - 1; index += 1) {
    const candle = candles[index]
    if (side === 'support' && candle.low <= candles[index - 1].low && candle.low <= candles[index + 1].low && candle.low < price) pivots.push(candle.low)
    if (side === 'resistance' && candle.high >= candles[index - 1].high && candle.high >= candles[index + 1].high && candle.high > price) pivots.push(candle.high)
  }
  const sorted = pivots.sort((a, b) => side === 'support' ? b - a : a - b)
  const nearest = sorted[0] ?? (side === 'support' ? price * 0.97 : price * 1.03)
  const touches = pivots.filter((candidate) => Math.abs(candidate - nearest) / nearest <= 0.006).length
  return { price: round(nearest), touches }
}

const percentChange = (current: number, previous: number) => previous ? ((current - previous) / previous) * 100 : 0

export const analyzeTechnicalCandles = (input: Candle[]): TechnicalAnalysis | null => {
  // Binance returns the currently forming candle last; use only closed candles for indicator decisions.
  const candles = input.length > 1 ? input.slice(0, -1) : input
  if (candles.length < 50) return null
  const closes = candles.map((candle) => candle.close)
  const latest = last(candles)!
  const previous = last(candles, 2)!
  const ema9 = calculateEma(closes, 9)
  const ema21 = calculateEma(closes, 21)
  const ema50 = calculateEma(closes, 50)
  const sma20 = calculateSma(closes, 20)
  const sma50Period = Math.min(50, closes.length)
  const sma50 = calculateSma(closes, sma50Period)
  const currentEma9 = last(ema9)!
  const currentEma21 = last(ema21)!
  const currentEma50 = last(ema50)!
  const currentSma20 = last(sma20) || currentEma21
  const currentSma50 = last(sma50) ?? currentEma50
  const rsi = calculateRsi(candles)
  const macd = calculateMacd(closes)
  const atr = calculateAtr(candles)
  const volumeBaselineCandles = candles.slice(-21, -1)
  const volumeAverage = average(volumeBaselineCandles.map((candle) => candle.quoteVolume))
  const volumeRatio = volumeAverage > 0 ? round(latest.quoteVolume / volumeAverage, 3) : null
  const volumeSpikePct = volumeRatio === null ? null : round((volumeRatio - 1) * 100, 2)
  const supportLevel = findLevel(candles, latest.close, 'support')
  const resistanceLevel = findLevel(candles, latest.close, 'resistance')
  const volatility = atr || latest.close * 0.01
  const trend = currentEma9 > currentEma21 && latest.close > currentEma50 && currentEma21 >= currentEma50 ? 'BULLISH' : currentEma9 < currentEma21 && latest.close < currentEma50 && currentEma21 <= currentEma50 ? 'BEARISH' : 'SIDEWAYS'
  const priceChangePct = percentChange(latest.close, previous.close)
  const supportDistancePct = Math.abs(latest.close - supportLevel.price) / latest.close * 100
  const nearSupport = latest.close >= supportLevel.price && supportDistancePct <= 2.5
  const breakout = latest.close > resistanceLevel.price && latest.quoteVolume >= volumeAverage * 1.5 && latest.close > latest.open
  const overheated = (rsi !== null && rsi >= 75) || priceChangePct >= 8 || latest.close > currentEma9 + volatility * 2.5
  const bearishStructure = latest.close < supportLevel.price || trend === 'BEARISH' && macd.trend === 'BEARISH'
  const entryLow = round(Math.max(supportLevel.price, Math.min(currentEma9, currentEma21) - volatility * 0.25))
  const entryHigh = round(Math.max(entryLow, Math.min(latest.close, Math.max(currentEma9, currentEma21) + volatility * 0.2)))
  const stopLoss = round(Math.min(supportLevel.price - volatility * 0.35, entryLow - volatility * 0.8))
  const plannedEntry = (entryLow + entryHigh) / 2
  const takeProfit1 = round(Math.max(resistanceLevel.price, plannedEntry + volatility * 1.5))
  const takeProfit2 = round(Math.max(takeProfit1 + volatility, plannedEntry + volatility * 2.5))
  const riskReward = plannedEntry > stopLoss ? round((takeProfit1 - plannedEntry) / (plannedEntry - stopLoss), 2) : null
  const reasons: string[] = []
  let score = 0
  if (trend === 'BULLISH') { score += 20; reasons.push('EMA 9/21/50 dan harga mendukung tren bullish.') }
  if (trend === 'BEARISH') { score -= 20; reasons.push('EMA dan harga menunjukkan tren bearish.') }
  if (latest.close > currentSma20 && currentSma20 > currentSma50) score += 10
  else if (latest.close < currentSma20 && currentSma20 < currentSma50) score -= 10
  if (macd.trend === 'BULLISH') { score += 18; reasons.push('MACD berada di atas signal dengan histogram positif.') }
  else if (macd.trend === 'BEARISH') { score -= 18; reasons.push('MACD bearish; momentum beli belum terkonfirmasi.') }
  if (macd.crossover === 'BULLISH') score += 8
  if (rsi !== null && rsi >= 48 && rsi <= 68) score += 12
  else if (rsi !== null && rsi > 75) { score -= 15; reasons.push(`RSI ${rsi} tinggi; risiko mengejar harga meningkat.`) }
  else if (rsi !== null && rsi < 35) { score -= 5; reasons.push(`RSI ${rsi} oversold; tunggu pembalikan yang terkonfirmasi.`) }
  if (volumeRatio !== null && volumeRatio >= 1.5) { score += 15; reasons.push(`Volume ${volumeRatio}x rata-rata 20 candle.`) }
  else if (volumeRatio !== null && volumeRatio < 0.7) score -= 8
  if (nearSupport) { score += 8; reasons.push('Harga relatif dekat support teramati.') }
  if (breakout) { score += 15; reasons.push('Candle selesai ditutup di atas resistance dengan volume meningkat.') }
  if (bearishStructure) score -= 18
  if (overheated) score -= 15
  score = clamp(Math.round(score + 50), 0, 100)
  const complete = volumeRatio !== null && rsi !== null && atr !== null
  const decision: TradeDecision = bearishStructure || score < 40 ? 'AVOID' : overheated || !complete ? 'WAIT' : breakout && score >= 78 && (riskReward || 0) >= 1.5 ? 'STRONG BUY' : (nearSupport || breakout) && score >= 62 && (riskReward || 0) >= 1 ? 'BUY WATCH' : 'WAIT'
  if (decision === 'STRONG BUY') reasons.push('Konfirmasi timeframe ini lolos; sinyal kuat tetap memerlukan konfirmasi multi-timeframe.')
  if (decision === 'AVOID') reasons.push('Struktur atau momentum tidak mendukung entry baru.')
  if (!complete) reasons.push('Data indikator belum lengkap untuk memberi sinyal kuat.')

  return {
    trend, ema9, ema21, ema50, sma20, sma50, sma50Period, rsi: rsi ?? 0, macd, volumeAverage: round(volumeAverage, 2), volumeRatio, volumeSpikePct,
    atr: round(volatility), support: supportLevel.price, resistance: resistanceLevel.price, supportTouches: supportLevel.touches, resistanceTouches: resistanceLevel.touches,
    entryLow, entryHigh, stopLoss, takeProfit1, takeProfit2, riskReward, priceChangePct: round(priceChangePct, 2), overheated, score, decision, reasons, candleCount: candles.length, complete
  }
}

export const deriveMultiTimeframeSignal = (analyses: Partial<Record<'1m' | '15m' | '1h' | '1d', TechnicalAnalysis | null>>) => {
  const m1 = analyses['1m']
  const m15 = analyses['15m']
  const h1 = analyses['1h']
  const d1 = analyses['1d']
  if (!m15 && !h1 && !d1) return { score: 0, decision: 'WAIT' as const, bullishCount: 0, bearishCount: 0, reasons: ['Menunggu candle 15m, 1h, dan 1d; timeframe 1m sendiri tidak cukup untuk konsensus.'] }
  const higher = [m15, h1, d1].filter((analysis): analysis is TechnicalAnalysis => Boolean(analysis))
  if (higher.length < 3) return { score: 0, decision: 'WAIT' as const, bullishCount: 0, bearishCount: 0, reasons: ['Analisis belum lengkap: perlu candle 15m, 1h, dan 1d sebelum memberi konsensus.'] }
  const bullishCount = higher.filter((analysis) => analysis.trend === 'BULLISH').length
  const bearishCount = higher.filter((analysis) => analysis.trend === 'BEARISH').length
  const score = Math.round(higher.reduce((sum, analysis) => sum + analysis.score, 0) / higher.length)
  const reasons: string[] = [`Konsensus TF besar: ${bullishCount}/${higher.length} bullish; ${bearishCount}/${higher.length} bearish.`]
  if (d1 && d1.trend === 'BEARISH') reasons.push('Tren harian bearish: setup bullish jangka pendek berisiko counter-trend.')
  if (m1 && m1.trend === 'BEARISH') reasons.push('Momentum 1m bearish; tunggu timing entry lebih baik.')
  if (m1 && m1.trend === 'BULLISH') reasons.push('Momentum 1m mendukung timing, tetapi bukan konfirmasi tren utama.')
  if (m15?.volumeRatio !== null && m15?.volumeRatio !== undefined && m15.volumeRatio >= 1.5) reasons.push('Volume 15m meningkat dibanding baseline.')
  const entryConfirmed = Boolean(m15 && m15.decision !== 'AVOID' && m15.complete)
  const entryRiskReward = m15?.riskReward || 0
  const oneMinuteConfirms = !m1 || m1.trend !== 'BEARISH' && m1.macd.trend !== 'BEARISH'
  const decision: TradeDecision = higher.length === 3 && bullishCount === 3 && score >= 78 && m15?.decision === 'STRONG BUY' && !d1?.overheated && oneMinuteConfirms
    ? 'STRONG BUY'
    : bullishCount >= 2 && score >= 62 && entryConfirmed && entryRiskReward >= 1.5 && bearishCount === 0
      ? 'BUY WATCH'
      : bearishCount >= 2 || score < 40 ? 'AVOID' : 'WAIT'
  if (decision === 'STRONG BUY') reasons.push('TF 15m, 1h, dan 1d bullish dan setup 15m memenuhi breakout, volume, momentum, serta risk/reward.')
  else if (decision === 'BUY WATCH') reasons.push('Mayoritas timeframe besar bullish; tunggu validasi entry dan kelola risiko.')
  else if (decision === 'AVOID') reasons.push('Konflik/tren bearish dominan; hindari sinyal beli baru.')
  return { score, decision, bullishCount, bearishCount, reasons }
}
