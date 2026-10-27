import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBitquerySubscription, normalizeBitqueryTrade, type BitqueryTradeRow } from './bitquery.js'

const fixture: BitqueryTradeRow = {
  Side: 'Buy',
  Trader: { Address: '0xWallet' },
  TransactionHeader: { Hash: '0xHash', Index: 3 },
  Amounts: { Base: '12.5', Quote: '500' },
  AmountsInUsd: { Quote: '500.01' },
  Block: { Time: '2026-10-27T12:00:00Z', Timestamp: '2026-10-27T12:00:00Z', Number: 123 },
  Pair: {
    Market: { Network: 'Base', ProtocolFamily: 'DEX', Protocol: 'uniswap' },
    Pool: { Address: '0xPool' },
    Token: { Address: '0xToken', Id: 'bid:base:0xtoken', Symbol: 'TOK', Network: 'Base' }
  }
}

test('normalizes documented Bitquery Trading.Trades fields with chain-aware token identity', () => {
  const normalized = normalizeBitqueryTrade(fixture)
  assert.ok(normalized)
  assert.equal(normalized.side, 'buy')
  assert.equal(normalized.chain, 'base')
  assert.equal(normalized.tokenId, 'bid:base:0xtoken')
  assert.equal(normalized.tokenAmount, 12.5)
  assert.equal(normalized.usdValue, 500.01)
  assert.equal(normalized.traderAddress, '0xWallet')
})

test('unknown side never receives a fabricated USD buy value', () => {
  const normalized = normalizeBitqueryTrade({ ...fixture, Side: 'Unknown', AmountsInUsd: { Quote: '500' } })
  assert.equal(normalized?.side, 'unknown')
  assert.equal(normalized?.usdValue, null)
})

test('rejects rows without transaction/token identity and retains protocol metadata for diagnostics', () => {
  assert.equal(normalizeBitqueryTrade({ ...fixture, TransactionHeader: { Hash: null } }), null)
  const nonDexRow = normalizeBitqueryTrade({ ...fixture, Pair: { ...fixture.Pair, Market: { Network: 'Base', ProtocolFamily: 'NFT' } } })
  assert.equal(nonDexRow?.dex, 'NFT')
})

test('subscription is bounded to configured chains and selects the verified trade fields', () => {
  const query = buildBitquerySubscription(['Solana', 'Base'], 'verified-dex-family')
  assert.match(query, /NetworkBid: \{ in: \["bid:solana", "bid:base"\] \}/)
  assert.match(query, /ProtocolFamily: \{ is: "verified-dex-family" \}/)
  assert.match(query, /AmountsInUsd \{ Quote \}/)
  assert.match(query, /TransactionHeader \{ Hash Index \}/)
  assert.match(query, /Block \{ Time Timestamp \}/)
})
