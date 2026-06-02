import axios from 'axios';
const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;
const insightCache = new Map();
let geckoTerminalCache = null;
let geckoTerminalRequest = null;
const assetOf = (symbol) => symbol.replace(/USDT$/, '').toUpperCase();
const round = (value, digits = 2) => Number(value.toFixed(digits));
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const getGeckoTerminalPools = async () => {
    if (geckoTerminalCache && geckoTerminalCache.expiresAt > Date.now())
        return geckoTerminalCache;
    if (!geckoTerminalRequest) {
        geckoTerminalRequest = axios.get('https://api.geckoterminal.com/api/v2/networks/trending_pools', {
            params: { page: 1 },
            headers: { Accept: 'application/json;version=20230302' },
            timeout: TIMEOUT_MS
        })
            .then((response) => ({ expiresAt: Date.now() + CACHE_MS, pools: Array.isArray(response.data?.data) ? response.data.data : [], error: null }))
            .catch((error) => ({ expiresAt: Date.now() + CACHE_MS, pools: [], error: `GeckoTerminal unavailable: ${error.message}` }))
            .finally(() => { geckoTerminalRequest = null; });
    }
    geckoTerminalCache = await geckoTerminalRequest;
    return geckoTerminalCache;
};
const bestDexPair = (pairs, asset) => pairs
    .filter((pair) => pair.baseToken?.symbol?.toUpperCase() === asset && ['USDT', 'USDC', 'WETH', 'SOL', 'BNB'].includes(pair.quoteToken?.symbol?.toUpperCase() || ''))
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];
const matchGeckoPool = (pools, asset) => {
    const matcher = new RegExp(`(^|\\W)${asset}(\\W|$)`, 'i');
    const index = pools.findIndex((pool) => matcher.test(pool.attributes?.name || ''));
    return { pool: index >= 0 ? pools[index] : null, rank: index >= 0 ? index + 1 : null };
};
const getExternalMarketInsight = async (symbol) => {
    const cached = insightCache.get(symbol);
    if (cached && cached.expiresAt > Date.now())
        return cached.insight;
    const asset = assetOf(symbol);
    const [geckoTerminal, dexResult] = await Promise.all([
        getGeckoTerminalPools(),
        axios.get('https://api.dexscreener.com/latest/dex/search', { params: { q: asset }, timeout: TIMEOUT_MS })
            .then((response) => ({ pairs: Array.isArray(response.data?.pairs) ? response.data.pairs : [], error: null }))
            .catch((error) => ({ pairs: [], error: `DEX Screener unavailable: ${error.message}` }))
    ]);
    const pair = bestDexPair(dexResult.pairs, asset);
    const buys5m = numeric(pair?.txns?.m5?.buys);
    const sells5m = numeric(pair?.txns?.m5?.sells);
    const totalTrades5m = (buys5m || 0) + (sells5m || 0);
    const buyPressurePct = totalTrades5m ? round(((buys5m || 0) / totalTrades5m) * 100) : null;
    const matched = matchGeckoPool(geckoTerminal.pools, asset);
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
    };
    insightCache.set(symbol, { expiresAt: Date.now() + CACHE_MS, insight });
    return insight;
};
export const buildMarketTrendInsight = async (ticker, coinGeckoTrendingRank) => {
    const external = await getExternalMarketInsight(ticker.symbol);
    let marketTrendScore = 0;
    const reasons = [];
    const liquidity = external.dexScreener.liquidityUsd;
    const buyPressure = external.dexScreener.buyPressurePct;
    if (ticker.volumeSpikePct >= 150) {
        marketTrendScore += 30;
        reasons.push('Volume spike Binance 15m >= 150%');
    }
    if (ticker.relativeVolume > 2) {
        marketTrendScore += 20;
        reasons.push(`Relative volume Binance ${ticker.relativeVolume}x`);
    }
    if (ticker.priceChange15m >= 0.5 && ticker.priceChange15m <= 4) {
        marketTrendScore += 15;
        reasons.push('Harga mulai bergerak 0,5%-4% dalam 15m');
    }
    if (ticker.price >= ticker.ma10 * 0.995 && ticker.price <= ticker.ma10 * 1.05) {
        marketTrendScore += 10;
        reasons.push('Harga dekat area reclaim MA10');
    }
    if (buyPressure !== null && buyPressure > 55) {
        marketTrendScore += 10;
        reasons.push(`DEX buy pressure ${buyPressure}%`);
    }
    if (coinGeckoTrendingRank) {
        marketTrendScore += 10;
        reasons.push(`CoinGecko trending rank #${coinGeckoTrendingRank}`);
    }
    if (external.geckoTerminal.trending) {
        marketTrendScore += 5;
        reasons.push(`GeckoTerminal trending pool #${external.geckoTerminal.rank}`);
    }
    if (liquidity !== null && liquidity >= 100000) {
        marketTrendScore += 5;
        reasons.push('Liquidity DEX >= $100k');
    }
    if (ticker.priceChange24h > 25) {
        marketTrendScore -= 25;
        reasons.push('Harga 24h sudah naik >25%');
    }
    if (ticker.rsi15m > 75) {
        marketTrendScore -= 20;
        reasons.push('RSI >75');
    }
    if (liquidity !== null && liquidity < 50000) {
        marketTrendScore -= 20;
        reasons.push('Liquidity DEX terlalu tipis');
    }
    marketTrendScore = Math.max(0, Math.min(100, marketTrendScore));
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
                        : 'WATCH';
    return { ...external, coinGeckoTrendingRank, marketTrendScore, marketTrendLabel, reasons };
};
