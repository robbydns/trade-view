export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
export type SignalLabel = 'EARLY SETUP' | 'BUY WATCH' | 'STRONG BUY' | 'BREAKOUT' | 'PULLBACK' | 'WAIT' | 'OVERHEATED' | 'AVOID'
export type HistoryStatus = 'ACTIVE' | 'EXPIRED' | 'OVERHEATED'
export type WhaleBreakoutState = 'EARLY_WHALE_ALERT' | 'BREAKOUT_CONFIRMED' | 'FAILED_BREAKOUT' | 'DISTRIBUTION_ALERT' | 'SIGNAL_INVALIDATED' | 'WAIT'
export type WhaleCategory = 'not-convincing' | 'activity-rising' | 'possible-accumulation' | 'strong-whale-activity'

export interface Candle {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  quoteVolume: number
}

export interface EntryPlan {
  earlyEntryLow: number
  earlyEntryHigh: number
  pullbackEntryLow: number
  pullbackEntryHigh: number
  breakoutEntryLow: number
  breakoutEntryHigh: number
  takeProfit1: number
  takeProfit2: number
  stopLoss: number
}

export interface MacdAnalysis {
  line: number
  signal: number
  histogram: number
  previousHistogram: number
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  crossover: 'BULLISH' | 'BEARISH' | 'NONE'
}

export interface OrderBookAnalysis {
  bidNotional: number
  askNotional: number
  bidAskRatio: number
  imbalancePct: number
  nearestBidWallPrice: number | null
  nearestBidWallDistancePct: number | null
  nearestAskWallPrice: number | null
  nearestAskWallDistancePct: number | null
  pressure: 'BUY' | 'SELL' | 'BALANCED'
}

export interface PumpProjection {
  basePrice: number
  technicalTarget: number
  stretchTarget: number
  upsideToTechnicalPct: number
  upsideToStretchPct: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  label: 'BREAKOUT TARGET' | 'RECLAIM TARGET' | 'WAIT CONFIRMATION'
  action: 'ENTER_NOW' | 'WAIT_PULLBACK' | 'WAIT_BREAKOUT' | 'AVOID'
  entryType: 'MARKET_CONFIRMATION' | 'PULLBACK' | 'BREAKOUT' | 'NO_TRADE'
  entryLow: number | null
  entryHigh: number | null
  triggerPrice: number | null
  invalidationPrice: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  takeProfit3: number | null
  riskRewardToTp1: number | null
  entryNote: string
  takeProfitNote: string
  reasons: string[]
}

export interface WhaleAnalysis {
  whaleScore: number
  category: WhaleCategory
  breakoutState: WhaleBreakoutState
  largeTradeActivity: number
  volumeSpikeRatio: number
  tradeImbalance: number
  orderBookImbalance: number
  netTakerFlow: number
  consistency: number
  dataQuality: number
  reasons: string[]
}

export interface MarketTicker {
  symbol: string
  price: number
  priceChange5m: number
  priceChange15m: number
  priceChange1h: number
  priceChange24h: number
  volume15m: number
  volume1h: number
  volume24h: number
  volumeSpikePct: number
  relativeVolume: number
  rsi15m: number
  ma10: number
  ma30: number
  distanceFromMa10Pct: number
  macd: MacdAnalysis
  orderBook: OrderBookAnalysis
  support1: number
  support2: number
  resistance1: number
  resistance2: number
  score: number
  signal: SignalLabel
  isEarlyPump: boolean
  isOverheated: boolean
  reasons: string[]
  entry: EntryPlan
  estimatedUpsideLowPct: number
  estimatedUpsideHighPct: number
  pumpProjection: PumpProjection
  openInterest: number | null
  candles: Candle[]
  updatedAt: string
  whale: WhaleAnalysis
}

export interface SignalHistoryRecord {
  id: string
  symbol: string
  priceAtAlert: number
  currentPrice: number
  gainLossPct: number
  score: number
  rsi: number
  volSpike: number
  relVol: number
  openInterest: number | null
  signal: SignalLabel
  timestamp: string
  telegramSent: boolean
  status: HistoryStatus
  gain1hPct?: number | null
  gain4hPct?: number | null
  gain24hPct?: number | null
  maxGain4hPct?: number | null
  maxDrawdown4hPct?: number | null
}

export interface TelegramLogRecord {
  id: string
  timestamp: string
  symbol: string
  score: number
  signal: SignalLabel | 'TEST'
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  response: string
}

export interface SnapshotRecord {
  symbol: string
  timestamp: string
  price: number
  volume: number
  volSpike: number
  relVol: number
  rsi: number
  openInterest: number | null
}

export interface ScannerSettings {
  includeNewListings: boolean
  includeLowMarketCapCoins: boolean
  includeMemeCoins: boolean
}

export interface DebugState {
  lastScanTime: string | null
  coinsScanned: number
  coinsQualified: number
  alertsSentToday: number
  lastAlertCoin: string | null
  lastAlertTime: string | null
  lastTelegramResponse: string | null
  lastTelegramError: string | null
}

export interface TelegramSettings {
  botToken: string
  chatId: string
  enabled: boolean
}

export interface PositionRecord {
  id: string
  symbol: string
  quantity: number
  totalCostUsdt: number
  averageEntryPrice: number
  maxLossPct: number
  createdAt: string
  updatedAt: string
}

export type PositionDecision = 'PERTIMBANGKAN HOLD' | 'PANTAU KETAT' | 'TINJAU BATAS RISIKO' | 'DATA TIDAK TERSEDIA'

export interface PositionEvaluation extends PositionRecord {
  currentPrice: number | null
  currentValueUsdt: number | null
  pnlUsdt: number | null
  pnlPct: number | null
  decision: PositionDecision
  reasons: string[]
  technicalStopLoss: number | null
  support1: number | null
  takeProfit1: number | null
  takeProfit2: number | null
  signal: SignalLabel | null
  score: number | null
  estimatedUpsideHighPct: number | null
  upsideToTp1FromEntryPct: number | null
  upsideToTp2FromEntryPct: number | null
  riskToStopFromEntryPct: number | null
  outlook: 'PELUANG NAIK MASIH TERBUKA' | 'PELUANG NAIK TERBATAS' | 'RISIKO TURUN MENINGKAT' | 'DATA TIDAK TERSEDIA'
}

export interface ScanResponse {
  status: ConnectionStatus
  lastUpdated: string | null
  error: string | null
  tickers: MarketTicker[]
  alertsSentToday: number
  restConnected: boolean
  websocketConnected: boolean
  idrRate: number | null
  idrRateUpdatedAt: string | null
  idrRateSource: 'CoinGecko' | null
}
