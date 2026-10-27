import axios from 'axios'
import {
  calculateNotional,
  calculateOrderBookImbalance,
  calculateTradeImbalance,
  calculateWhaleScore,
  detectBreakoutState,
  detectVolumeSpike,
  determineWhaleCategory,
  WhaleBreakoutState,
  WhaleCategory
} from './whale.js'
import { Candle, ConnectionStatus, EntryPlan, MarketTicker, ScannerSettings, SignalLabel, WhaleAnalysis } from './models.js'

type RawTicker = {
  s: string
  c: string
  P: string
  q: string
}

type ExchangeSymbol = {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  isSpotTradingAllowed?: boolean
}

type RawOrderBook = {
  bids?: Array<[string, string]>
  asks?: Array<[string, string]>
}

const EXCLUDED_BASE_ASSETS = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'XUSD', 'USD1', 'RLUSD', 'U'])

type SocketLike = {
  close(): void
  addEventListener(type: string, listener: (event?: { data?: string }) => void): void
}

const REST_URLS = (process.env.BINANCE_REST_URLS || 'https://data-api.binance.vision,https://api.binance.com,https://api1.binance.com,https://api2.binance.com,https://api3.binance.com')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

const WS_URL = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws/!ticker@arr'
const MAX_ANALYZED_PAIRS = Number(process.env.BINANCE_ANALYZED_PAIR_LIMIT || 100)
const CACHE_MS = Math.min(30000, Math.max(15000, Number(process.env.BINANCE_CACHE_MS || 20000)))
const TIMEOUT_MS = 10000
const FUTURES_URL = process.env.BINANCE_FUTURES_URL || 'https://fapi.binance.com'
const MEME_SYMBOLS = new Set(['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', 'WIFUSDT', 'BONKUSDT', 'MEMEUSDT', 'NEIROUSDT'])
const CHART_INTERVALS = new Set(['1m', '15m', '1h', '4h', '1d'])

const toNumber = (value: unknown) => Number(value) || 0
const round = (value: number, digits = 8) => Number(value.toFixed(digits))
const pct = (current: number, previous: number) => previous > 0 ? round(((current - previous) / previous) * 100, 2) : 0
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

const calculateEma = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((result, value, index) => {
    result.push(index ? value * multiplier + result[index - 1] * (1 - multiplier) : value)
    return result
  }, [])
}

const calculateMacd = (candles: Candle[]) => {
  const closes = candles.map((candle) => candle.close)
  const fast = calculateEma(closes, 12)
  const slow = calculateEma(closes, 26)
  const macdLine = closes.map((_, index) => fast[index] - slow[index])
  const signalLine = calculateEma(macdLine, 9)
  const histogram = macdLine.map((value, index) => value - signalLine[index])
  const latestLine = macdLine[macdLine.length - 1] || 0
  const latestSignal = signalLine[signalLine.length - 1] || 0
  const latestHistogram = histogram[histogram.length - 1] || 0
  const previousHistogram = histogram[histogram.length - 2] || 0
  const trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = latestLine > latestSignal && latestHistogram > 0 ? 'BULLISH' : latestLine < latestSignal && latestHistogram < 0 ? 'BEARISH' : 'NEUTRAL'
  const crossover: 'BULLISH' | 'BEARISH' | 'NONE' = previousHistogram <= 0 && latestHistogram > 0 ? 'BULLISH' : previousHistogram >= 0 && latestHistogram < 0 ? 'BEARISH' : 'NONE'
  return {
    line: round(latestLine),
    signal: round(latestSignal),
    histogram: round(latestHistogram),
    previousHistogram: round(previousHistogram),
    trend,
    crossover
  }
}

const analyzeOrderBook = (book: RawOrderBook, price: number) => {
  const levels = (items: Array<[string, string]> | undefined) => (items || [])
    .map(([levelPrice, quantity]) => {
      const parsedPrice = toNumber(levelPrice)
      const parsedQuantity = toNumber(quantity)
      return { price: parsedPrice, quantity: parsedQuantity, notional: parsedPrice * parsedQuantity }
    })
    .filter((item) => item.price > 0 && item.quantity > 0)

  const bids = levels(book.bids).slice(0, 20)
  const asks = levels(book.asks).slice(0, 20)
  const bidNotional = bids.reduce((sum, item) => sum + item.notional, 0)
  const askNotional = asks.reduce((sum, item) => sum + item.notional, 0)
  const bidAskRatio = askNotional > 0 ? bidNotional / askNotional : 0
  const imbalancePct = bidNotional + askNotional > 0 ? ((bidNotional - askNotional) / (bidNotional + askNotional)) * 100 : 0
  const bidAverage = average(bids.map((item) => item.notional))
  const askAverage = average(asks.map((item) => item.notional))
  const nearestBidWall = bids
    .filter((item) => bidAverage > 0 && item.notional >= bidAverage * 1.8)
    .sort((a, b) => Math.abs(price - a.price) - Math.abs(price - b.price))[0]
  const nearestAskWall = asks
    .filter((item) => askAverage > 0 && item.notional >= askAverage * 1.8)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0]
  const pressure: 'BUY' | 'SELL' | 'BALANCED' = imbalancePct >= 10 ? 'BUY' : imbalancePct <= -10 ? 'SELL' : 'BALANCED'

  return {
    bidNotional: round(bidNotional, 2),
    askNotional: round(askNotional, 2),
    bidAskRatio: round(bidAskRatio, 2),
    imbalancePct: round(imbalancePct, 2),
    nearestBidWallPrice: nearestBidWall ? round(nearestBidWall.price) : null,
    nearestBidWallDistancePct: nearestBidWall ? round(((price - nearestBidWall.price) / price) * 100, 2) : null,
    nearestAskWallPrice: nearestAskWall ? round(nearestAskWall.price) : null,
    nearestAskWallDistancePct: nearestAskWall ? round(((nearestAskWall.price - price) / price) * 100, 2) : null,
    pressure
  }
}

