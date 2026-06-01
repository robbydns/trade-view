import fs from 'fs'
import { BinanceRealtimeService } from './binance.js'
import { HistoryStatus, MarketTicker, ScanResponse, SignalHistoryRecord, SnapshotRecord, TelegramLogRecord } from './models.js'
import { sendTelegramAlert } from './alert.js'
import { getIdrRate } from './rates.js'
import { store } from './store.js'

const binance = new BinanceRealtimeService()
const cooldownBySymbol = new Map<string, number>()
const watchlistFile = new URL('./watchlist.json', import.meta.url)
let lastSnapshotAt = 0

const loadWatchlist = () => {
  try {
    const saved = JSON.parse(fs.readFileSync(watchlistFile, 'utf8'))
    return new Set<string>(Array.isArray(saved) ? saved : [])
  } catch {
    return new Set<string>()
  }
}

const watchlist = loadWatchlist()
const signalHistory = new Map<string, MarketTicker[]>()
let response: ScanResponse = {
  status: 'DISCONNECTED', lastUpdated: null, error: null, tickers: [], alertsSentToday: 0,
  restConnected: false, websocketConnected: false, idrRate: null, idrRateUpdatedAt: null, idrRateSource: null
}

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase().endsWith('USDT') ? symbol.trim().toUpperCase() : `${symbol.trim().toUpperCase()}USDT`
const pct = (current: number, previous: number) => previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(2)) : 0

const refresh = async () => {
  const settings = store.get().settings
  const tickers = await binance.scan([...watchlist], settings)
  const connection = binance.getConnection()
  const idrRate = await getIdrRate()
  response = { ...connection, tickers: connection.status === 'ERROR' ? [] : tickers, alertsSentToday: store.get().debug.alertsSentToday, idrRate: idrRate.rate, idrRateUpdatedAt: idrRate.updatedAt, idrRateSource: idrRate.rate ? 'CoinGecko' : null }

  for (const ticker of response.tickers) {
    const history = signalHistory.get(ticker.symbol) || []
    signalHistory.set(ticker.symbol, [ticker, ...history].slice(0, 20))
  }

  updatePersistedStatuses(response.tickers)
  captureSnapshots(response.tickers)
  await persistQualifiedSignals(response.tickers)
  store.updateDebug({ lastScanTime: new Date().toISOString(), coinsScanned: response.tickers.length, coinsQualified: response.tickers.filter(isQualified).length })
}

const isQualified = (ticker: MarketTicker) => ticker.score >= 80 && ['BUY WATCH', 'STRONG BUY', 'BREAKOUT'].includes(ticker.signal)
const recordStatus = (ticker: MarketTicker | undefined): HistoryStatus => !ticker ? 'EXPIRED' : ticker.isOverheated ? 'OVERHEATED' : 'ACTIVE'

const updatePersistedStatuses = (tickers: MarketTicker[]) => {
  const currentBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]))
  store.mutate((draft) => {
    for (const record of draft.signalHistory) {
      const current = currentBySymbol.get(record.symbol)
      record.currentPrice = current?.price || record.currentPrice
      record.gainLossPct = pct(record.currentPrice, record.priceAtAlert)
      record.status = recordStatus(current)
    }
  })
}

const captureSnapshots = (tickers: MarketTicker[]) => {
  if (Date.now() - lastSnapshotAt < 5 * 60 * 1000) return
  lastSnapshotAt = Date.now()
  const timestamp = new Date().toISOString()
  const records: SnapshotRecord[] = tickers.map((ticker) => ({ symbol: ticker.symbol, timestamp, price: ticker.price, volume: ticker.volume15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, rsi: ticker.rsi15m, openInterest: ticker.openInterest }))
  store.addSnapshots(records)
}

const persistQualifiedSignals = async (tickers: MarketTicker[]) => {
  for (const ticker of tickers) {
    if (!isQualified(ticker)) continue
    const existing = store.get().signalHistory.find((record) => record.symbol === ticker.symbol && Date.now() - Date.parse(record.timestamp) < 30 * 60 * 1000)
    if (existing) continue
    const record: SignalHistoryRecord = { id: id(), symbol: ticker.symbol, priceAtAlert: ticker.price, currentPrice: ticker.price, gainLossPct: 0, score: ticker.score, rsi: ticker.rsi15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, openInterest: ticker.openInterest, signal: ticker.signal, timestamp: new Date().toISOString(), telegramSent: false, status: 'ACTIVE' }
    store.addSignal(record)
    await sendLoggedTelegram(ticker, record.id)
  }
}

