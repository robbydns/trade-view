import { OnchainTokenSummary, OnchainTrade, OnchainWindowMetrics } from './types.js'

export interface DetectorConfig {
  minTradeUsd: number
  windowSeconds: number
  alertThreshold: number
  maxEvents: number
  staleAfterSeconds: number
}

const WINDOW_SECONDS = [60, 300, 900] as const
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, places = 2) => Number(value.toFixed(places))
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const sumUsd = (trades: OnchainTrade[]) => trades.reduce((sumCents, trade) => sumCents + Math.round((trade.usdValue || 0) * 100), 0) / 100

export const tokenKeyOf = (trade: Pick<OnchainTrade, 'chain' | 'tokenAddress' | 'tokenId'>) =>
  `${trade.chain.toLowerCase()}:${(trade.tokenAddress || trade.tokenId).toLowerCase()}`

export const deduplicationKey = (trade: OnchainTrade) => [
  trade.chain.toLowerCase(),
  trade.transactionHash.toLowerCase(),
  trade.traderAddress?.toLowerCase() || '',
  trade.side,
  trade.tokenAmount ?? ''
].join(':')

const emptyWindow = (seconds: 60 | 300 | 900): OnchainWindowMetrics => ({
  seconds, buyUsd: 0, sellUsd: 0, netBuyUsd: 0, largeBuys: 0, largeSells: 0,
  uniqueBuyers: 0, uniqueObservedTraders: 0, largestTradeUsd: null, volumeSpikeRatio: null
})