const parseCandle = (item: unknown[]): Candle => ({
  openTime: toNumber(item[0]),
  open: toNumber(item[1]),
  high: toNumber(item[2]),
  low: toNumber(item[3]),
  close: toNumber(item[4]),
  volume: toNumber(item[5]),
  quoteVolume: toNumber(item[7])
})

const calculateRsi = (candles: Candle[], period = 14) => {
  const closes = candles.slice(-(period + 1)).map((candle) => candle.close)
  if (closes.length < period + 1) return 0
  let gains = 0
  let losses = 0
  for (let index = 1; index < closes.length; index += 1) {
    const difference = closes[index] - closes[index - 1]
    if (difference > 0) gains += difference
    else losses += Math.abs(difference)
  }
  if (!losses) return 100
  return round(100 - 100 / (1 + gains / losses), 2)
}

const findLevels = (candles: Candle[], price: number) => {
  const lows = candles.filter((candle, index) => index > 0 && index < candles.length - 1 && candle.low <= candles[index - 1].low && candle.low <= candles[index + 1].low).map((candle) => candle.low)
  const highs = candles.filter((candle, index) => index > 0 && index < candles.length - 1 && candle.high >= candles[index - 1].high && candle.high >= candles[index + 1].high).map((candle) => candle.high)
  const supports = lows.filter((value) => value < price).sort((a, b) => b - a)
  const resistances = highs.filter((value) => value > price).sort((a, b) => a - b)
  return {
    support1: supports[0] || price * 0.97,
    support2: supports[1] || price * 0.94,
    resistance1: resistances[0] || price * 1.03,
    resistance2: resistances[1] || price * 1.06
  }
}

const buildEntryPlan = (price: number, support1: number, support2: number, resistance1: number, resistance2: number) => ({
  earlyEntryLow: round(Math.max(support1, price * 0.992)),
  earlyEntryHigh: round(price * 1.003),
  pullbackEntryLow: round(Math.max(support2, support1 * 0.992)),
  pullbackEntryHigh: round(support1 * 1.008),
  breakoutEntryLow: round(resistance1 * 1.002),
  breakoutEntryHigh: round(resistance1 * 1.012),
  takeProfit1: round(resistance1),
  takeProfit2: round(Math.max(resistance2, resistance1 * 1.025)),
  stopLoss: round(support2 * 0.992)
})

