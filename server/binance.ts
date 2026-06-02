import axios from 'axios'
import { Candle, ConnectionStatus, MarketTicker, ScannerSettings, SignalLabel } from './models.js'

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
const CHART_INTERVALS = new Set(['15m', '1h', '4h', '1d'])

const toNumber = (value: unknown) => Number(value) || 0
const round = (value: number, digits = 8) => Number(value.toFixed(digits))
const pct = (current: number, previous: number) => previous > 0 ? round(((current - previous) / previous) * 100, 2) : 0
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

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

const buildSignal = (input: Omit<MarketTicker, 'score' | 'signal' | 'isEarlyPump' | 'isOverheated' | 'reasons' | 'entry' | 'estimatedUpsideLowPct' | 'estimatedUpsideHighPct' | 'openInterest'>) => {
  const reasons: string[] = []
  const vertical15m = input.priceChange15m > 10
  const isOverheated = input.priceChange24h > 30 || vertical15m || input.distanceFromMa10Pct > 12 || input.rsi15m > 75
  const recentCandles = input.candles.slice(-5)
  const latest = recentCandles[recentCandles.length - 1]
  const previous = recentCandles[recentCandles.length - 2]
  const hadPullback = recentCandles.slice(0, -1).some((candle) => candle.close < input.ma10 || candle.low < input.ma10)
  const reclaimingMa10 = latest.close >= input.ma10 * 0.995 && latest.close <= input.ma10 * 1.035
  const reboundCandle = latest.close > latest.open && latest.close > previous.close
  const earlySetup = hadPullback && reclaimingMa10 && reboundCandle && input.priceChange15m >= 0.15 && input.priceChange15m < 2.5 && input.priceChange24h < 18 && input.relativeVolume >= 1.15 && input.rsi15m >= 42 && input.rsi15m <= 68
  const isEarlyPump = earlySetup || (input.priceChange15m >= 2 && input.priceChange15m <= 8 && input.priceChange24h <= 25 && input.volumeSpikePct >= 150 && input.relativeVolume > 2 && input.ma10 > input.ma30 && input.rsi15m >= 50 && input.rsi15m <= 70 && input.distanceFromMa10Pct <= 8)
  let score = 0

  if (earlySetup) { score += 35; reasons.push('Early setup: harga rebound setelah pullback dan mulai reclaim MA10') }
  if (earlySetup && input.relativeVolume >= 1.15) { score += 10; reasons.push(`Volume mulai tumbuh ${round(input.relativeVolume, 2)}x sebelum candle vertikal`) }
  if (input.volumeSpikePct > 150) { score += 25; reasons.push(`Volume 15m naik ${round(input.volumeSpikePct, 1)}%`) }
  if (input.priceChange15m >= 2 && input.priceChange15m <= 8) { score += 20; reasons.push(`Harga baru naik ${input.priceChange15m}% dalam 15 menit dan ${input.priceChange24h}% dalam 24 jam`) }
  if (input.relativeVolume > 2) { score += 15; reasons.push(`Relative volume ${round(input.relativeVolume, 2)}x`) }
  if (input.ma10 > input.ma30) { score += 15; reasons.push('MA10 berada di atas MA30') }
  if (input.rsi15m >= 50 && input.rsi15m <= 70) { score += 10; reasons.push(`RSI 15m sehat di ${input.rsi15m}`) }
  if (input.price >= input.resistance1) { score += 10; reasons.push('Harga breakout resistance lokal') }
  if (input.volume1h > average([input.volume15m]) * 4) { score += 5; reasons.push('Volume 1 jam menguat') }

  if (input.priceChange24h > 30) { score -= 25; reasons.push('24h sudah naik lebih dari 30%') }
  if (input.distanceFromMa10Pct > 12) { score -= 20; reasons.push('Harga terlalu jauh dari MA10') }
  if (input.rsi15m > 75) { score -= 15; reasons.push('RSI di atas 75') }
  if (input.volumeSpikePct > 150 && input.priceChange15m < 0.5) { score -= 15; reasons.push('Volume besar tetapi harga belum ikut naik') }
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
      const [candles15mResponse, candles5mResponse] = await Promise.all([
        this.request('/api/v3/klines', { symbol: raw.s, interval: '15m', limit: 100 }),
        this.request('/api/v3/klines', { symbol: raw.s, interval: '5m', limit: 2 })
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
        support1: round(levels.support1),
        support2: round(levels.support2),
        resistance1: round(levels.resistance1),
        resistance2: round(levels.resistance2),
        candles,
        updatedAt: new Date().toISOString()
      }
      const signal = buildSignal(base)
      const entry = buildEntryPlan(price, levels.support1, levels.support2, levels.resistance1, levels.resistance2)
      const openInterest = signal.score >= 55 ? await this.fetchOpenInterest(raw.s) : null
      const ticker: MarketTicker = {
        ...base,
        ...signal,
        entry,
        estimatedUpsideLowPct: pct(entry.takeProfit1, price),
        estimatedUpsideHighPct: pct(entry.takeProfit2, price),
        openInterest
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
