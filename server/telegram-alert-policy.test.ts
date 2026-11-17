import test from 'node:test'
import assert from 'node:assert/strict'
import { meetsStrongBuyTelegramPolicy } from './telegram-alert-policy.js'
import { MarketTicker } from './models.js'

const candidate = (overrides: Partial<Pick<MarketTicker, 'signal' | 'isOverheated' | 'pumpProjection'>> = {}) => ({
  signal: 'STRONG BUY' as const,
  isOverheated: false,
  pumpProjection: {
    confidence: 'HIGH' as const,
    action: 'ENTER_NOW' as const,
    riskRewardToTp1: 2,
  } as MarketTicker['pumpProjection'],
  ...overrides
})

test('Telegram policy accepts only strong-buy, high-confidence, risk-qualified setups', () => {
  assert.equal(meetsStrongBuyTelegramPolicy(candidate()), true)
})

test('Telegram policy rejects non-strong signals and overheated setups', () => {
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ signal: 'BUY WATCH' })), false)
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ isOverheated: true })), false)
})

test('Telegram policy rejects weak projection confidence, avoid actions, and low reward/risk', () => {
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ pumpProjection: { ...candidate().pumpProjection, confidence: 'MEDIUM' } })), false)
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ pumpProjection: { ...candidate().pumpProjection, action: 'AVOID' } })), false)
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ pumpProjection: { ...candidate().pumpProjection, riskRewardToTp1: 1.49 } })), false)
  assert.equal(meetsStrongBuyTelegramPolicy(candidate({ pumpProjection: { ...candidate().pumpProjection, riskRewardToTp1: null } })), false)
})