const buildPumpProjection = (
  input: Pick<MarketTicker, 'price' | 'candles' | 'support1' | 'support2' | 'resistance1' | 'resistance2' | 'ma10' | 'ma30' | 'distanceFromMa10Pct' | 'priceChange15m' | 'priceChange1h' | 'relativeVolume' | 'volumeSpikePct' | 'macd' | 'orderBook' | 'rsi15m' | 'score' | 'isOverheated'>,
  entry: EntryPlan
) => {
  const recentCandles = input.candles.slice(-96)
  const recentHigh = recentCandles.length ? Math.max(...recentCandles.map((candle) => candle.high)) : input.resistance2
  const technicalTarget = Math.max(entry.takeProfit2, input.resistance2, input.price * 1.04)
  const reclaimedHighTarget = recentHigh > input.price * 1.08 ? recentHigh : 0
  const extensionTarget = Math.max(technicalTarget * 1.35, input.price * 1.12)
  const stretchTarget = round(Math.max(technicalTarget, reclaimedHighTarget, extensionTarget))
  const closeNearResistance = input.price >= input.resistance1 * 0.985 && input.price < input.resistance1
  const priceAboveEntry = input.price > entry.earlyEntryHigh * 1.01
  const sellerRisk = input.orderBook.pressure === 'SELL' || (input.orderBook.nearestAskWallDistancePct !== null && input.orderBook.nearestAskWallDistancePct <= 0.8)
  const momentumValid = input.score >= 65 && input.macd.trend === 'BULLISH' && input.priceChange1h >= 0 && input.ma10 >= input.ma30
  const chaseRisk = input.isOverheated || input.rsi15m > 72 || input.priceChange15m > 6 || input.distanceFromMa10Pct > 7 || sellerRisk
  const pullbackLow = round(Math.max(input.support1, input.ma10 * 0.995))
  const pullbackHigh = round(Math.min(input.price * 0.995, Math.max(input.support1 * 1.008, input.ma10 * 1.01)))
  const breakoutLow = round(input.resistance1 * 1.002)
  const breakoutHigh = round(input.resistance1 * 1.012)
  let action: 'ENTER_NOW' | 'WAIT_PULLBACK' | 'WAIT_BREAKOUT' | 'AVOID' = 'WAIT_BREAKOUT'
  let entryType: 'MARKET_CONFIRMATION' | 'PULLBACK' | 'BREAKOUT' | 'NO_TRADE' = 'BREAKOUT'
  let entryLow: number | null = breakoutLow
  let entryHigh: number | null = breakoutHigh
  let triggerPrice: number | null = breakoutLow
  const invalidationPrice = round(Math.min(input.support2, input.ma30) * 0.992)
  const stopLoss = round(Math.max(invalidationPrice, input.support1 * 0.975))

  if (input.score < 50 || input.macd.trend === 'BEARISH' || input.priceChange1h < -1 || input.price < input.support1 * 0.99) {
    action = 'AVOID'
    entryType = 'NO_TRADE'
    entryLow = null
    entryHigh = null
    triggerPrice = null
  } else if (chaseRisk || priceAboveEntry) {
    action = 'WAIT_PULLBACK'
    entryType = 'PULLBACK'
    entryLow = pullbackLow
    entryHigh = pullbackHigh
    triggerPrice = pullbackHigh
  } else if (momentumValid && input.price >= entry.earlyEntryLow && input.price <= entry.earlyEntryHigh && !closeNearResistance) {
    action = 'ENTER_NOW'
    entryType = 'MARKET_CONFIRMATION'
    entryLow = round(input.price * 0.997)
    entryHigh = round(input.price * 1.003)
    triggerPrice = input.price
  } else {
    action = 'WAIT_BREAKOUT'
    entryType = 'BREAKOUT'
    entryLow = breakoutLow
    entryHigh = breakoutHigh
    triggerPrice = breakoutLow
  }

  const confirmations = [
    input.macd.trend === 'BULLISH' || input.macd.crossover === 'BULLISH',
    input.orderBook.pressure === 'BUY' && input.orderBook.bidAskRatio >= 1.15,
    input.relativeVolume >= 1.5 || input.volumeSpikePct >= 100,
    input.rsi15m >= 45 && input.rsi15m <= 72,
    !input.isOverheated
  ].filter(Boolean).length
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = confirmations >= 4 ? 'HIGH' : confirmations >= 2 ? 'MEDIUM' : 'LOW'
  const label: 'BREAKOUT TARGET' | 'RECLAIM TARGET' | 'WAIT CONFIRMATION' = confidence === 'HIGH'
    ? 'BREAKOUT TARGET'
    : confidence === 'MEDIUM'
      ? 'RECLAIM TARGET'
      : 'WAIT CONFIRMATION'
  const plannedEntry = entryLow !== null && entryHigh !== null ? average([entryLow, entryHigh]) : input.price
  const takeProfit1 = round(Math.max(input.resistance1, plannedEntry * 1.025))
  const takeProfit2 = round(Math.max(input.resistance2, takeProfit1 * 1.035))
  const takeProfit3 = confidence === 'HIGH' && action !== 'AVOID' ? stretchTarget : null
  const riskRewardToTp1 = plannedEntry > stopLoss && takeProfit1 > plannedEntry ? round((takeProfit1 - plannedEntry) / (plannedEntry - stopLoss), 2) : null
  const reasons: string[] = []

  if (reclaimedHighTarget) reasons.push('Target stretch memakai high lokal sebelumnya sebagai area reclaim.')
  else reasons.push('Target stretch memakai ekstensi breakout karena high lokal belum cukup jauh.')
  if (input.macd.crossover === 'BULLISH') reasons.push('MACD baru memberi bullish crossover.')
  else if (input.macd.trend === 'BULLISH') reasons.push('MACD masih mendukung momentum bullish.')
  else reasons.push('MACD belum bullish penuh, tunggu konfirmasi lanjutan.')
  if (input.orderBook.pressure === 'BUY') reasons.push(`Order book mendukung buyer dengan bid/ask ${input.orderBook.bidAskRatio}x.`)
  if (input.orderBook.pressure === 'SELL') reasons.push('Order book masih condong seller, target agresif lebih berisiko.')
  if (input.isOverheated) reasons.push('Kondisi overheated, projection agresif sebaiknya tidak dikejar.')
  if (action === 'ENTER_NOW') reasons.push('Entry hanya valid selama harga bertahan dalam zona entry dan candle 15m tidak breakdown.')
  if (action === 'WAIT_PULLBACK') reasons.push('Harga/risk sudah kurang ideal untuk dikejar; tunggu pullback ke zona entry.')
  if (action === 'WAIT_BREAKOUT') reasons.push('Belum ada entry langsung; tunggu breakout resistance dengan candle 15m close di atas trigger.')
  if (action === 'AVOID') reasons.push('Setup tidak valid untuk entry baru sampai momentum dan struktur membaik.')

  return {
    basePrice: input.price,
    technicalTarget: round(technicalTarget),
    stretchTarget,
    upsideToTechnicalPct: pct(technicalTarget, input.price),
    upsideToStretchPct: pct(stretchTarget, input.price),
    confidence,
    label,
    action,
    entryType,
    entryLow,
    entryHigh,
    triggerPrice,
    invalidationPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    riskRewardToTp1,
    entryNote: action === 'ENTER_NOW'
      ? `Entry bertahap di ${round(input.price * 0.997)}-${round(input.price * 1.003)} selama MACD tetap bullish dan order book tidak berubah SELL.`
      : action === 'WAIT_PULLBACK'
        ? `Tunggu harga turun dan stabil di ${entryLow}-${entryHigh}; hindari beli saat candle masih turun cepat.`
        : action === 'WAIT_BREAKOUT'
          ? `Entry hanya setelah candle 15m close di atas ${triggerPrice} dengan volume tetap naik.`
          : 'Tidak ada entry baru; tunggu sinyal berubah minimal menjadi BUY WATCH dengan MACD tidak bearish.',
    takeProfitNote: takeProfit3
      ? `Ambil sebagian di TP1, sisakan sebagian ke TP2, dan gunakan trailing stop jika mengejar TP3/stretch.`
      : 'Ambil sebagian di TP1 dan evaluasi ulang di TP2; target stretch belum layak dipakai sebagai rencana utama.',
    reasons
  }
}

