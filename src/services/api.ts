import { DebugState, MarketTicker, ScannerSettings, ScanResponse, SignalHistoryRecord, TelegramLogRecord, TelegramSettings } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const AUTH_TOKEN_KEY = 'crypto-signal-compass-auth-token'

export const getAuthToken = () => window.localStorage.getItem(AUTH_TOKEN_KEY)
export const setAuthToken = (token: string) => window.localStorage.setItem(AUTH_TOKEN_KEY, token)
export const clearAuthToken = () => window.localStorage.removeItem(AUTH_TOKEN_KEY)

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const token = getAuthToken()
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const body = await response.json()
  if (response.status === 401 && path !== '/auth/login') {
    clearAuthToken()
    window.dispatchEvent(new Event('auth:logout'))
  }
  if (!response.ok) throw new Error(body.error || 'Request gagal')
  return body
}

export const login = (email: string, password: string) => request<{ token: string; email: string }>('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
export const fetchSession = () => request<{ authenticated: boolean }>('/auth/session')
export const fetchScan = () => request<ScanResponse>('/scan')
export const fetchCoin = (symbol: string) => request<{ ticker: MarketTicker; history: MarketTicker[]; idrRate: number | null; idrRateUpdatedAt: string | null; idrRateSource: 'CoinGecko' | null }>(`/coins/${symbol}`)
export const fetchWatchlist = () => request<{ symbols: string[] }>('/watchlist')
export const addWatchlist = (symbol: string) => request<{ symbols: string[] }>('/watchlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbol })
})
export const removeWatchlist = (symbol: string) => request<{ symbols: string[] }>(`/watchlist/${symbol}`, { method: 'DELETE' })
export const fetchTelegramSettings = () => request<TelegramSettings>('/telegram/settings')
export const updateTelegramSettings = (settings: TelegramSettings) => request<TelegramSettings>('/telegram/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(settings)
})
export const testTelegram = () => request<{ success: boolean }>('/telegram/test', { method: 'POST' })
export const fetchSignalHistory = () => request<{ records: SignalHistoryRecord[] }>('/signal-history')
export const fetchTelegramLogs = () => request<{ records: TelegramLogRecord[] }>('/telegram/logs')
export const fetchDebug = () => request<DebugState>('/debug')
export const fetchMissedOpportunities = () => request<{ records: Array<{ symbol: string; gain24h: number; reason: string }> }>('/missed-opportunities')
export const fetchAnalytics = () => request<{ topAlertWinners: SignalHistoryRecord[]; topMissedPumps: Array<{ symbol: string; gain24h: number; reason: string }>; averageAlertAccuracy: number; averageProfitAfterAlert: number; bestPerformingIndicators: Array<{ symbol: string; rsi: number; volSpike: number; relVol: number; gainLossPct: number }> }>('/analytics')
export const fetchEarlyPumpAnalysis = () => request<{ records: Array<{ symbol: string; gain24h: number; snapshots: Array<{ timestamp: string; price: number; volume: number; volSpike: number; relVol: number; rsi: number; openInterest: number | null }> }> }>('/early-pump-analysis')
export const fetchScannerSettings = () => request<ScannerSettings>('/scanner/settings')
export const updateScannerSettings = (settings: ScannerSettings) => request<ScannerSettings>('/scanner/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
