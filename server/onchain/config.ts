import dotenv from 'dotenv'
import type { DetectorConfig } from './detector.js'

dotenv.config()

const CHAIN_NAMES: Record<string, string> = {
  solana: 'Solana',
  bsc: 'Binance Smart Chain',
  ethereum: 'Ethereum',
  eth: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  matic: 'Matic',
  polygon: 'Matic'
}

const boundedNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export interface OnchainConfig extends DetectorConfig {
  enabled: boolean
  provider: 'bitquery'
  apiKey: string
  dexProtocolFamily: string
  chains: string[]
  maxConcurrentStreams: number
  pollIntervalMs: number
  alertCooldownMs: number
  maxRecentTrades: number
}

export const loadOnchainConfig = (env: NodeJS.ProcessEnv = process.env): OnchainConfig => {
  const chains = (env.ONCHAIN_CHAINS || 'solana,bsc,ethereum,base')
    .split(',')
    .map((chain) => CHAIN_NAMES[chain.trim().toLowerCase()])
    .filter((chain): chain is string => Boolean(chain))
  const provider = (env.ONCHAIN_PROVIDER || 'bitquery').toLowerCase()
  const apiKey = env.BITQUERY_API_KEY?.trim() || ''
  const dexProtocolFamily = env.ONCHAIN_DEX_PROTOCOL_FAMILY?.trim() || ''
  const configuredEnabled = env.ONCHAIN_ENABLED === 'true'

  return {
    enabled: configuredEnabled && provider === 'bitquery' && Boolean(apiKey) && Boolean(dexProtocolFamily) && chains.length > 0,
    provider: 'bitquery',
    apiKey,
    dexProtocolFamily,
    chains: [...new Set(chains)].slice(0, 6),
    maxConcurrentStreams: 1,
    pollIntervalMs: boundedNumber(env.ONCHAIN_POLL_INTERVAL_MS, 5000, 1000, 60000),
    minTradeUsd: boundedNumber(env.ONCHAIN_MIN_TRADE_USD, 25000, 100, 100000000),
    windowSeconds: boundedNumber(env.ONCHAIN_WINDOW_SECONDS, 3600, 900, 86400),
    alertThreshold: boundedNumber(env.ONCHAIN_ALERT_THRESHOLD, 70, 0, 100),
    staleAfterSeconds: boundedNumber(env.ONCHAIN_STALE_AFTER_SECONDS, 120, 15, 3600),
    maxEvents: boundedNumber(env.ONCHAIN_MAX_EVENTS, 5000, 100, 50000),
    maxRecentTrades: boundedNumber(env.ONCHAIN_MAX_RECENT_TRADES, 100, 10, 500),
    alertCooldownMs: boundedNumber(env.ONCHAIN_ALERT_COOLDOWN_MS, 300000, 30000, 86400000)
  }
}

export const publicOnchainConfig = (config: OnchainConfig) => ({
  enabled: config.enabled,
  configured: Boolean(config.apiKey && config.dexProtocolFamily),
  provider: config.provider,
  chains: config.chains,
  maxConcurrentStreams: config.maxConcurrentStreams,
  minTradeUsd: config.minTradeUsd,
  windowSeconds: config.windowSeconds,
  alertThreshold: config.alertThreshold
})