const scoreSummary = (trades: OnchainTrade[], windows: OnchainTokenSummary['windows'], config: DetectorConfig, now: number) => {
  const knownUsd = trades.filter((trade) => trade.usdValue !== null && trade.usdValue > 0)
  const current15 = windows['15m']
  const baseline = trades
    .filter((trade) => trade.timestamp >= now - 60 * 60_000 && trade.timestamp < now - 15 * 60_000 && trade.usdValue !== null)
    .map((trade) => trade.usdValue as number)
  const baselinePer15m = baseline.reduce((sum, value) => sum + value, 0) / 3
  const volumeSpike = baseline.length >= 5 && baselinePer15m > 0
    ? round(current15.buyUsd / baselinePer15m, 3)
    : null

  const buyPressureConfirmed = current15.netBuyUsd > 0
  const largeBuyAndNetFlow = buyPressureConfirmed && current15.buyUsd + current15.sellUsd > 0
    ? clamp((Math.max(0, current15.netBuyUsd) / Math.max(current15.buyUsd + current15.sellUsd, 1)) * 100 + Math.min(current15.largeBuys, 5) * 8, 0, 100)
    : 0
  const repeatedBuyers = new Map<string, number>()
  for (const trade of knownUsd) {
    if (trade.side === 'buy' && trade.traderAddress && trade.timestamp >= now - 15 * 60_000) {
      repeatedBuyers.set(trade.traderAddress.toLowerCase(), (repeatedBuyers.get(trade.traderAddress.toLowerCase()) || 0) + 1)
    }
  }
  const repeatCount = [...repeatedBuyers.values()].filter((count) => count >= 2).length
  const repeatedAccumulation = buyPressureConfirmed ? clamp(repeatCount * 25, 0, 100) : 0
  const distinctBuyers = buyPressureConfirmed ? clamp(current15.uniqueBuyers * 10, 0, 100) : 0
  const persistence = clamp((Number(windows['1m'].netBuyUsd > 0) + Number(windows['5m'].netBuyUsd > 0) + Number(windows['15m'].netBuyUsd > 0)) / 3 * 100, 0, 100)
  const volumeComponent = volumeSpike === null ? null : buyPressureConfirmed ? clamp((volumeSpike - 1) / 3 * 100, 0, 100) : 0
  current15.volumeSpikeRatio = volumeSpike
  const weighted = [
    { weight: 35, value: largeBuyAndNetFlow },
    { weight: 20, value: volumeComponent },
    { weight: 20, value: repeatedAccumulation },
    { weight: 10, value: distinctBuyers },
    { weight: 15, value: persistence }
  ]
  const availableWeight = weighted.reduce((sum, item) => sum + (item.value === null ? 0 : item.weight), 0)
  const score = availableWeight > 0
    ? round(weighted.reduce((sum, item) => sum + (item.value === null ? 0 : item.value * item.weight), 0) / availableWeight)
    : null
  const observedBuyUsd = current15.buyUsd
  const observedBuyers = new Map<string, number>()
  for (const trade of knownUsd) {
    if (trade.side !== 'buy' || !trade.traderAddress || trade.timestamp < now - 15 * 60_000) continue
    const address = trade.traderAddress.toLowerCase()
    observedBuyers.set(address, (observedBuyers.get(address) || 0) + (trade.usdValue || 0))
  }
  const totalObservedBuyUsd = [...observedBuyers.values()].reduce((sum, value) => sum + value, 0)
  const largestObservedWalletUsd = [...observedBuyers.values()].reduce((largest, value) => {
    return Math.max(largest, value)
  }, 0)
  const concentration = totalObservedBuyUsd > 0 ? round(largestObservedWalletUsd / totalObservedBuyUsd * 100) : null
  const reasons: string[] = []
  if (current15.largeBuys) reasons.push(`${current15.largeBuys} buy swap(s) exceed adaptive large-trade threshold in 15m.`)
  if (current15.netBuyUsd > 0) reasons.push(`Confirmed net buy flow: $${round(current15.netBuyUsd).toLocaleString('en-US')} over 15m.`)
  if (repeatCount) reasons.push(`${repeatCount} observed address(es) bought repeatedly; addresses are not assumed independent.`)
  if (current15.uniqueBuyers) reasons.push(`${current15.uniqueBuyers} distinct observed buyer address(es) in 15m.`)
  if (volumeSpike === null) reasons.push('Historical volume baseline unavailable; score confidence is reduced.')
  else if (volumeSpike >= 1.5) reasons.push(`Buy volume is ${volumeSpike}x the available prior 15m baseline.`)
  if (current15.sellUsd > current15.buyUsd) reasons.push('Sell volume exceeds buy volume; sell pressure reduces bullish evidence.')

  const lastTradeAt = trades.reduce<number | null>((latest, trade) => latest === null || trade.timestamp > latest ? trade.timestamp : latest, null)
  const freshness = lastTradeAt === null ? null : Math.max(0, Math.floor((now - lastTradeAt) / 1000))
  const missingPrice = trades.some((trade) => trade.side !== 'unknown' && trade.usdValue === null)
  const unknownDirection = trades.some((trade) => trade.side === 'unknown')
  const stale = freshness === null || freshness > config.staleAfterSeconds
  const confidence: OnchainTokenSummary['confidence'] = missingPrice || unknownDirection || stale || volumeSpike === null || availableWeight < 80
    ? 'INCOMPLETE'
    : score !== null && score >= 70 && volumeSpike !== null ? 'HIGH' : score !== null && score >= 40 ? 'MEDIUM' : 'LOW'
  const labels: OnchainTokenSummary['labels'] = []
  if (current15.largeBuys > 0) labels.push('LARGE_ONCHAIN_BUY')
  if (repeatCount > 0 && current15.netBuyUsd > 0) labels.push('REPEATED_WALLET_ACCUMULATION')
  if (current15.netBuyUsd > 0 && (score || 0) >= config.alertThreshold) labels.push('POSSIBLE_ACCUMULATION')
  if (current15.netBuyUsd < 0 && current15.largeSells > 0) labels.push('POSSIBLE_DISTRIBUTION')
  return {
    score: missingPrice || unknownDirection || stale || volumeSpike === null ? null : score,
    confidence,
    labels,
    repeatedBuyerCount: repeatCount,
    observedBuyerConcentrationPct: observedBuyUsd ? concentration : null,
    components: { largeBuyAndNetFlow, volumeSpike: volumeComponent, repeatedAccumulation, distinctBuyers, persistence },
    reasons,
    lastTradeAt,
    freshness
  }
}

