import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildTokenSummaries, deduplicationKey, detectOnchainAlerts } from './detector.js'
import { loadOnchainConfig } from './config.js'
import { BitqueryTradesProvider } from './bitquery.js'
import type { OnchainProviderStatus, OnchainTokenSummary, OnchainTrade } from './types.js'

const config = loadOnchainConfig()
const persistencePath = fileURLToPath(new URL('./events.json', import.meta.url))
type PersistedAlert = { key: string; type: string; createdAt: number; summary: OnchainTokenSummary }
type PersistedData = { trades: OnchainTrade[]; alertKeys: PersistedAlert[] }
const loadPersisted = (): PersistedData => {
  try {
    const parsed = JSON.parse(fs.readFileSync(persistencePath, 'utf8')) as Partial<PersistedData>
    return { trades: Array.isArray(parsed.trades) ? parsed.trades : [], alertKeys: Array.isArray(parsed.alertKeys) ? parsed.alertKeys.filter((item): item is PersistedAlert => Boolean(item && typeof item.key === 'string' && typeof item.type === 'string' && item.summary)) : [] }
  } catch {
    return { trades: [], alertKeys: [] }
  }
}

const persisted = loadPersisted()
let trades = persisted.trades.slice(-config.maxEvents)
let alertKeys = persisted.alertKeys.slice(-2000)
let provider: BitqueryTradesProvider | null = null
let lastError: string | null = null
let saveTimer: NodeJS.Timeout | null = null
const alertListeners = new Set<(alert: ReturnType<typeof detectOnchainAlerts>[number]) => void>()
const seen = new Set(trades.map(deduplicationKey))

const saveSoon = () => {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      fs.writeFileSync(persistencePath, JSON.stringify({ trades, alertKeys }, null, 2))
    } catch (error) {
      lastError = `On-chain local persistence failed: ${(error as Error).message}`
    }
  }, 250)
}

const processTrade = (trade: OnchainTrade) => {
  const key = deduplicationKey(trade)
  if (seen.has(key)) return
  seen.add(key)
  trades.push(trade)
  trades = trades.filter((item) => item.timestamp >= Date.now() - config.windowSeconds * 1000).slice(-config.maxEvents)
  if (seen.size > config.maxEvents * 2) {
    seen.clear()
    for (const item of trades) seen.add(deduplicationKey(item))
  }
  saveSoon()
  const summaries = buildTokenSummaries(trades, config)
  for (const alert of detectOnchainAlerts(summaries)) {
    const prior = alertKeys.find((item) => item.key.startsWith(`${alert.summary.tokenKey}:${alert.type}:`))
    if (prior && Date.now() - prior.createdAt < config.alertCooldownMs) continue
    alertKeys.unshift({ key: alert.key, type: alert.type, createdAt: Date.now(), summary: alert.summary })
    alertKeys = alertKeys.slice(0, 2000)
    saveSoon()
    for (const listener of alertListeners) listener(alert)
  }
}

export const startOnchainMonitoring = () => {
  if (!config.enabled) return
  if (provider) return
  provider = new BitqueryTradesProvider(config.apiKey, config.chains, config.dexProtocolFamily, config.staleAfterSeconds * 1000)
  provider.on('trade', processTrade)
  provider.on('status', (status: { lastError?: string | null }) => { lastError = status.lastError || null })
  provider.start()
}

export const stopOnchainMonitoring = () => {
  provider?.stop()
  provider = null
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    try { fs.writeFileSync(persistencePath, JSON.stringify({ trades, alertKeys }, null, 2)) } catch { /* shutdown remains graceful */ }
  }
}

export const onOnchainAlert = (listener: (alert: ReturnType<typeof detectOnchainAlerts>[number]) => void) => {
  alertListeners.add(listener)
  return () => alertListeners.delete(listener)
}

export const getOnchainStatus = (): OnchainProviderStatus => {
  const providerStatus = provider?.getStatus()
  const providerConfigured = Boolean(config.apiKey && config.dexProtocolFamily && config.chains.length)
  return {
    enabled: config.enabled,
    configured: providerConfigured,
    provider: config.provider,
    state: !config.enabled ? (providerConfigured ? 'DISABLED' : 'NOT_CONFIGURED') : providerStatus?.state || 'CONNECTING',
    chains: config.chains,
    lastMessageAt: providerStatus?.lastMessageAt || null,
    lastError: lastError || providerStatus?.lastError || null,
    subscriptionCount: providerStatus?.subscriptionCount || 0
  }
}

export const getOnchainSummaries = () => buildTokenSummaries(trades, config)
export const getOnchainRecentTrades = (limit = 50) => trades.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, Math.min(config.maxRecentTrades, Math.max(1, limit)))
export const getOnchainAlertHistory = () => alertKeys.slice(0, 200).map((item) => ({ ...item }))
export const getOnchainConfig = () => ({ minTradeUsd: config.minTradeUsd, windowSeconds: config.windowSeconds, alertThreshold: config.alertThreshold, staleAfterSeconds: config.staleAfterSeconds })
