import axios from 'axios'
import { MarketTicker } from './models.js'

const CACHE_MS = 10 * 60 * 1000
const TIMEOUT_MS = 8000

type DexPair = {
  chainId?: string
  dexId?: string
  pairAddress?: string
  baseToken?: { symbol?: string }
  quoteToken?: { symbol?: string }
  priceUsd?: string
  liquidity?: { usd?: number }
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number }
  txns?: { m5?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number } }
  pairCreatedAt?: number
  boosts?: { active?: number }
}

type GeckoPool = {
  attributes?: {
    address?: string
    name?: string
    base_token_price_usd?: string
    reserve_in_usd?: string
    volume_usd?: { h24?: string }
  }
  relationships?: {
    network?: { data?: { id?: string } }
  }
}

export interface MarketTrendInsight {
  symbol: string
  marketTrendScore: number
  marketTrendLabel: 'EARLY TREND' | 'MARKET TRENDING' | 'BREAKOUT WATCH' | 'TOO LATE' | 'LOW LIQUIDITY' | 'WATCH'
  coinGeckoTrendingRank: number | null
  dexScreener: {
    available: boolean
    chainId: string | null
    dexId: string | null
    liquidityUsd: number | null
    volume5mUsd: number | null
    volume1hUsd: number | null
    buys5m: number | null
    sells5m: number | null
    buyPressurePct: number | null
    boostsActive: number | null
    pairCreatedAt: number | null
  }
  geckoTerminal: {
    trending: boolean
    rank: number | null
    network: string | null
    poolName: string | null
    liquidityUsd: number | null
    volume24hUsd: number | null
  }
  reasons: string[]
  sources: string[]
  error: string | null
}

const insightCache = new Map<string, { expiresAt: number; insight: Omit<MarketTrendInsight, 'coinGeckoTrendingRank' | 'marketTrendScore' | 'marketTrendLabel' | 'reasons'> }>()
let geckoTerminalCache: { expiresAt: number; pools: GeckoPool[]; error: string | null } | null = null
let geckoTerminalRequest: Promise<{ expiresAt: number; pools: GeckoPool[]; error: string | null }> | null = null

const assetOf = (symbol: string) => symbol.replace(/USDT$/, '').toUpperCase()
const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null

const getGeckoTerminalPools = async () => {
  if (geckoTerminalCache && geckoTerminalCache.expiresAt > Date.now()) return geckoTerminalCache
  if (!geckoTerminalRequest) {
    geckoTerminalRequest = axios.get('https://api.geckoterminal.com/api/v2/networks/trending_pools', {
      params: { page: 1 },
      headers: { Accept: 'application/json;version=20230302' },
      timeout: TIMEOUT_MS
    })
      .then((response) => ({ expiresAt: Date.now() + CACHE_MS, pools: Array.isArray(response.data?.data) ? response.data.data : [], error: null }))
      .catch((error) => ({ expiresAt: Date.now() + CACHE_MS, pools: [] as GeckoPool[], error: `GeckoTerminal unavailable: ${(error as Error).message}` }))
      .finally(() => { geckoTerminalRequest = null })
  }
  geckoTerminalCache = await geckoTerminalRequest
  return geckoTerminalCache
}

const bestDexPair = (pairs: DexPair[], asset: string) => pairs
  .filter((pair) => pair.baseToken?.symbol?.toUpperCase() === asset && ['USDT', 'USDC', 'WETH', 'SOL', 'BNB'].includes(pair.quoteToken?.symbol?.toUpperCase() || ''))
  .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0]

const matchGeckoPool = (pools: GeckoPool[], asset: string) => {
  const matcher = new RegExp(`(^|\\W)${asset}(\\W|$)`, 'i')
  const index = pools.findIndex((pool) => matcher.test(pool.attributes?.name || ''))
  return { pool: index >= 0 ? pools[index] : null, rank: index >= 0 ? index + 1 : null }
}

