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
