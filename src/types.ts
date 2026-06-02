export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
export type SignalLabel = 'EARLY SETUP' | 'BUY WATCH' | 'STRONG BUY' | 'BREAKOUT' | 'PULLBACK' | 'WAIT' | 'OVERHEATED' | 'AVOID'

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
  openInterest: number | null
  candles: Candle[]
  updatedAt: string
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
  status: 'ACTIVE' | 'EXPIRED' | 'OVERHEATED'
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

export interface ScannerSettings {
  includeNewListings: boolean
  includeLowMarketCapCoins: boolean
  includeMemeCoins: boolean
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

export interface TelegramSettings {
  botToken?: string
  chatId: string
  enabled: boolean
  hasBotToken?: boolean
}

export interface SocialInsight {
  symbol: string
  redditMentions24h: number | null
  redditEngagement: number | null
  xPosts7d: number | null
  xRecentSampleSize: number | null
  xEngagement: number | null
  xSentimentScore: number | null
  xSentimentLabel: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNAVAILABLE'
  sentimentScore: number | null
  sentimentLabel: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNAVAILABLE'
  coinGeckoTrendingRank: number | null
  sources: string[]
  updatedAt: string
  error: string | null
}

export interface TwentyPercentCandidate {
  symbol: string
  price: number
  signal: SignalLabel
  score: number
  priceChange15m: number
  priceChange1h: number
  priceChange24h: number
  volumeSpikePct: number
  relativeVolume: number
  rsi15m: number
  technicalTargetPct: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reasons: string[]
  social: SocialInsight
  market: MarketTrendInsight
}

export interface MarketTrendInsight {
  symbol: string
  marketTrendScore: number
  marketTrendLabel: 'EARLY TREND' | 'MARKET TRENDING' | 'BREAKOUT WATCH' | 'TOO LATE' | 'LOW LIQUIDITY' | 'WATCH'
  coinGeckoTrendingRank: number | null
  dexScreener: {
    available: boolean
    chainId: string | null
    dexId: string | null
    liquidityUsd: number | null
    volume5mUsd: number | null
    volume1hUsd: number | null
    buys5m: number | null
    sells5m: number | null
    buyPressurePct: number | null
    boostsActive: number | null
    pairCreatedAt: number | null
  }
  geckoTerminal: {
    trending: boolean
    rank: number | null
    network: string | null
    poolName: string | null
    liquidityUsd: number | null
    volume24hUsd: number | null
  }
  reasons: string[]
  sources: string[]
  error: string | null
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

export interface PositionEvaluation extends PositionRecord {
  currentPrice: number | null
  currentValueUsdt: number | null
  pnlUsdt: number | null
  pnlPct: number | null
  decision: 'PERTIMBANGKAN HOLD' | 'PANTAU KETAT' | 'TINJAU BATAS RISIKO' | 'DATA TIDAK TERSEDIA'
  reasons: string[]
  technicalStopLoss: number | null
  support1: number | null
  takeProfit1: number | null
  takeProfit2: number | null
  signal: SignalLabel | null
  score: number | null
  estimatedUpsideHighPct: number | null
}
