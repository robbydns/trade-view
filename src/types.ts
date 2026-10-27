export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
export type SignalLabel = 'EARLY SETUP' | 'BUY WATCH' | 'STRONG BUY' | 'BREAKOUT' | 'PULLBACK' | 'WAIT' | 'OVERHEATED' | 'AVOID'
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
  status: 'ACTIVE' | 'EXPIRED' | 'OVERHEATED'
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

export interface OnchainTrade {
  chain: string
  transactionHash: string
  timestamp: number
  tokenAddress: string
  tokenId: string
  tokenSymbol?: string
  traderAddress?: string
  side: 'buy' | 'sell' | 'unknown'
  tokenAmount?: number
  usdValue: number | null
  source: 'bitquery'
  confirmationStatus: 'confirmed' | 'provisional' | 'unknown'
  dex?: string
}

export interface OnchainSummary {
  tokenKey: string
  chain: string
  tokenAddress: string
  tokenId: string
  tokenSymbol: string | null
  lastTradeAt: number | null
  dataFreshnessSeconds: number | null
  dataComplete: boolean
  score: number | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPLETE'
  labels: string[]
  windows: Record<'1m' | '5m' | '15m', { buyUsd: number; sellUsd: number; netBuyUsd: number; largeBuys: number; largeSells: number; uniqueBuyers: number; largestTradeUsd: number | null; volumeSpikeRatio: number | null }>
  repeatedBuyerCount: number
  observedBuyerConcentrationPct: number | null
  components: Record<string, number | null>
  reasons: string[]
}

export interface OnchainDashboard {
  status: {
    enabled: boolean
    configured: boolean
    provider: string
    state: 'DISABLED' | 'NOT_CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
    chains: string[]
    lastMessageAt: number | null
    lastError: string | null
    subscriptionCount: number
  }
  config: { minTradeUsd: number; windowSeconds: number; alertThreshold: number; staleAfterSeconds: number }
  summaries: OnchainSummary[]
  recentTrades: OnchainTrade[]
  alerts: Array<{ key: string; type: string; createdAt: number; summary: OnchainSummary }>
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
  upsideToTp1FromEntryPct: number | null
  upsideToTp2FromEntryPct: number | null
  riskToStopFromEntryPct: number | null
  outlook: 'PELUANG NAIK MASIH TERBUKA' | 'PELUANG NAIK TERBATAS' | 'RISIKO TURUN MENINGKAT' | 'DATA TIDAK TERSEDIA'
}
