import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTechnicalCandles, calculateRsi, deriveMultiTimeframeSignal } from './technical-analysis.js'
import { Candle } from '../types.js'

const candles = (trend: 'up' | 'down', count = 220): Candle[] => Array.from({ length: count }, (_, index) => {
  const close = trend === 'up' ? 100 + index * 0.55 + Math.sin(index / 3) : 220 - index * 0.48 + Math.sin(index / 3)
  const open = close - (trend === 'up' ? 0.2 : -0.2)
  return { openTime: index * 60_000, open, high: Math.max(open, close) + 0.3, low: Math.min(open, close) - 0.3, close, volume: 100 + index, quoteVolume: (100 + index) * close }
})

test('closed-candle technical analysis provides populated EMA/SMA, RSI, MACD, ATR and risk plan', () => {
  const result = analyzeTechnicalCandles(candles('up'))
  assert.ok(result)
  assert.equal(result.candleCount, 219)
  assert.ok(result.ema9.length === 219)
  assert.ok(result.ema50[result.ema50.length - 1] > result.ema50[0])
  assert.equal(result.sma50Period, 50)
  assert.ok(typeof result.sma50[result.sma50.length - 1] === 'number')
  assert.ok(result.rsi >= 0 && result.rsi <= 100)
  assert.ok(Number.isFinite(result.macd.histogram))
  assert.ok(result.entryLow <= result.entryHigh)
  assert.ok(result.stopLoss < result.entryLow)
  assert.ok(result.takeProfit2 > result.takeProfit1)
})

test('Wilder RSI returns null for insufficient candles and bounded values for valid candles', () => {
  assert.equal(calculateRsi(candles('up', 10)), null)
  const result = calculateRsi(candles('down'))
  assert.ok(result !== null && result >= 0 && result <= 100)
})

test('multi-timeframe decision requires aligned 15m/1h/1d, not 1m alone', () => {
  const bullish = analyzeTechnicalCandles(candles('up'))!
  const shortOnly = deriveMultiTimeframeSignal({ '1m': bullish })
  assert.equal(shortOnly.decision, 'WAIT')
  const aligned = deriveMultiTimeframeSignal({ '1m': bullish, '15m': bullish, '1h': bullish, '1d': bullish })
  assert.equal(aligned.bullishCount, 3)
  assert.equal(aligned.bearishCount, 0)
  assert.ok(['STRONG BUY', 'BUY WATCH', 'WAIT', 'AVOID'].includes(aligned.decision))
  assert.equal(deriveMultiTimeframeSignal({ '15m': bullish, '1h': bullish }).decision, 'WAIT')
  const bearish = analyzeTechnicalCandles(candles('down'))!
  const conflicting = deriveMultiTimeframeSignal({ '15m': bullish, '1h': bearish, '1d': bearish })
  assert.equal(conflicting.bearishCount, 2)
  assert.equal(conflicting.decision, 'AVOID')
})
