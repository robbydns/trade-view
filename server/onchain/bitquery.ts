import { EventEmitter } from 'node:events'
import type { OnchainTrade } from './types.js'

export const BITQUERY_WS_ENDPOINT = 'wss://streaming.bitquery.io/graphql'

export interface BitqueryTradeRow {
  Side?: string
  Trader?: { Address?: string | null } | null
  TransactionHeader?: { Hash?: string | null; Index?: number | null } | null
  Amounts?: { Base?: string | number | null; Quote?: string | number | null } | null
  AmountsInUsd?: { Quote?: string | number | null } | null
  Block?: { Time?: string | null; Timestamp?: string | null; Number?: number | null } | null
  Pair?: {
    Market?: { Network?: string | null; ProtocolFamily?: string | null; Protocol?: string | null } | null
    Pool?: { Address?: string | null } | null
    Token?: { Address?: string | null; Id?: string | null; Symbol?: string | null; Network?: string | null } | null
  } | null
}

export interface BitqueryTradesPayload {
  Trading?: { Trades?: BitqueryTradeRow[] | null } | null
}

const asFiniteNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const normalizeBitqueryTrade = (row: BitqueryTradeRow): OnchainTrade | null => {
  const market = row.Pair?.Market
  const token = row.Pair?.Token
  const hash = row.TransactionHeader?.Hash?.trim()
  const tokenId = token?.Id?.trim()
  const timestampValue = row.Block?.Timestamp || row.Block?.Time
  const timestamp = timestampValue ? Date.parse(timestampValue) : Number.NaN
  if (!hash || !tokenId || !Number.isFinite(timestamp) || !market?.Network) return null

  const rawSide = row.Side?.toLowerCase()
  const side = rawSide === 'buy' ? 'buy' : rawSide === 'sell' ? 'sell' : 'unknown'
  const tokenAmount = asFiniteNumber(row.Amounts?.Base)
  const quoteAmount = asFiniteNumber(row.Amounts?.Quote)
  const usdValue = asFiniteNumber(row.AmountsInUsd?.Quote)
  const tokenAddress = token?.Address?.trim() || tokenId.split(':').at(-1) || tokenId
  const chain = market.Network.toLowerCase().replace(/\s+/g, '-')
  const protocolFamily = market.ProtocolFamily || ''

  return {
    chain,
    transactionHash: hash,
    timestamp,
    blockNumber: row.Block?.Number ?? undefined,
    tokenAddress,
    tokenId,
    tokenSymbol: token?.Symbol || undefined,
    traderAddress: row.Trader?.Address?.trim() || undefined,
    side,
    tokenAmount: tokenAmount ?? undefined,
    quoteAmount: quoteAmount ?? undefined,
    usdValue: side === 'unknown' ? null : usdValue,
    source: 'bitquery',
    confirmationStatus: 'confirmed',
    dex: market.Protocol || protocolFamily || undefined,
    poolAddress: row.Pair?.Pool?.Address || undefined,
    tradeIndex: row.TransactionHeader?.Index ?? undefined
  }
}

export const buildBitquerySubscription = (chains: string[], dexProtocolFamily: string) => {
  const networkIds: Record<string, string> = {
    'Solana': 'bid:solana',
    'Binance Smart Chain': 'bid:bsc',
    'Ethereum': 'bid:eth',
    'Base': 'bid:base',
    'Arbitrum': 'bid:arbitrum',
    'Matic': 'bid:matic'
  }
  const escapedChains = chains.map((chain) => networkIds[chain]).filter(Boolean).map((chain) => JSON.stringify(chain)).join(', ')
  if (!escapedChains) throw new Error('Bitquery chain filter has no documented Trading API network ID.')
  return `subscription TradViewOnchainTrades {\n  Trading {\n    Trades( where: { Pair: { Market: { NetworkBid: { in: [${escapedChains}] }, ProtocolFamily: { is: ${JSON.stringify(dexProtocolFamily)} } } } } ) {\n      Side\n      Trader { Address }\n      TransactionHeader { Hash Index }\n      Amounts { Base Quote }\n      AmountsInUsd { Quote }\n      Block { Time Timestamp }\n      Pair {\n        Market { Network ProtocolFamily Protocol }\n        Pool { Address }\n        Token { Address Id Symbol Network }\n      }\n    }\n  }\n}`
}

