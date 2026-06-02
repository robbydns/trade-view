import axios from 'axios';
import dotenv from 'dotenv';
import { buildMarketTrendInsight } from './market-trends.js';
dotenv.config();
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const REDDIT_ACCESS_TOKEN = process.env.REDDIT_ACCESS_TOKEN || '';
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || '';
const CACHE_MS = 10 * 60 * 1000;
const SOCIAL_TIMEOUT_MS = 8000;
const POSITIVE_WORDS = ['bullish', 'breakout', 'pump', 'buy', 'moon', 'rally', 'surge', 'gem', 'uptrend', 'support', 'accumulate'];
const NEGATIVE_WORDS = ['bearish', 'dump', 'sell', 'scam', 'rug', 'crash', 'downtrend', 'avoid', 'risk', 'overbought'];
const socialCache = new Map();
let trendingCache = null;
const baseAsset = (symbol) => symbol.replace(/USDT$/, '');
const round = (value, digits = 2) => Number(value.toFixed(digits));
const isConfiguredToken = (value) => Boolean(value && !value.startsWith('your-') && !value.startsWith('token-dari-'));
const sentimentFromPosts = (posts) => {
    let positive = 0;
    let negative = 0;
    for (const post of posts) {
        const text = `${post.data?.title || ''} ${post.data?.selftext || ''}`.toLowerCase();
        positive += POSITIVE_WORDS.filter((word) => text.includes(word)).length;
        negative += NEGATIVE_WORDS.filter((word) => text.includes(word)).length;
    }
    const total = positive + negative;
    if (!total)
        return { score: 0, label: 'NEUTRAL' };
    const score = round(((positive - negative) / total) * 100);
    return { score, label: score >= 20 ? 'POSITIVE' : score <= -20 ? 'NEGATIVE' : 'NEUTRAL' };
};
const getTrendingRanks = async () => {
    if (trendingCache && trendingCache.expiresAt > Date.now())
        return trendingCache;
    try {
        const response = await axios.get(`${COINGECKO_API_URL}/search/trending`, { timeout: SOCIAL_TIMEOUT_MS });
        const coins = Array.isArray(response.data?.coins) ? response.data.coins : [];
        const ranks = new Map();
        coins.forEach((coin, index) => {
            const symbol = coin.item?.symbol?.toUpperCase();
            if (symbol && !ranks.has(symbol))
                ranks.set(symbol, index + 1);
        });
        trendingCache = { expiresAt: Date.now() + CACHE_MS, ranks, error: null };
    }
    catch (error) {
        trendingCache = { expiresAt: Date.now() + CACHE_MS, ranks: new Map(), error: `CoinGecko Trending unavailable: ${error.message}` };
    }
    return trendingCache;
};
const getRedditInsight = async (symbol) => {
    const asset = baseAsset(symbol);
    if (!isConfiguredToken(REDDIT_ACCESS_TOKEN))
        throw new Error('Reddit OAuth token belum dikonfigurasi');
    try {
        const response = await axios.get('https://oauth.reddit.com/search', {
            params: { q: `${asset} crypto`, sort: 'new', t: 'day', limit: 25, type: 'link' },
            headers: { Authorization: `Bearer ${REDDIT_ACCESS_TOKEN}`, 'User-Agent': 'crypto-signal-compass/0.1 read-only-social-radar' },
            timeout: SOCIAL_TIMEOUT_MS
        });
        const posts = Array.isArray(response.data?.data?.children) ? response.data.data.children : [];
        const sentiment = sentimentFromPosts(posts);
        return {
            mentions: posts.length,
            engagement: posts.reduce((sum, post) => sum + Number(post.data?.score || 0) + Number(post.data?.num_comments || 0), 0),
            sentiment
        };
    }
    catch (error) {
        throw new Error(`Reddit unavailable: ${error.message}`);
    }
};
const getXInsight = async (symbol) => {
    if (!isConfiguredToken(X_BEARER_TOKEN))
        throw new Error('X API bearer token belum dikonfigurasi');
    const asset = baseAsset(symbol);
    const query = `(${asset} OR $${asset}) crypto -is:retweet lang:en`;
    try {
        const headers = { Authorization: `Bearer ${X_BEARER_TOKEN}` };
        const [postsResponse, countsResponse] = await Promise.all([
            axios.get('https://api.x.com/2/tweets/search/recent', {
                params: { query, max_results: 25, 'tweet.fields': 'created_at,public_metrics' },
                headers,
                timeout: SOCIAL_TIMEOUT_MS
            }),
            axios.get('https://api.x.com/2/tweets/counts/recent', {
                params: { query, granularity: 'day' },
                headers,
                timeout: SOCIAL_TIMEOUT_MS
            })
        ]);
        const posts = Array.isArray(postsResponse.data?.data) ? postsResponse.data.data : [];
        const sentiment = sentimentFromPosts(posts.map((post) => ({ data: { title: post.text } })));
        const engagement = posts.reduce((sum, post) => {
            const metrics = post.public_metrics;
            return sum + Number(metrics?.like_count || 0) + Number(metrics?.retweet_count || 0) + Number(metrics?.reply_count || 0) + Number(metrics?.quote_count || 0);
        }, 0);
        return { posts7d: Number(countsResponse.data?.meta?.total_tweet_count || 0), sampleSize: posts.length, engagement, sentiment };
    }
    catch (error) {
        const detail = axios.isAxiosError(error) ? error.response?.data?.detail || error.response?.data?.title : null;
        throw new Error(`X API unavailable: ${detail || error.message}`);
    }
};
export const getSocialInsight = async (symbol) => {
    const cached = socialCache.get(symbol);
    if (cached && cached.expiresAt > Date.now())
        return cached.insight;
    const trending = await getTrendingRanks();
    const sources = trending.error ? [] : ['CoinGecko Trending'];
    const [redditResult, xResult] = await Promise.allSettled([getRedditInsight(symbol), getXInsight(symbol)]);
    const reddit = redditResult.status === 'fulfilled' ? redditResult.value : null;
    const x = xResult.status === 'fulfilled' ? xResult.value : null;
    const sentimentScores = [reddit?.sentiment.score, x?.sentiment.score].filter((score) => typeof score === 'number');
    const sentimentScore = sentimentScores.length ? round(sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length) : null;
    const sentimentLabel = sentimentScore === null ? 'UNAVAILABLE' : sentimentScore >= 20 ? 'POSITIVE' : sentimentScore <= -20 ? 'NEGATIVE' : 'NEUTRAL';
    const insight = {
        symbol,
        redditMentions24h: reddit?.mentions ?? null,
        redditEngagement: reddit?.engagement ?? null,
        xPosts7d: x?.posts7d ?? null,
        xRecentSampleSize: x?.sampleSize ?? null,
        xEngagement: x?.engagement ?? null,
        xSentimentScore: x?.sentiment.score ?? null,
        xSentimentLabel: x?.sentiment.label ?? 'UNAVAILABLE',
        sentimentScore,
        sentimentLabel,
        coinGeckoTrendingRank: trending.ranks.get(baseAsset(symbol)) || null,
        sources: [...sources, ...(reddit ? ['Reddit OAuth search'] : []), ...(x ? ['X recent search'] : [])],
        updatedAt: new Date().toISOString(),
        error: [
            trending.error,
            redditResult.status === 'rejected' ? redditResult.reason.message : null,
            xResult.status === 'rejected' ? xResult.reason.message : null
        ].filter(Boolean).join(' | ') || null
    };
    socialCache.set(symbol, { expiresAt: Date.now() + CACHE_MS, insight });
    return insight;
};
export const buildTwentyPercentRadar = async (tickers) => {
    const technicalCandidates = tickers
        .filter((ticker) => !ticker.isOverheated && ticker.priceChange24h < 25)
        .map((ticker) => {
        const trendBonus = ticker.ma10 > ticker.ma30 ? 5 : 0;
        const volumeBonus = ticker.relativeVolume >= 1.5 ? 5 : 0;
        const resistanceExtension = Math.max(ticker.estimatedUpsideHighPct, 20 + trendBonus + volumeBonus);
        return { ticker, technicalTargetPct: Math.min(45, round(resistanceExtension)) };
    })
        .filter(({ ticker, technicalTargetPct }) => technicalTargetPct >= 20 && ticker.score >= 45 && ticker.rsi15m >= 42 && ticker.rsi15m <= 72)
        .sort((a, b) => b.ticker.score - a.ticker.score || b.ticker.relativeVolume - a.ticker.relativeVolume)
        .slice(0, 30);
    const records = [];
    for (let offset = 0; offset < technicalCandidates.length; offset += 4) {
        const chunk = technicalCandidates.slice(offset, offset + 4);
        records.push(...await Promise.all(chunk.map(async ({ ticker, technicalTargetPct }) => {
            const social = await getSocialInsight(ticker.symbol);
            const market = await buildMarketTrendInsight(ticker, social.coinGeckoTrendingRank);
            const socialBoost = social.sentimentScore !== null && social.sentimentScore >= 20;
            const confidence = ticker.score >= 80 && market.marketTrendScore >= 70 && (socialBoost || market.geckoTerminal.trending) ? 'HIGH' : ticker.score >= 55 && market.marketTrendScore >= 30 ? 'MEDIUM' : 'LOW';
            const reasons = [
                ...ticker.reasons.slice(0, 4),
                ...market.reasons.slice(0, 4),
                `Skenario resistance teknikal memberi ruang hingga +${technicalTargetPct}%`,
                social.coinGeckoTrendingRank ? `CoinGecko trending rank #${social.coinGeckoTrendingRank}` : 'Belum masuk CoinGecko trending',
                social.sentimentLabel === 'UNAVAILABLE' ? 'Sentimen sosial belum tersedia' : `Sentimen sosial gabungan ${social.sentimentLabel.toLowerCase()} (${social.sentimentScore})`
            ];
            return { symbol: ticker.symbol, price: ticker.price, signal: ticker.signal, score: ticker.score, priceChange15m: ticker.priceChange15m, priceChange1h: ticker.priceChange1h, priceChange24h: ticker.priceChange24h, volumeSpikePct: ticker.volumeSpikePct, relativeVolume: ticker.relativeVolume, rsi15m: ticker.rsi15m, technicalTargetPct, confidence, reasons, social, market };
        })));
    }
    return { updatedAt: new Date().toISOString(), records: records.sort((a, b) => b.market.marketTrendScore - a.market.marketTrendScore || b.score - a.score).slice(0, 20) };
};