const applyHigherTimeframeConfirmation = (signal: { score: number; signal: SignalLabel; isEarlyPump: boolean; isOverheated: boolean; reasons: string[] }, candles1h: Candle[], candles1d: Candle[]) => {
  const trend = (candles: Candle[]) => {
    const closes = candles.map((candle) => candle.close)
    const ma20 = average(closes.slice(-20))
    const ma50 = average(closes.slice(-50))
    const latest = closes[closes.length - 1]
    return latest > ma20 && ma20 > ma50 ? 'BULLISH' : latest < ma20 && ma20 < ma50 ? 'BEARISH' : 'SIDEWAYS'
  }
  const trend1h = trend(candles1h)
  const trend1d = trend(candles1d)
  let score = signal.score
  const reasons = [...signal.reasons]
  if (trend1h === 'BULLISH') { score += 5; reasons.push('Konfirmasi tren 1H bullish') }
  if (trend1d === 'BULLISH') { score += 8; reasons.push('Konfirmasi tren 1D bullish') }
  if (trend1h === 'BEARISH') { score -= 12; reasons.push('Momentum 15m melawan tren 1H bearish') }
  if (trend1d === 'BEARISH') { score -= 18; reasons.push('Counter trend: arah besar 1D masih bearish') }
  score = Math.max(0, Math.min(100, score))
  let label: SignalLabel = score >= 90 ? 'STRONG BUY' : score >= 80 ? 'BREAKOUT' : score >= 65 ? 'BUY WATCH' : score >= 50 ? 'WAIT' : 'AVOID'
  if (signal.isOverheated) label = 'OVERHEATED'
  return { ...signal, score, signal: label, reasons }
}

const evaluateWhaleActivity = (input: Pick<MarketTicker, 'price' | 'volume15m' | 'volume24h' | 'volumeSpikePct' | 'relativeVolume' | 'orderBook' | 'candles' | 'support1' | 'priceChange15m' | 'priceChange1h'>): WhaleAnalysis => {
  const previousCandles = input.candles.slice(-20, -1)
  const pastVolume = previousCandles.length ? average(previousCandles.map((candle) => candle.quoteVolume)) : input.volume15m
  const volumeSpike = detectVolumeSpike(input.volume15m, pastVolume)
  const bidVolume = input.orderBook.pressure === 'BUY' ? input.volume15m * (0.65 + Math.max(input.orderBook.imbalancePct, 0) / 100) : input.volume15m * 0.5
  const askVolume = input.orderBook.pressure === 'SELL' ? input.volume15m * (0.65 + Math.abs(Math.min(input.orderBook.imbalancePct, 0)) / 100) : input.volume15m * 0.5
  const tradeImbalance = calculateTradeImbalance(bidVolume, askVolume)
  const orderBookImbalance = calculateOrderBookImbalance(input.orderBook.bidNotional, input.orderBook.askNotional)
  const netTakerFlow = Math.min(1, Math.max(-1, tradeImbalance * (volumeSpike.volumeRatio >= 1.5 ? 1.15 : 0.85)))
  const notionalPressure = calculateNotional(input.price, Math.max(input.volume15m * (input.relativeVolume > 1 ? 0.35 : 0.15), 1))
  const largeTradeActivity = clamp(Math.min(1, (notionalPressure / Math.max(input.volume24h * input.price, 1)) * 18 + Math.max(0, input.relativeVolume - 1) * 0.2), 0, 1)
  const consistency = clamp((input.priceChange15m >= 0 ? 0.4 : 0) + (input.priceChange1h >= 0 ? 0.5 : 0) + (input.relativeVolume >= 1.2 ? 0.2 : 0), 0, 1)
  const dataQuality = clamp((input.volume15m > 0 ? 0.4 : 0) + (input.orderBook.bidNotional > 0 && input.orderBook.askNotional > 0 ? 0.4 : 0) + (input.candles.length >= 30 ? 0.2 : 0), 0, 1)
  const whaleScore = calculateWhaleScore({
    largeTradeActivity,
    volumeSpikeRatio: volumeSpike.volumeRatio,
    tradeImbalance,
    orderBookImbalance,
    netTakerFlow,
    consistency,
    dataQuality
  })
  const breakoutState: WhaleBreakoutState = detectBreakoutState({
    whaleScore,
    price: input.price,
    resistance: input.support1 * 1.02,
    volumeSpikeRatio: volumeSpike.volumeRatio,
    netTakerFlow,
    orderBookImbalance,
    priceNearResistancePct: Math.abs(input.price - (input.support1 * 1.02)) / (input.support1 * 1.02) * 100,
    dataQuality,
    invalidationPressure: input.orderBook.pressure === 'SELL' ? 0.7 : 0.22,
    confirmed: input.priceChange15m > 1.5 && input.relativeVolume >= 1.5,
    failed: input.orderBook.pressure === 'SELL' && input.priceChange15m < -0.5
  })
  const reasons: string[] = []
  if (volumeSpike.level !== 'normal') reasons.push(`Volume ${volumeSpike.level} dengan ratio ${volumeSpike.volumeRatio}x terhadap baseline 20 candle.`)
  if (tradeImbalance > 0.15) reasons.push(`Trade imbalance bullish ${tradeImbalance.toFixed(2)} menunjukkan tekanan beli lebih dominan.`)
  if (tradeImbalance < -0.15) reasons.push(`Trade imbalance bearish ${tradeImbalance.toFixed(2)} menunjukkan tekanan jual lebih dominan.`)
  if (orderBookImbalance > 0.1) reasons.push(`Order book imbalance ${orderBookImbalance.toFixed(2)} menunjukkan bid lebih kuat dari ask.`)
  if (breakoutState === 'EARLY_WHALE_ALERT') reasons.push('Whale flow mendukung akumulasi awal dekat resistance kandidat.')
  if (breakoutState === 'BREAKOUT_CONFIRMED') reasons.push('Breakout terkonfirmasi oleh volume, whale flow, dan momentum yang konsisten.')
  if (breakoutState === 'FAILED_BREAKOUT' || breakoutState === 'DISTRIBUTION_ALERT') reasons.push('Breakout gagal atau distribusi muncul di level resistance, sinyal perlu diwaspadai.')
  const category: WhaleCategory = determineWhaleCategory(whaleScore)
  return {
    whaleScore,
    category,
    breakoutState,
    largeTradeActivity: round(largeTradeActivity, 3),
    volumeSpikeRatio: round(volumeSpike.volumeRatio, 3),
    tradeImbalance: round(tradeImbalance, 3),
    orderBookImbalance: round(orderBookImbalance, 3),
    netTakerFlow: round(netTakerFlow, 3),
    consistency: round(consistency, 3),
    dataQuality: round(dataQuality, 3),
    reasons
  }
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum)

