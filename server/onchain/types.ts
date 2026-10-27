export type OnchainSide = 'buy' | 'sell' | 'unknown'
export type OnchainLabel = 'LARGE_ONCHAIN_BUY' | 'REPEATED_WALLET_ACCUMULATION' | 'POSSIBLE_ACCUMULATION' | 'POSSIBLE_DISTRIBUTION'

export interface OnchainTrade {
  chain: string
  transactionHash: string
  timestamp: number
  blockNumber?: number
  tokenAddress: string
  tokenId: string
  tokenSymbol?: string
  traderAddress?: string
  side: OnchainSide
  tokenAmount?: number
  quoteAmount?: number
  usdValue: number | null
  source: 'bitquery'
  confirmationStatus: 'confirmed' | 'provisional' | 'unknown'
  dex?: string
  poolAddress?: string
  tradeIndex?: number
}

export interface OnchainWindowMetrics {
  seconds: 60 | 300 | 900
  buyUsd: number
  sellUsd: number
  netBuyUsd: number
  largeBuys: number
  largeSells: number
  uniqueBuyers: number
  uniqueObservedTraders: number
  largestTradeUsd: number | null
  volumeSpikeRatio: number | null
}

export interface OnchainTokenSummary {
  tokenKey: string
  chain: string
  tokenAddress: string
  tokenId: string
  tokenSymbol: string | null
  lastTradeAt: number | null
  dataFreshnessSeconds: number | null
  dataComplete: boolean
  score: number | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPLETE'
  labels: OnchainLabel[]
  windows: { '1m': OnchainWindowMetrics; '5m': OnchainWindowMetrics; '15m': OnchainWindowMetrics }
  repeatedBuyerCount: number
  observedBuyerConcentrationPct: number | null
  components: {
    largeBuyAndNetFlow: number
    volumeSpike: number | null
    repeatedAccumulation: number
    distinctBuyers: number
    persistence: number
  }
  reasons: string[]
}

export interface OnchainProviderStatus {
  enabled: boolean
  configured: boolean
  provider: string
  state: 'DISABLED' | 'NOT_CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
  chains: string[]
  lastMessageAt: number | null
  lastError: string | null
  subscriptionCount: number
}
