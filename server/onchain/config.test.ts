import test from 'node:test'
import assert from 'node:assert/strict'
import { loadOnchainConfig, publicOnchainConfig } from './config.js'

test('provider remains disabled unless enabled, credentialed, and DEX family configured', () => {
  const base = { ONCHAIN_ENABLED: 'true', ONCHAIN_PROVIDER: 'bitquery', BITQUERY_API_KEY: 'secret-test-key', ONCHAIN_CHAINS: 'solana,bsc' }
  assert.equal(loadOnchainConfig(base).enabled, false)
  const active = loadOnchainConfig({ ...base, ONCHAIN_DEX_PROTOCOL_FAMILY: 'DEX' })
  assert.equal(active.enabled, true)
  assert.deepEqual(active.chains, ['Solana', 'Binance Smart Chain'])
  assert.equal((publicOnchainConfig(active) as Record<string, unknown>).apiKey, undefined)
})

test('configuration bounds chains, retention, score, and trade thresholds', () => {
  const config = loadOnchainConfig({
    ONCHAIN_CHAINS: 'solana,ethereum,bsc,base,arbitrum,matic,optimism',
    ONCHAIN_MAX_EVENTS: '999999',
    ONCHAIN_ALERT_THRESHOLD: '120',
    ONCHAIN_MIN_TRADE_USD: '-1'
  })
  assert.equal(config.chains.length, 6)
  assert.equal(config.maxEvents, 50000)
  assert.equal(config.alertThreshold, 100)
  assert.equal(config.minTradeUsd, 100)
  assert.equal(config.enabled, false)
})