export const buildTokenSummaries = (inputTrades: OnchainTrade[], config: DetectorConfig, now = Date.now()): OnchainTokenSummary[] => {
  const unique = new Map<string, OnchainTrade>()
  for (const trade of inputTrades) {
    if (now - trade.timestamp > config.windowSeconds * 1000 || trade.timestamp > now + 30_000) continue
    if (!trade.transactionHash || !trade.tokenId || trade.confirmationStatus !== 'confirmed') continue
    const key = deduplicationKey(trade)
    if (!unique.has(key)) unique.set(key, trade)
  }

  const byToken = new Map<string, OnchainTrade[]>()
  for (const trade of unique.values()) {
    const key = tokenKeyOf(trade)
    byToken.set(key, [...(byToken.get(key) || []), trade])
  }

  return [...byToken.entries()].map(([key, trades]) => {
    const first = trades[0]
    const windows = {} as OnchainTokenSummary['windows']
    for (const seconds of WINDOW_SECONDS) {
      const selected = trades.filter((trade) => trade.timestamp >= now - seconds * 1000)
      const buys = selected.filter((trade) => trade.side === 'buy' && trade.usdValue !== null)
      const sells = selected.filter((trade) => trade.side === 'sell' && trade.usdValue !== null)
      const unknown = selected.filter((trade) => trade.side === 'unknown')
      const buyUsd = sumUsd(buys)
      const sellUsd = sumUsd(sells)
      const priorWindow = trades.filter((trade) => trade.timestamp >= now - seconds * 2000 && trade.timestamp < now - seconds * 1000 && trade.side === 'buy' && trade.usdValue !== null)
      const baselineBuyUsd = sumUsd(priorWindow)
      const observedBaseline = median(trades.filter((trade) => trade.usdValue !== null && trade.timestamp < now - seconds * 1000).map((trade) => trade.usdValue as number))
      const adaptiveThreshold = Math.max(config.minTradeUsd, (observedBaseline || config.minTradeUsd) * 3)
      windows[seconds === 60 ? '1m' : seconds === 300 ? '5m' : '15m'] = {
        seconds,
        buyUsd: round(buyUsd),
        sellUsd: round(sellUsd),
        netBuyUsd: round(buyUsd - sellUsd),
        largeBuys: buys.filter((trade) => (trade.usdValue || 0) >= adaptiveThreshold).length,
        largeSells: sells.filter((trade) => (trade.usdValue || 0) >= adaptiveThreshold).length,
        uniqueBuyers: new Set(buys.map((trade) => trade.traderAddress?.toLowerCase()).filter(Boolean)).size,
        uniqueObservedTraders: new Set(selected.map((trade) => trade.traderAddress?.toLowerCase()).filter(Boolean)).size,
        largestTradeUsd: selected.reduce<number | null>((largest, trade) => trade.usdValue === null ? largest : Math.max(largest || 0, trade.usdValue), null),
        volumeSpikeRatio: priorWindow.length >= 5 && baselineBuyUsd > 0 ? round(buyUsd / baselineBuyUsd, 3) : null
      }
      if (unknown.length) {
        // Unknown directions are tracked for data completeness but never contribute to buy/sell totals or score.
      }
    }
    const scored = scoreSummary(trades, windows, config, now)
    const allKnown = trades.every((trade) => trade.usdValue !== null && trade.side !== 'unknown')
    return {
      tokenKey: key,
      chain: first.chain,
      tokenAddress: first.tokenAddress,
      tokenId: first.tokenId,
      tokenSymbol: first.tokenSymbol || null,
      lastTradeAt: scored.lastTradeAt,
      dataFreshnessSeconds: scored.freshness,
      dataComplete: allKnown && scored.freshness !== null && scored.freshness <= config.staleAfterSeconds,
      score: scored.score,
      confidence: scored.confidence,
      labels: scored.labels,
      windows,
      repeatedBuyerCount: scored.repeatedBuyerCount,
      observedBuyerConcentrationPct: scored.observedBuyerConcentrationPct,
      components: scored.components,
      reasons: scored.reasons
    }
  }).sort((a, b) => (b.score || 0) - (a.score || 0))
}

export const detectOnchainAlerts = (summaries: OnchainTokenSummary[]) => summaries.flatMap((summary) => {
  if (summary.confidence === 'INCOMPLETE') return []
  const alertTypes = new Set<string>()
  if (summary.labels.includes('LARGE_ONCHAIN_BUY')) alertTypes.add('ONCHAIN_WHALE_ALERT')
  if (summary.labels.includes('REPEATED_WALLET_ACCUMULATION') || summary.labels.includes('POSSIBLE_ACCUMULATION')) alertTypes.add('ONCHAIN_ACCUMULATION_ALERT')
  if (summary.labels.includes('POSSIBLE_DISTRIBUTION')) alertTypes.add('ONCHAIN_DISTRIBUTION_ALERT')
  return [...alertTypes].map((type) => ({
    key: `${summary.tokenKey}:${type}:${Math.floor((summary.lastTradeAt || 0) / 300_000)}`,
    type,
    summary
  }))
})