const sendLoggedTelegram = async (ticker: MarketTicker, historyId?: string) => {
  const now = Date.now()
  const lastPersistedSent = store.get().telegramLogs.find((record) => record.symbol === ticker.symbol && record.status === 'SENT')
  const lastSentAt = Math.max(cooldownBySymbol.get(ticker.symbol) || 0, lastPersistedSent ? Date.parse(lastPersistedSent.timestamp) : 0)
  if (lastSentAt + 30 * 60 * 1000 > now) {
    addTelegramLog(ticker, 'SKIPPED', 'Cooldown 30 menit masih aktif.')
    return
  }
  try {
    const telegramResponse = await sendTelegramAlert(formatTelegramAlert(ticker), true)
    cooldownBySymbol.set(ticker.symbol, now)
    addTelegramLog(ticker, 'SENT', telegramResponse)
    store.mutate((draft) => {
      const history = draft.signalHistory.find((record) => record.id === historyId)
      if (history) history.telegramSent = true
      draft.debug.alertsSentToday += 1
      draft.debug.lastAlertCoin = ticker.symbol
      draft.debug.lastAlertTime = new Date().toISOString()
      draft.debug.lastTelegramResponse = telegramResponse
      draft.debug.lastTelegramError = null
    })
  } catch (error) {
    const message = (error as Error).message
    addTelegramLog(ticker, 'FAILED', message)
    store.updateDebug({ lastTelegramError: message })
  }
}

const addTelegramLog = (ticker: Pick<MarketTicker, 'symbol' | 'score' | 'signal'>, status: TelegramLogRecord['status'], message: string) => store.addTelegramLog({ id: id(), timestamp: new Date().toISOString(), symbol: ticker.symbol, score: ticker.score, signal: ticker.signal, status, response: message })

const formatTelegramAlert = (ticker: MarketTicker) => `Crypto Signal Alert

Coin: ${ticker.symbol}
Signal: ${ticker.signal}
Score: ${ticker.score}
Harga: ${ticker.price}
15m Change: ${ticker.priceChange15m >= 0 ? '+' : ''}${ticker.priceChange15m}%
Volume Spike: ${ticker.volumeSpikePct >= 0 ? '+' : ''}${ticker.volumeSpikePct}%
RSI: ${ticker.rsi15m}
Open Interest: ${ticker.openInterest ?? 'N/A'}
Entry: ${ticker.entry.earlyEntryLow}-${ticker.entry.earlyEntryHigh}
TP: ${ticker.entry.takeProfit1} / ${ticker.entry.takeProfit2}
CL: ${ticker.entry.stopLoss}
Estimasi upside teknikal: +${ticker.estimatedUpsideLowPct}% sampai +${ticker.estimatedUpsideHighPct}%

Disclaimer: Bukan nasihat finansial.`

export const initializeScheduler = async () => { binance.start(); await refresh(); setInterval(refresh, 20000) }
export const getScanResponse = () => response
export const getWatchlist = () => [...watchlist]
const saveWatchlist = () => fs.writeFileSync(watchlistFile, JSON.stringify([...watchlist], null, 2))
export const addWatchlist = (symbol: string) => { watchlist.add(normalizeSymbol(symbol)); saveWatchlist() }
export const removeWatchlist = (symbol: string) => { watchlist.delete(normalizeSymbol(symbol)); saveWatchlist() }
export const getCoin = async (symbol: string) => binance.getCoin(normalizeSymbol(symbol))
export const getSignalHistory = (symbol: string) => signalHistory.get(normalizeSymbol(symbol)) || []
export const getPersistentSignalHistory = () => store.get().signalHistory
export const getTelegramLogs = () => store.get().telegramLogs
export const getDebug = () => store.get().debug
export const getScannerSettings = () => store.get().settings
export const updateScannerSettings = (settings: Parameters<typeof store.updateSettings>[0]) => { store.updateSettings(settings); return store.get().settings }
export const getMissedOpportunities = () => response.tickers.filter((ticker) => ticker.priceChange24h > 20 && !store.get().signalHistory.some((record) => record.symbol === ticker.symbol)).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, reason: ticker.volumeSpikePct < 150 ? 'VolSpike filter too strict' : ticker.relativeVolume <= 2 ? 'Relative volume filter not reached' : ticker.openInterest === null ? 'Open Interest data missing' : 'Coin did not meet score >= 80 before pump' })).sort((a, b) => b.gain24h - a.gain24h)
export const getEarlyPumpAnalysis = () => {
  const snapshots = store.get().snapshots
  return response.tickers.filter((ticker) => ticker.priceChange24h > 20).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, snapshots: snapshots.filter((record) => record.symbol === ticker.symbol).slice(-24) }))
}
export const getAnalytics = () => {
  const history = store.get().signalHistory
  const winners = [...history].sort((a, b) => b.gainLossPct - a.gainLossPct).slice(0, 10)
  const averageProfit = history.length ? Number((history.reduce((sum, item) => sum + item.gainLossPct, 0) / history.length).toFixed(2)) : 0
  const accuracy = history.length ? Number(((history.filter((item) => item.gainLossPct > 0).length / history.length) * 100).toFixed(2)) : 0
  return { topAlertWinners: winners, topMissedPumps: getMissedOpportunities().slice(0, 10), averageAlertAccuracy: accuracy, averageProfitAfterAlert: averageProfit, bestPerformingIndicators: winners.slice(0, 5).map((item) => ({ symbol: item.symbol, rsi: item.rsi, volSpike: item.volSpike, relVol: item.relVol, gainLossPct: item.gainLossPct })) }
}
export const logTelegramTest = (status: TelegramLogRecord['status'], message: string) => {
  store.addTelegramLog({ id: id(), timestamp: new Date().toISOString(), symbol: 'TEST', score: 0, signal: 'TEST', status, response: message })
  store.updateDebug(status === 'SENT' ? { lastTelegramResponse: message, lastTelegramError: null } : { lastTelegramError: message })
}
