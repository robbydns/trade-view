import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTokenSummaries, deduplicationKey, tokenKeyOf, type DetectorConfig } from './detector.js'
import type { OnchainTrade } from './types.js'

const config: DetectorConfig = { minTradeUsd: 25_000, windowSeconds: 3600, alertThreshold: 70, maxEvents: 2000, staleAfterSeconds: 120 }
const now = 1_800_000_000_000
const trade = (overrides: Partial<OnchainTrade> = {}): OnchainTrade => ({
  chain: 'solana', transactionHash: 'tx-1', timestamp: now - 10_000, tokenAddress: 'mint-A', tokenId: 'bid:solana:mint-A', tokenSymbol: 'ABC',
  traderAddress: 'wallet-1', side: 'buy', tokenAmount: 100, quoteAmount: 500, usdValue: 500, source: 'bitquery', confirmationStatus: 'confirmed', ...overrides
})

test('canonical token key is chain-aware and never symbol-only', () => {
  assert.notEqual(tokenKeyOf(trade()), tokenKeyOf(trade({ chain: 'ethereum', tokenAddress: 'mint-A', tokenId: 'bid:eth:mint-A' })))
})

test('duplicate transaction legs do not double count and use stable trade identity', () => {
  const first = trade({ usdValue: 30_000, tokenAmount: 1000 })
  const duplicate = trade({ usdValue: 30_000, tokenAmount: 1000 })
  const summary = buildTokenSummaries([first, duplicate], config, now)[0]
  assert.equal(summary.windows['1m'].buyUsd, 30_000)
  assert.equal(deduplicationKey(first), deduplicationKey(duplicate))
})

test('unknown direction and missing USD do not add buy flow or fabricate value', () => {
  const summary = buildTokenSummaries([
    trade({ side: 'unknown', usdValue: 70_000 }),
    trade({ transactionHash: 'tx-2', traderAddress: 'wallet-2', usdValue: null })
  ], config, now)[0]
  assert.equal(summary.windows['1m'].buyUsd, 0)
  assert.equal(summary.windows['1m'].netBuyUsd, 0)
  assert.equal(summary.score, null)
  assert.equal(summary.confidence, 'INCOMPLETE')
})

test('unknown side keeps a token summary incomplete even with usable prices', () => {
  const summary = buildTokenSummaries([
    trade({ side: 'unknown', usdValue: 80_000 }),
    trade({ transactionHash: 'tx-known', side: 'buy', timestamp: now - 20_000, usdValue: 30_000 })
  ], config, now)[0]
  assert.equal(summary.windows['1m'].buyUsd, 30_000)
  assert.equal(summary.score, null)
  assert.equal(summary.confidence, 'INCOMPLETE')
})

test('rolling windows compute buy, sell, unique traders and negative net flow', () => {
  const summary = buildTokenSummaries([
    trade({ transactionHash: 'b1', usdValue: 30_000, traderAddress: 'buyer-1' }),
    trade({ transactionHash: 'b2', timestamp: now - 120_000, usdValue: 10_000, traderAddress: 'buyer-2' }),
    trade({ transactionHash: 's1', timestamp: now - 30_000, side: 'sell', usdValue: 40_000, traderAddress: 'seller-1' })
  ], config, now)[0]
  assert.equal(summary.windows['1m'].buyUsd, 30_000)
  assert.equal(summary.windows['1m'].sellUsd, 40_000)
  assert.equal(summary.windows['1m'].netBuyUsd, -10_000)
  assert.equal(summary.windows['1m'].uniqueBuyers, 1)
  assert.equal(summary.windows['5m'].uniqueBuyers, 2)
  assert.equal(summary.components.largeBuyAndNetFlow, 0)
  assert.equal(summary.components.repeatedAccumulation, 0)
  assert.equal(summary.components.distinctBuyers, 0)
})

test('repeated buys create an accumulation label without claiming address independence', () => {
  const summary = buildTokenSummaries([
    trade({ transactionHash: 'b1', usdValue: 30_000, traderAddress: 'wallet-1' }),
    trade({ transactionHash: 'b2', timestamp: now - 40_000, usdValue: 35_000, traderAddress: 'wallet-1' })
  ], config, now)[0]
  assert.equal(summary.repeatedBuyerCount, 1)
  assert.ok(summary.labels.includes('REPEATED_WALLET_ACCUMULATION'))
  assert.ok(summary.reasons.some((reason) => reason.includes('not assumed independent')))
})

test('stale events and provisional trades do not produce a usable bullish score', () => {
  const stale = buildTokenSummaries([trade({ timestamp: now - 200_000 })], config, now)[0]
  const provisional = buildTokenSummaries([trade({ confirmationStatus: 'provisional' })], config, now)
  assert.equal(stale.confidence, 'INCOMPLETE')
  assert.equal(stale.score, null)
  assert.deepEqual(provisional, [])
})