const buildSignal = (input: Omit<MarketTicker, 'score' | 'signal' | 'isEarlyPump' | 'isOverheated' | 'reasons' | 'entry' | 'estimatedUpsideLowPct' | 'estimatedUpsideHighPct' | 'pumpProjection' | 'openInterest' | 'whale'>) => {
  const reasons: string[] = []
  const vertical15m = input.priceChange15m > 10
  const isOverheated = input.priceChange24h > 30 || vertical15m || input.distanceFromMa10Pct > 12 || input.rsi15m > 75
  const recentCandles = input.candles.slice(-5)
  const latest = recentCandles[recentCandles.length - 1]
  const previous = recentCandles[recentCandles.length - 2]
  const hadPullback = recentCandles.slice(0, -1).some((candle) => candle.close < input.ma10 || candle.low < input.ma10)
  const reclaimingMa10 = latest.close >= input.ma10 * 0.995 && latest.close <= input.ma10 * 1.035
  const reboundCandle = latest.close > latest.open && latest.close > previous.close
  const candleRange = Math.max(latest.high - latest.low, latest.close * 0.000001)
  const candleBody = Math.abs(latest.close - latest.open)
  const upperWick = latest.high - Math.max(latest.open, latest.close)
  const closeNearHigh = (latest.high - latest.close) / candleRange <= 0.25
  const upperWickRisk = upperWick > candleBody * 1.5 && upperWick / candleRange > 0.35
  const liquidEnough = input.volume24h >= 500000
  const orderlyVolume = input.relativeVolume <= 12 && input.volumeSpikePct <= 1500
  const volumeWarming = input.volumeSpikePct >= 25 && input.volumeSpikePct < 150 && input.relativeVolume >= 1.05
  const macdTurningUp = input.macd.histogram > input.macd.previousHistogram && input.macd.trend !== 'BEARISH'
  const buyerAbsorption = input.orderBook.pressure !== 'SELL' && input.orderBook.imbalancePct >= -5
  const quietReclaim = input.priceChange15m >= -0.15 && input.priceChange15m <= 2.2 && input.priceChange1h >= -0.25 && input.priceChange24h <= 12 && input.distanceFromMa10Pct >= -0.8 && input.distanceFromMa10Pct <= 3.8
  const earlySetup = hadPullback && reclaimingMa10 && reboundCandle && input.priceChange15m >= 0.15 && input.priceChange15m < 2.5 && input.priceChange24h < 18 && input.relativeVolume >= 1.15 && input.rsi15m >= 42 && input.rsi15m <= 68
  const prePumpSetup = quietReclaim && volumeWarming && macdTurningUp && buyerAbsorption && input.rsi15m >= 43 && input.rsi15m <= 66
  const isEarlyPump = earlySetup || prePumpSetup || (input.priceChange15m >= 2 && input.priceChange15m <= 8 && input.priceChange24h <= 25 && input.volumeSpikePct >= 150 && input.relativeVolume > 2 && input.ma10 > input.ma30 && input.rsi15m >= 50 && input.rsi15m <= 70 && input.distanceFromMa10Pct <= 8)
  let score = 0

  if (earlySetup) { score += 35; reasons.push('Early setup: harga rebound setelah pullback dan mulai reclaim MA10') }
  if (prePumpSetup) { score += 32; reasons.push('Pre-pump setup: volume mulai hangat, MACD membaik, dan order book tidak menekan seller') }
  if (earlySetup && input.relativeVolume >= 1.15) { score += 10; reasons.push(`Volume mulai tumbuh ${round(input.relativeVolume, 2)}x sebelum candle vertikal`) }
  if (volumeWarming) { score += 12; reasons.push(`Volume warming ${round(input.volumeSpikePct, 1)}% dengan relative volume ${round(input.relativeVolume, 2)}x`) }
  if (quietReclaim) { score += 10; reasons.push('Harga masih dekat MA10/support sehingga belum terlalu terlambat') }
  if (input.volumeSpikePct > 150) { score += 25; reasons.push(`Volume 15m naik ${round(input.volumeSpikePct, 1)}%`) }
  if (input.priceChange15m >= 2 && input.priceChange15m <= 8) { score += 20; reasons.push(`Harga baru naik ${input.priceChange15m}% dalam 15 menit dan ${input.priceChange24h}% dalam 24 jam`) }
  if (input.relativeVolume > 2) { score += 15; reasons.push(`Relative volume ${round(input.relativeVolume, 2)}x`) }
  if (input.ma10 > input.ma30) { score += 15; reasons.push('MA10 berada di atas MA30') }
  if (input.rsi15m >= 50 && input.rsi15m <= 70) { score += 10; reasons.push(`RSI 15m sehat di ${input.rsi15m}`) }
  if (input.price >= input.resistance1) { score += 10; reasons.push('Harga breakout resistance lokal') }
  if (input.priceChange1h >= 0.5 && input.priceChange1h <= 12) { score += 8; reasons.push(`Momentum 1 jam sehat di ${input.priceChange1h}%`) }
  if (latest.close > latest.open && closeNearHigh) { score += 7; reasons.push('Candle ditutup dekat high tanpa rejection besar') }
  if (liquidEnough) { score += 5; reasons.push('Likuiditas volume 24 jam memadai') }
  if (input.macd.crossover === 'BULLISH') { score += 14; reasons.push('MACD 15m bullish crossover') }
  else if (input.macd.trend === 'BULLISH') { score += 10; reasons.push('MACD 15m berada di area bullish') }
  if (input.macd.histogram > input.macd.previousHistogram && input.macd.histogram > 0) { score += 6; reasons.push('Histogram MACD menguat') }
  if (input.orderBook.pressure === 'BUY' && input.orderBook.bidAskRatio >= 1.2) { score += 12; reasons.push(`Order book condong buyer: bid/ask ${input.orderBook.bidAskRatio}x`) }
  if (input.orderBook.nearestBidWallDistancePct !== null && input.orderBook.nearestBidWallDistancePct <= 1) { score += 6; reasons.push('Bid wall dekat harga memberi support order book') }

  if (input.priceChange24h > 30) { score -= 25; reasons.push('24h sudah naik lebih dari 30%') }
  if (input.priceChange24h < -5) { score -= 15; reasons.push('Trend 24h masih negatif') }
  if (input.priceChange1h < 0) { score -= 15; reasons.push('Momentum 1 jam masih negatif') }
  if (input.distanceFromMa10Pct > 12) { score -= 20; reasons.push('Harga terlalu jauh dari MA10') }
  if (input.distanceFromMa10Pct < -2) { score -= 15; reasons.push('Harga masih berada cukup jauh di bawah MA10') }
  if (input.rsi15m > 75) { score -= 15; reasons.push('RSI di atas 75') }
  if (input.volumeSpikePct > 150 && input.priceChange15m < 0.5) { score -= 15; reasons.push('Volume besar tetapi harga belum ikut naik') }
  if (!liquidEnough) { score -= 20; reasons.push('Volume 24 jam terlalu rendah untuk sinyal berkualitas') }
  if (!orderlyVolume) { score -= 15; reasons.push('Lonjakan volume terlalu ekstrem dan rawan distribusi') }
  if (upperWickRisk) { score -= 20; reasons.push('Wick atas besar menunjukkan rejection') }
  if (input.macd.crossover === 'BEARISH') { score -= 18; reasons.push('MACD 15m bearish crossover') }
  else if (input.macd.trend === 'BEARISH') { score -= 10; reasons.push('MACD 15m masih bearish') }
  if (input.orderBook.pressure === 'SELL') { score -= 12; reasons.push(`Order book condong seller: imbalance ${input.orderBook.imbalancePct}%`) }
  if (input.orderBook.nearestAskWallDistancePct !== null && input.orderBook.nearestAskWallDistancePct <= 1) { score -= 8; reasons.push('Ask wall dekat harga dapat menahan kenaikan') }

  const whale = evaluateWhaleActivity(input)
  if (whale.whaleScore >= 75) { score += 10; reasons.push(`Whale score ${whale.whaleScore} memperkuat bias bullish dan menunjukkan aktivitas akumulasi.`) }
  else if (whale.whaleScore >= 60) { score += 5; reasons.push(`Whale score ${whale.whaleScore} mulai membangun tekanan beli yang masuk akal.`) }
  else if (whale.whaleScore <= 39) { score -= 10; reasons.push(`Whale score ${whale.whaleScore} belum meyakinkan dan belum cukup kuat untuk breakout.`) }
  if (whale.breakoutState === 'FAILED_BREAKOUT' || whale.breakoutState === 'DISTRIBUTION_ALERT' || whale.breakoutState === 'SIGNAL_INVALIDATED') {
    score -= 18
    reasons.push(`Breakout state ${whale.breakoutState} menandakan invalidasi atau distribusi yang perlu diwaspadai.`)
  }
  if (whale.breakoutState === 'BREAKOUT_CONFIRMED') {
    score += 12
    reasons.push('Whale flow kenaikan dan order book terkonfirmasi mendukung breakout yang valid.')
  }
  score = Math.max(0, Math.min(100, score))

  let signal: SignalLabel = earlySetup && score >= 45 ? 'EARLY SETUP' : score >= 90 ? 'STRONG BUY' : score >= 80 ? 'BREAKOUT' : score >= 65 ? 'BUY WATCH' : score >= 50 ? (input.price < input.ma10 ? 'PULLBACK' : 'WAIT') : 'AVOID'
  if (isOverheated) signal = 'OVERHEATED'
  return { score, signal, isEarlyPump, isOverheated, reasons }
}

