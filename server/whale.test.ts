import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateNotional,
  detectVolumeSpike,
  calculateTradeImbalance,
  calculateOrderBookImbalance,
  calculateWhaleScore,
  detectBreakoutState
} from './whale.js'

test('calculateNotional multiplies price times quantity', () => {
  assert.equal(calculateNotional(100.5, 2.25), 226.125)
})

test('volume spike detects elevated relative turnover', () => {
  const result = detectVolumeSpike(1700000, 800000)
  assert.equal(result.volumeRatio, 2.125)
  assert.equal(result.level, 'increased')
})

test('trade imbalance reads aggressive buyer dominance correctly', () => {
  const result = calculateTradeImbalance(720000, 280000)
  assert.ok(result >= 0.4)
  assert.ok(result <= 0.5)
  assert.ok(Math.abs(result - 0.44) < 0.05)
})

test('order book imbalance measures bid/ask imbalance without division by zero', () => {
  const result = calculateOrderBookImbalance(1200000, 600000)
  assert.equal(result, 0.3333333333333333)
})

test('whale score rewards net buy flow while penalizing net sell pressure', () => {
  const bullish = calculateWhaleScore({
    largeTradeActivity: 0.84,
    volumeSpikeRatio: 2.8,
    tradeImbalance: 0.42,
    orderBookImbalance: 0.28,
    netTakerFlow: 0.35,
    consistency: 0.8,
    dataQuality: 1
  })
  const bearish = calculateWhaleScore({
    largeTradeActivity: 0.82,
    volumeSpikeRatio: 2.2,
    tradeImbalance: -0.38,
    orderBookImbalance: -0.2,
    netTakerFlow: -0.3,
    consistency: 0.7,
    dataQuality: 1
  })

  assert.ok(bullish >= 60)
  assert.ok(bearish < 40)
})

test('breakout states distinguish early accumulation from failed breakout', () => {
  const early = detectBreakoutState({
    whaleScore: 68,
    price: 100,
    resistance: 101,
    volumeSpikeRatio: 2.1,
    netTakerFlow: 0.28,
    orderBookImbalance: 0.22,
    priceNearResistancePct: 1.5,
    dataQuality: 1,
    invalidationPressure: 0.15,
    confirmed: false,
    failed: false
  })
  const failed = detectBreakoutState({
    whaleScore: 58,
    price: 99,
    resistance: 101,
    volumeSpikeRatio: 1.1,
    netTakerFlow: -0.25,
    orderBookImbalance: -0.15,
    priceNearResistancePct: 0.4,
    dataQuality: 1,
    invalidationPressure: 0.7,
    confirmed: false,
    failed: true
  })

  assert.equal(early, 'EARLY_WHALE_ALERT')
  assert.equal(failed, 'FAILED_BREAKOUT')
})