type SocketEvent = { data?: unknown; code?: number; reason?: string }
type SocketLike = {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: SocketEvent) => void): void
}
type WebSocketConstructor = new (url: string, protocols?: string | string[]) => SocketLike

const rowsFromPayload = (payload: unknown): BitqueryTradeRow[] => {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as { data?: BitqueryTradesPayload; errors?: unknown }
  if (record.errors) throw new Error('Bitquery subscription returned a GraphQL error.')
  return Array.isArray(record.data?.Trading?.Trades) ? record.data.Trading.Trades : []
}

export class BitqueryTradesProvider extends EventEmitter {
  private socket: SocketLike | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private stopped = true
  private retryCount = 0
  private lastDataAt = 0
  private lastHeartbeatAt = 0
  private state: 'DISABLED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' = 'DISABLED'
  private lastError: string | null = null

  constructor(private readonly token: string, private readonly chains: string[], private readonly dexProtocolFamily: string, private readonly staleAfterMs = 120_000) {
    super()
  }

  getStatus() {
    return { state: this.state, lastMessageAt: this.lastDataAt || null, lastError: this.lastError, subscriptionCount: this.state === 'CONNECTED' ? 1 : 0 }
  }

  start() {
    if (!this.token || !this.chains.length || !this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.socket?.close(1000, 'service shutdown')
    this.socket = null
    this.state = 'DISABLED'
  }

  private connect() {
    if (this.stopped) return
    const WebSocketClient = (globalThis as typeof globalThis & { WebSocket?: WebSocketConstructor }).WebSocket
    if (!WebSocketClient) {
      this.fail('Runtime WebSocket API is unavailable; use Node.js 22 or newer.')
      return
    }
    this.state = 'CONNECTING'
    this.lastError = null
    const url = `${BITQUERY_WS_ENDPOINT}?token=${encodeURIComponent(this.token)}`
    const socket = new WebSocketClient(url, 'graphql-ws')
    this.socket = socket
    let acknowledged = false
    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.stopped) return
      socket.send(JSON.stringify({ type: 'connection_init' }))
      this.heartbeatTimer = setInterval(() => {
        if (Date.now() - this.lastHeartbeatAt > this.staleAfterMs && this.lastHeartbeatAt > 0) {
          this.fail('Bitquery stream is stale; reconnecting.')
          socket.close(4000, 'stale stream')
        }
      }, Math.min(15000, this.staleAfterMs / 2))
    })
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket || this.stopped) return
      try {
        const message = JSON.parse(String(event.data || '{}')) as { type?: string; payload?: unknown }
        this.lastHeartbeatAt = Date.now()
        if (message.type === 'connection_ack') {
          acknowledged = true
          this.state = 'CONNECTED'
          this.retryCount = 0
          socket.send(JSON.stringify({ type: 'start', id: 'trad-view-trades', payload: { query: buildBitquerySubscription(this.chains, this.dexProtocolFamily) } }))
          this.emit('status', this.getStatus())
        } else if (message.type === 'data') {
          this.lastDataAt = Date.now()
          const rows = rowsFromPayload(message.payload)
          for (const row of rows) {
            const trade = normalizeBitqueryTrade(row)
            if (trade) this.emit('trade', trade)
          }
        } else if (message.type === 'error') {
          this.fail('Bitquery subscription reported an error.')
        } else if (message.type === 'ka') {
          this.lastHeartbeatAt = Date.now()
        }
      } catch {
        this.fail('Unable to decode a Bitquery stream message.')
      }
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
      this.socket = null
      if (!this.stopped) {
        if (!acknowledged) this.lastError = 'Bitquery WebSocket disconnected before acknowledgement.'
        this.scheduleReconnect()
      }
    })
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.fail('Bitquery WebSocket connection failed.')
    })
  }

  private fail(message: string) {
    this.state = 'ERROR'
    this.lastError = message
    this.emit('status', this.getStatus())
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.state = 'ERROR'
    this.retryCount += 1
    const delay = Math.min(60_000, 1000 * (2 ** Math.min(this.retryCount, 6)))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    this.emit('status', this.getStatus())
  }
}