const getExternalMarketInsight = async (symbol: string) => {
  const cached = insightCache.get(symbol)
  if (cached && cached.expiresAt > Date.now()) return cached.insight
  const asset = assetOf(symbol)
  const [geckoTerminal, dexResult] = await Promise.all([
    getGeckoTerminalPools(),
    axios.get('https://api.dexscreener.com/latest/dex/search', { params: { q: asset }, timeout: TIMEOUT_MS })
      .then((response) => ({ pairs: Array.isArray(response.data?.pairs) ? response.data.pairs as DexPair[] : [], error: null }))
      .catch((error) => ({ pairs: [] as DexPair[], error: `DEX Screener unavailable: ${(error as Error).message}` }))
  ])
  const pair = bestDexPair(dexResult.pairs, asset)
  const buys5m = numeric(pair?.txns?.m5?.buys)
  const sells5m = numeric(pair?.txns?.m5?.sells)
  const totalTrades5m = (buys5m || 0) + (sells5m || 0)
  const buyPressurePct = totalTrades5m ? round(((buys5m || 0) / totalTrades5m) * 100) : null
  const matched = matchGeckoPool(geckoTerminal.pools, asset)
  const insight = {
    symbol,
    dexScreener: {
      available: Boolean(pair),
      chainId: pair?.chainId || null,
      dexId: pair?.dexId || null,
      liquidityUsd: numeric(pair?.liquidity?.usd),
      volume5mUsd: numeric(pair?.volume?.m5),
      volume1hUsd: numeric(pair?.volume?.h1),
      buys5m,
      sells5m,
      buyPressurePct,
      boostsActive: numeric(pair?.boosts?.active),
      pairCreatedAt: numeric(pair?.pairCreatedAt)
    },
    geckoTerminal: {
      trending: Boolean(matched.pool),
      rank: matched.rank,
      network: matched.pool?.relationships?.network?.data?.id || null,
      poolName: matched.pool?.attributes?.name || null,
      liquidityUsd: numeric(matched.pool?.attributes?.reserve_in_usd),
      volume24hUsd: numeric(matched.pool?.attributes?.volume_usd?.h24)
    },
    sources: [...(dexResult.error ? [] : ['DEX Screener']), ...(geckoTerminal.error ? [] : ['GeckoTerminal'])],
    error: [dexResult.error, geckoTerminal.error].filter(Boolean).join(' | ') || null
  }
  insightCache.set(symbol, { expiresAt: Date.now() + CACHE_MS, insight })
  return insight
}

export const buildMarketTrendInsight = async (ticker: MarketTicker, coinGeckoTrendingRank: number | null): Promise<MarketTrendInsight> => {
  const external = await getExternalMarketInsight(ticker.symbol)
  let marketTrendScore = 0
  const reasons: string[] = []
  const liquidity = external.dexScreener.liquidityUsd
  const buyPressure = external.dexScreener.buyPressurePct

  if (ticker.volumeSpikePct >= 150) { marketTrendScore += 30; reasons.push('Volume spike Binance 15m >= 150%') }
  if (ticker.relativeVolume > 2) { marketTrendScore += 20; reasons.push(`Relative volume Binance ${ticker.relativeVolume}x`) }
  if (ticker.priceChange15m >= 0.5 && ticker.priceChange15m <= 4) { marketTrendScore += 15; reasons.push('Harga mulai bergerak 0,5%-4% dalam 15m') }
  if (ticker.price >= ticker.ma10 * 0.995 && ticker.price <= ticker.ma10 * 1.05) { marketTrendScore += 10; reasons.push('Harga dekat area reclaim MA10') }
  if (buyPressure !== null && buyPressure > 55) { marketTrendScore += 10; reasons.push(`DEX buy pressure ${buyPressure}%`) }
  if (coinGeckoTrendingRank) { marketTrendScore += 10; reasons.push(`CoinGecko trending rank #${coinGeckoTrendingRank}`) }
  if (external.geckoTerminal.trending) { marketTrendScore += 5; reasons.push(`GeckoTerminal trending pool #${external.geckoTerminal.rank}`) }
  if (liquidity !== null && liquidity >= 100000) { marketTrendScore += 5; reasons.push('Liquidity DEX >= $100k') }

  if (ticker.priceChange24h > 25) { marketTrendScore -= 25; reasons.push('Harga 24h sudah naik >25%') }
  if (ticker.rsi15m > 75) { marketTrendScore -= 20; reasons.push('RSI >75') }
  if (liquidity !== null && liquidity < 50000) { marketTrendScore -= 20; reasons.push('Liquidity DEX terlalu tipis') }
  marketTrendScore = Math.max(0, Math.min(100, marketTrendScore))

  const marketTrendLabel = ticker.priceChange24h > 25 || ticker.rsi15m > 75
    ? 'TOO LATE'
    : liquidity !== null && liquidity < 50000
      ? 'LOW LIQUIDITY'
      : marketTrendScore >= 70
        ? 'MARKET TRENDING'
        : marketTrendScore >= 50
          ? 'BREAKOUT WATCH'
          : marketTrendScore >= 30
            ? 'EARLY TREND'
            : 'WATCH'

  return { ...external, coinGeckoTrendingRank, marketTrendScore, marketTrendLabel, reasons }
}