export class BinanceRealtimeService {
  private tickerMap = new Map<string, RawTicker>()
  private tradingSymbols = new Set<string>()
  private analysisCache = new Map<string, { expiresAt: number; ticker: MarketTicker }>()
  private openInterestCache = new Map<string, { expiresAt: number; value: number | null }>()
  private socket: SocketLike | null = null
  private socketConnected = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private status: ConnectionStatus = 'DISCONNECTED'
  private restConnected = false
  private error: string | null = null
  private lastUpdated: string | null = null

  start() {
    this.connectWebSocket()
  }

  getConnection() {
    return { status: this.status, error: this.error, lastUpdated: this.lastUpdated, restConnected: this.restConnected, websocketConnected: this.socketConnected }
  }

  async scan(watchlist: string[] = [], settings?: ScannerSettings) {
    try {
      if (!this.tickerMap.size) await this.bootstrapTickers()
      const candidates = this.selectCandidates(watchlist, settings)
      const results: MarketTicker[] = []
      for (let offset = 0; offset < candidates.length; offset += 8) {
        const chunk = candidates.slice(offset, offset + 8)
        const analyzed = await Promise.all(chunk.map((ticker) => this.analyzeTicker(ticker, false, settings)))
        results.push(...analyzed.filter((ticker): ticker is MarketTicker => Boolean(ticker)))
      }
      if (candidates.length && !results.length) {
        throw new Error('Binance klines gagal diambil. Scanner dikosongkan.')
      }
      this.restConnected = true
      this.status = 'CONNECTED'
      this.error = null
      this.lastUpdated = new Date().toISOString()
      return results.sort((a, b) => b.score - a.score)
    } catch (error) {
      this.status = 'ERROR'
      this.restConnected = false
      this.error = (error as Error).message
      return []
    }
  }

  async getCoin(symbol: string) {
    const ticker = this.tickerMap.get(symbol.toUpperCase())
    return ticker ? this.analyzeTicker(ticker, true) : null
  }

  async getKlines(symbol: string, interval: string, limit = 200) {
    const normalizedSymbol = symbol.toUpperCase()
    if (!CHART_INTERVALS.has(interval)) throw new Error('Timeframe chart tidak valid.')
    if (!this.tradingSymbols.has(normalizedSymbol)) await this.bootstrapTickers()
    if (!this.tradingSymbols.has(normalizedSymbol)) throw new Error('Pair USDT tidak ditemukan atau tidak aktif di Binance.')
    const normalizedLimit = Math.min(500, Math.max(50, limit))
    const response = await this.request('/api/v3/klines', { symbol: normalizedSymbol, interval, limit: normalizedLimit })
    const candles = Array.isArray(response.data) ? (response.data as unknown[][]).map(parseCandle) : []
    if (!candles.length) throw new Error('Binance tidak mengembalikan candle untuk chart.')
    return candles
  }

  private connectWebSocket() {
    try {
      const WebSocketClient = (globalThis as typeof globalThis & { WebSocket: new (url: string) => SocketLike }).WebSocket
      if (!WebSocketClient) throw new Error('WebSocket runtime tidak tersedia')
      this.socket = new WebSocketClient(WS_URL)
      this.socket.addEventListener('open', () => {
        this.socketConnected = true
        if (this.restConnected) this.status = 'CONNECTED'
        this.error = null
      })
      this.socket.addEventListener('message', (event) => {
        const payload = JSON.parse(String(event?.data || '[]')) as RawTicker[]
        for (const ticker of payload) {
          if (ticker.s?.endsWith('USDT') && this.tradingSymbols.has(ticker.s)) this.tickerMap.set(ticker.s, ticker)
        }
        this.lastUpdated = new Date().toISOString()
      })
      const reconnect = () => {
        this.socketConnected = false
        if (!this.restConnected) this.status = 'DISCONNECTED'
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connectWebSocket()
          }, 5000)
        }
      }
      this.socket.addEventListener('close', reconnect)
      this.socket.addEventListener('error', reconnect)
    } catch (error) {
      this.status = 'ERROR'
      this.error = (error as Error).message
    }
  }

  private async request(path: string, params?: Record<string, string | number>) {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const baseUrl of REST_URLS) {
        try {
          return await axios.get(`${baseUrl}${path}`, { params, timeout: TIMEOUT_MS })
        } catch (error) {
          lastError = error
        }
      }
    }
    throw new Error(`Binance API gagal setelah 3 percobaan: ${(lastError as Error)?.message || 'unknown error'}`)
  }

  private async bootstrapTickers() {
    const [tickerResponse, exchangeInfoResponse] = await Promise.all([
      this.request('/api/v3/ticker/24hr'),
      this.request('/api/v3/exchangeInfo')
    ])
    const exchangeSymbols: ExchangeSymbol[] = Array.isArray(exchangeInfoResponse.data?.symbols) ? exchangeInfoResponse.data.symbols : []
    this.tradingSymbols = new Set(
      exchangeSymbols
        .filter((item) => item.status === 'TRADING' && item.quoteAsset === 'USDT' && item.isSpotTradingAllowed !== false && !EXCLUDED_BASE_ASSETS.has(item.baseAsset))
        .map((item) => item.symbol)
    )
    const tickers = Array.isArray(tickerResponse.data) ? tickerResponse.data : []
    for (const item of tickers) {
      if (this.tradingSymbols.has(item.symbol)) {
        this.tickerMap.set(item.symbol, { s: item.symbol, c: item.lastPrice, P: item.priceChangePercent, q: item.quoteVolume })
      }
    }
    if (!this.tickerMap.size) throw new Error('Binance tidak mengembalikan pair USDT berstatus TRADING')
  }

  private selectCandidates(watchlist: string[], settings?: ScannerSettings) {
    const all = [...this.tickerMap.values()]
    const bySymbol = new Map<string, RawTicker>()
    const topVolumeLimit = settings?.includeLowMarketCapCoins ? Math.round(MAX_ANALYZED_PAIRS * 0.75) : MAX_ANALYZED_PAIRS
    const topVolume = [...all].sort((a, b) => toNumber(b.q) - toNumber(a.q)).slice(0, topVolumeLimit)
    const movers = all.filter((ticker) => toNumber(ticker.P) > 0.5 && toNumber(ticker.P) < 30).sort((a, b) => toNumber(b.P) - toNumber(a.P)).slice(0, MAX_ANALYZED_PAIRS)
    for (const ticker of [...topVolume, ...movers]) bySymbol.set(ticker.s, ticker)
    if (settings?.includeLowMarketCapCoins) {
      const lowerLiquidityMovers = all.filter((ticker) => toNumber(ticker.P) > 1 && toNumber(ticker.q) > 50000).sort((a, b) => toNumber(b.P) - toNumber(a.P)).slice(0, 50)
      for (const ticker of lowerLiquidityMovers) bySymbol.set(ticker.s, ticker)
    }
    if (settings?.includeMemeCoins) {
      for (const symbol of MEME_SYMBOLS) {
        const ticker = this.tickerMap.get(symbol)
        if (ticker) bySymbol.set(symbol, ticker)
      }
    }
    for (const symbol of watchlist) {
      const normalized = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`
      const ticker = this.tickerMap.get(normalized)
      if (ticker) bySymbol.set(normalized, ticker)
    }
    return [...bySymbol.values()].slice(0, MAX_ANALYZED_PAIRS + 50)
  }

  private async analyzeTicker(raw: RawTicker, force = false, settings?: ScannerSettings): Promise<MarketTicker | null> {
    const cached = this.analysisCache.get(raw.s)
    if (!force && cached && cached.expiresAt > Date.now()) return cached.ticker
    try {
      const [candles15mResponse, candles5mResponse, depthResponse] = await Promise.all([
        this.request('/api/v3/klines', { symbol: raw.s, interval: '15m', limit: 100 }),
        this.request('/api/v3/klines', { symbol: raw.s, interval: '5m', limit: 2 }),
        this.request('/api/v3/depth', { symbol: raw.s, limit: 100 })
      ])
      const candles = (candles15mResponse.data as unknown[][]).map(parseCandle)
      const candles5m = (candles5mResponse.data as unknown[][]).map(parseCandle)
      if (candles.length < 31 || candles5m.length < 2) return null
      if (settings?.includeNewListings === false && candles.length < 100) return null
      const latest = candles[candles.length - 1]
      const price = toNumber(raw.c) || latest.close
      const volume15m = latest.quoteVolume
      const volume1h = candles.slice(-4).reduce((sum, candle) => sum + candle.quoteVolume, 0)
      const baselineVolumes = candles.slice(-24, -4).map((candle) => candle.quoteVolume)
      const baseline15m = average(baselineVolumes)
      const relativeVolume = baseline15m > 0 ? volume15m / baseline15m : 0
      const volumeSpikePct = baseline15m > 0 ? ((volume15m - baseline15m) / baseline15m) * 100 : 0
      const ma10 = average(candles.slice(-10).map((candle) => candle.close))
      const ma30 = average(candles.slice(-30).map((candle) => candle.close))
      const levels = findLevels(candles, price)
      const macd = calculateMacd(candles)
      const orderBook = analyzeOrderBook(depthResponse.data as RawOrderBook, price)
      const base = {
        symbol: raw.s,
        price: round(price),
        priceChange5m: pct(candles5m[1].close, candles5m[0].close),
        priceChange15m: pct(latest.close, candles[candles.length - 2].close),
        priceChange1h: pct(latest.close, candles[candles.length - 5].close),
        priceChange24h: round(toNumber(raw.P), 2),
        volume15m: round(volume15m, 2),
        volume1h: round(volume1h, 2),
        volume24h: round(toNumber(raw.q), 2),
        volumeSpikePct: round(volumeSpikePct, 2),
        relativeVolume: round(relativeVolume, 2),
        rsi15m: calculateRsi(candles),
        ma10: round(ma10),
        ma30: round(ma30),
        distanceFromMa10Pct: pct(price, ma10),
        macd,
        orderBook,
        support1: round(levels.support1),
        support2: round(levels.support2),
        resistance1: round(levels.resistance1),
        resistance2: round(levels.resistance2),
        candles,
        updatedAt: new Date().toISOString()
      }
      let signal = buildSignal(base)
      if (signal.score >= 65) {
        try {
          const [candles1hResponse, candles1dResponse] = await Promise.all([
            this.request('/api/v3/klines', { symbol: raw.s, interval: '1h', limit: 60 }),
            this.request('/api/v3/klines', { symbol: raw.s, interval: '1d', limit: 60 })
          ])
          const candles1h = (candles1hResponse.data as unknown[][]).map(parseCandle)
          const candles1d = (candles1dResponse.data as unknown[][]).map(parseCandle)
          if (candles1h.length >= 50 && candles1d.length >= 50) signal = applyHigherTimeframeConfirmation(signal, candles1h, candles1d)
        } catch {
          signal = { ...signal, score: Math.max(0, signal.score - 10), reasons: [...signal.reasons, 'Konfirmasi multi-timeframe gagal diambil; score dikurangi'] }
        }
      }
      const entry = buildEntryPlan(price, levels.support1, levels.support2, levels.resistance1, levels.resistance2)
      const pumpProjection = buildPumpProjection({ ...base, ...signal }, entry)
      const openInterest = signal.score >= 55 ? await this.fetchOpenInterest(raw.s) : null
      const whale = evaluateWhaleActivity(base)
      const ticker: MarketTicker = {
        ...base,
        ...signal,
        entry,
        estimatedUpsideLowPct: pct(entry.takeProfit1, price),
        estimatedUpsideHighPct: pct(entry.takeProfit2, price),
        pumpProjection,
        openInterest,
        whale
      }
      this.analysisCache.set(raw.s, { expiresAt: Date.now() + CACHE_MS, ticker })
      return ticker
    } catch {
      return null
    }
  }

  private async fetchOpenInterest(symbol: string): Promise<number | null> {
    const cached = this.openInterestCache.get(symbol)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    try {
      const response = await axios.get(`${FUTURES_URL}/fapi/v1/openInterest`, {
        params: { symbol },
        timeout: 3000
      })
      const value = Number(response.data?.openInterest)
      const normalized = Number.isFinite(value) ? value : null
      this.openInterestCache.set(symbol, { expiresAt: Date.now() + 5 * 60 * 1000, value: normalized })
      return normalized
    } catch {
      this.openInterestCache.set(symbol, { expiresAt: Date.now() + 5 * 60 * 1000, value: null })
      return null
    }
  }
}
