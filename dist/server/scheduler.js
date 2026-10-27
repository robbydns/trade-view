import fs from 'fs';
import { BinanceRealtimeService } from './binance.js';
import { sendTelegramAlert } from './alert.js';
import { getIdrRate } from './rates.js';
import { store } from './store.js';
import { buildTwentyPercentRadar } from './social.js';
import { getOnchainAlertHistory, getOnchainConfig, getOnchainRecentTrades, getOnchainStatus, getOnchainSummaries, onOnchainAlert, startOnchainMonitoring, stopOnchainMonitoring } from './onchain/service.js';
const binance = new BinanceRealtimeService();
const cooldownBySymbol = new Map();
const watchlistFile = new URL('./watchlist.json', import.meta.url);
let lastSnapshotAt = 0;
let scanTimer = null;
let removeOnchainAlertListener = null;
const loadWatchlist = () => {
    try {
        const saved = JSON.parse(fs.readFileSync(watchlistFile, 'utf8'));
        return new Set(Array.isArray(saved) ? saved : []);
    }
    catch {
        return new Set();
    }
};
const watchlist = loadWatchlist();
const signalHistory = new Map();
let response = {
    status: 'DISCONNECTED', lastUpdated: null, error: null, tickers: [], alertsSentToday: 0,
    restConnected: false, websocketConnected: false, idrRate: null, idrRateUpdatedAt: null, idrRateSource: null
};
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const normalizeSymbol = (symbol) => symbol.trim().toUpperCase().endsWith('USDT') ? symbol.trim().toUpperCase() : `${symbol.trim().toUpperCase()}USDT`;
const pct = (current, previous) => previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(2)) : 0;
const refresh = async () => {
    const settings = store.get().settings;
    const tickers = await binance.scan([...watchlist], settings);
    const connection = binance.getConnection();
    const idrRate = await getIdrRate();
    response = { ...connection, tickers: connection.status === 'ERROR' ? [] : tickers, alertsSentToday: store.get().debug.alertsSentToday, idrRate: idrRate.rate, idrRateUpdatedAt: idrRate.updatedAt, idrRateSource: idrRate.rate ? 'CoinGecko' : null };
    for (const ticker of response.tickers) {
        const history = signalHistory.get(ticker.symbol) || [];
        signalHistory.set(ticker.symbol, [ticker, ...history].slice(0, 20));
    }
    updatePersistedStatuses(response.tickers);
    captureSnapshots(response.tickers);
    await persistQualifiedSignals(response.tickers);
    store.updateDebug({ lastScanTime: new Date().toISOString(), coinsScanned: response.tickers.length, coinsQualified: response.tickers.filter(isQualified).length });
};
const hasTradableRisk = (ticker) => ticker.volume24h >= 300000 &&
    ticker.volumeSpikePct <= 1500 &&
    ticker.relativeVolume <= 12 &&
    ticker.rsi15m >= 42 &&
    ticker.rsi15m <= 72 &&
    ticker.macd.trend !== 'BEARISH' &&
    ticker.orderBook.imbalancePct >= -15 &&
    ticker.pumpProjection.action !== 'AVOID' &&
    ticker.pumpProjection.riskRewardToTp1 !== null &&
    ticker.pumpProjection.riskRewardToTp1 >= 0.75 &&
    !ticker.isOverheated;
const getAlertMode = (ticker) => {
    if (!hasTradableRisk(ticker))
        return 'NO_ALERT';
    const earlyIgnition = ticker.score >= 62 &&
        ticker.priceChange15m >= -0.2 &&
        ticker.priceChange15m <= 3.2 &&
        ticker.priceChange1h >= -0.2 &&
        ticker.priceChange24h >= -4 &&
        ticker.priceChange24h <= 14 &&
        ticker.volumeSpikePct >= 20 &&
        ticker.volumeSpikePct <= 220 &&
        ticker.relativeVolume >= 1.05 &&
        ticker.rsi15m <= 66 &&
        ticker.ma10 >= ticker.ma30 * 0.998 &&
        ticker.distanceFromMa10Pct >= -1.2 &&
        ticker.distanceFromMa10Pct <= 4.5 &&
        (ticker.macd.crossover === 'BULLISH' || ticker.macd.histogram > ticker.macd.previousHistogram) &&
        ticker.orderBook.pressure !== 'SELL';
    if (earlyIgnition)
        return 'EARLY_IGNITION';
    const breakoutConfirm = ticker.score >= 72 &&
        ['EARLY SETUP', 'BUY WATCH', 'BREAKOUT', 'STRONG BUY'].includes(ticker.signal) &&
        ticker.priceChange15m >= 0.3 &&
        ticker.priceChange15m <= 7 &&
        ticker.priceChange1h >= 0.2 &&
        ticker.priceChange1h <= 13 &&
        ticker.priceChange24h <= 22 &&
        ticker.volumeSpikePct >= 70 &&
        ticker.relativeVolume >= 1.35 &&
        ticker.distanceFromMa10Pct <= 7 &&
        ticker.orderBook.imbalancePct >= -8;
    if (breakoutConfirm)
        return 'BREAKOUT_CONFIRM';
    const pullbackReentry = ticker.score >= 58 &&
        ticker.pumpProjection.action === 'WAIT_PULLBACK' &&
        ticker.price >= ticker.support1 * 0.995 &&
        ticker.price <= ticker.ma10 * 1.025 &&
        ticker.priceChange1h >= -0.6 &&
        ticker.rsi15m >= 43 &&
        ticker.rsi15m <= 64 &&
        ticker.orderBook.pressure !== 'SELL';
    return pullbackReentry ? 'PULLBACK_REENTRY' : 'NO_ALERT';
};
const isQualified = (ticker) => getAlertMode(ticker) !== 'NO_ALERT';
const recordStatus = (ticker) => !ticker ? 'EXPIRED' : ticker.isOverheated ? 'OVERHEATED' : 'ACTIVE';
const updatePersistedStatuses = (tickers) => {
    const currentBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
    store.mutate((draft) => {
        for (const record of draft.signalHistory) {
            const current = currentBySymbol.get(record.symbol);
            record.currentPrice = current?.price || record.currentPrice;
            record.gainLossPct = pct(record.currentPrice, record.priceAtAlert);
            record.status = recordStatus(current);
            const recordTime = Date.parse(record.timestamp);
            const symbolSnapshots = draft.snapshots.filter((snapshot) => snapshot.symbol === record.symbol && Date.parse(snapshot.timestamp) >= recordTime);
            const nearestAfter = (hours) => {
                const target = recordTime + hours * 60 * 60 * 1000;
                const tolerance = 20 * 60 * 1000;
                const nearest = symbolSnapshots.reduce((best, snapshot) => {
                    const distance = Math.abs(Date.parse(snapshot.timestamp) - target);
                    return distance <= tolerance && (!best || distance < Math.abs(Date.parse(best.timestamp) - target)) ? snapshot : best;
                }, null);
                return nearest ? pct(nearest.price, record.priceAtAlert) : null;
            };
            const snapshots4h = symbolSnapshots.filter((snapshot) => Date.parse(snapshot.timestamp) <= recordTime + 4 * 60 * 60 * 1000);
            record.gain1hPct = nearestAfter(1);
            record.gain4hPct = nearestAfter(4);
            record.gain24hPct = nearestAfter(24);
            record.maxGain4hPct = snapshots4h.length ? Math.max(...snapshots4h.map((snapshot) => pct(snapshot.price, record.priceAtAlert))) : null;
            record.maxDrawdown4hPct = snapshots4h.length ? Math.min(...snapshots4h.map((snapshot) => pct(snapshot.price, record.priceAtAlert))) : null;
        }
    });
};
const captureSnapshots = (tickers) => {
    if (Date.now() - lastSnapshotAt < 5 * 60 * 1000)
        return;
    lastSnapshotAt = Date.now();
    const timestamp = new Date().toISOString();
    const records = tickers.map((ticker) => ({ symbol: ticker.symbol, timestamp, price: ticker.price, volume: ticker.volume15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, rsi: ticker.rsi15m, openInterest: ticker.openInterest }));
    store.addSnapshots(records);
};
const persistQualifiedSignals = async (tickers) => {
    for (const ticker of tickers) {
        const alertMode = getAlertMode(ticker);
        if (alertMode === 'NO_ALERT')
            continue;
        const existing = store.get().signalHistory.find((record) => record.symbol === ticker.symbol && Date.now() - Date.parse(record.timestamp) < 30 * 60 * 1000);
        if (existing)
            continue;
        const record = { id: id(), symbol: ticker.symbol, priceAtAlert: ticker.price, currentPrice: ticker.price, gainLossPct: 0, score: ticker.score, rsi: ticker.rsi15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, openInterest: ticker.openInterest, signal: ticker.signal, timestamp: new Date().toISOString(), telegramSent: false, status: 'ACTIVE', gain1hPct: null, gain4hPct: null, gain24hPct: null, maxGain4hPct: null, maxDrawdown4hPct: null };
        store.addSignal(record);
        await sendLoggedTelegram(ticker, record.id, alertMode);
    }
};
const sendLoggedTelegram = async (ticker, historyId, alertMode = getAlertMode(ticker)) => {
    const now = Date.now();
    const lastPersistedSent = store.get().telegramLogs.find((record) => record.symbol === ticker.symbol && record.status === 'SENT');
    const lastSentAt = Math.max(cooldownBySymbol.get(ticker.symbol) || 0, lastPersistedSent ? Date.parse(lastPersistedSent.timestamp) : 0);
    if (lastSentAt + 30 * 60 * 1000 > now) {
        addTelegramLog(ticker, 'SKIPPED', 'Cooldown 30 menit masih aktif.');
        return;
    }
    try {
        const telegramResponse = await sendTelegramAlert(formatTelegramAlert(ticker, alertMode), true);
        cooldownBySymbol.set(ticker.symbol, now);
        addTelegramLog(ticker, 'SENT', telegramResponse);
        store.mutate((draft) => {
            const history = draft.signalHistory.find((record) => record.id === historyId);
            if (history)
                history.telegramSent = true;
            draft.debug.alertsSentToday += 1;
            draft.debug.lastAlertCoin = ticker.symbol;
            draft.debug.lastAlertTime = new Date().toISOString();
            draft.debug.lastTelegramResponse = telegramResponse;
            draft.debug.lastTelegramError = null;
        });
    }
    catch (error) {
        const message = error.message;
        addTelegramLog(ticker, 'FAILED', message);
        store.updateDebug({ lastTelegramError: message });
    }
};
const addTelegramLog = (ticker, status, message) => store.addTelegramLog({ id: id(), timestamp: new Date().toISOString(), symbol: ticker.symbol, score: ticker.score, signal: ticker.signal, status, response: message });
const formatTelegramAlert = (ticker, alertMode) => `Crypto Signal Alert

Coin: ${ticker.symbol}
Mode: ${alertMode}
Signal: ${ticker.signal}
Score: ${ticker.score}
Whale Score: ${ticker.whale.whaleScore} (${ticker.whale.category})
Breakout State: ${ticker.whale.breakoutState}
Harga: ${ticker.price}
15m Change: ${ticker.priceChange15m >= 0 ? '+' : ''}${ticker.priceChange15m}%
Volume Spike: ${ticker.volumeSpikePct >= 0 ? '+' : ''}${ticker.volumeSpikePct}%
Net Taker Flow: ${ticker.whale.netTakerFlow}
Order Book: ${ticker.orderBook.pressure} | bid/ask ${ticker.orderBook.bidAskRatio}x | imbalance ${ticker.orderBook.imbalancePct}%
Whale Reasons: ${ticker.whale.reasons.slice(0, 2).join(' | ') || 'No strong whale signal yet'}
Projection: ${ticker.pumpProjection.label} ${ticker.pumpProjection.confidence} | target ${ticker.pumpProjection.technicalTarget} (+${ticker.pumpProjection.upsideToTechnicalPct}%) | stretch ${ticker.pumpProjection.stretchTarget} (+${ticker.pumpProjection.upsideToStretchPct}%)
Open Interest: ${ticker.openInterest ?? 'N/A'}
Action: ${ticker.pumpProjection.action}
Entry Zone: ${ticker.pumpProjection.entryLow ?? 'NO TRADE'}-${ticker.pumpProjection.entryHigh ?? 'NO TRADE'}
Trigger: ${ticker.pumpProjection.triggerPrice ?? 'N/A'}
TP: ${ticker.pumpProjection.takeProfit1} / ${ticker.pumpProjection.takeProfit2}${ticker.pumpProjection.takeProfit3 ? ` / ${ticker.pumpProjection.takeProfit3}` : ''}
SL: ${ticker.pumpProjection.stopLoss}
Plan: ${ticker.pumpProjection.entryNote}

Disclaimer: Bukan nasihat finansial.`;
export const initializeScheduler = async () => {
    binance.start();
    if (!removeOnchainAlertListener) {
        removeOnchainAlertListener = onOnchainAlert(({ type, summary }) => {
            const window = summary.windows['15m'];
            const message = `On-chain ${type}\n\nChain: ${summary.chain}\nToken: ${summary.tokenSymbol || 'Unknown'}\nAddress: ${summary.tokenAddress}\nBuy 15m: $${window.buyUsd.toLocaleString('en-US')}\nSell 15m: $${window.sellUsd.toLocaleString('en-US')}\nNet flow 15m: $${window.netBuyUsd.toLocaleString('en-US')}\nObserved buyers: ${window.uniqueBuyers}\nOn-chain score: ${summary.score ?? 'INCOMPLETE'} / 100\nConfidence: ${summary.confidence}\nFreshness: ${summary.dataFreshnessSeconds ?? 'unknown'}s\nReasons: ${summary.reasons.join(' | ')}\n\nDEX trade feed; not a buy recommendation.`;
            void sendTelegramAlert(message, true).catch(() => console.warn('On-chain alert delivery failed; check Telegram configuration.'));
        });
    }
    startOnchainMonitoring();
    await refresh();
    if (scanTimer)
        clearInterval(scanTimer);
    scanTimer = setInterval(refresh, 20000);
};
export const stopScheduler = () => {
    if (scanTimer)
        clearInterval(scanTimer);
    scanTimer = null;
    removeOnchainAlertListener?.();
    removeOnchainAlertListener = null;
    stopOnchainMonitoring();
};
export const getOnchainDashboard = () => ({
    status: getOnchainStatus(),
    config: getOnchainConfig(),
    summaries: getOnchainSummaries(),
    recentTrades: getOnchainRecentTrades(),
    alerts: getOnchainAlertHistory()
});
export const getScanResponse = () => response;
export const getWatchlist = () => [...watchlist];
const saveWatchlist = () => fs.writeFileSync(watchlistFile, JSON.stringify([...watchlist], null, 2));
export const addWatchlist = (symbol) => { watchlist.add(normalizeSymbol(symbol)); saveWatchlist(); };
export const removeWatchlist = (symbol) => { watchlist.delete(normalizeSymbol(symbol)); saveWatchlist(); };
export const getCoin = async (symbol) => binance.getCoin(normalizeSymbol(symbol));
export const getCoinKlines = async (symbol, interval, limit = 200) => binance.getKlines(normalizeSymbol(symbol), interval, limit);
export const getSignalHistory = (symbol) => signalHistory.get(normalizeSymbol(symbol)) || [];
export const getPersistentSignalHistory = () => store.get().signalHistory;
export const getTelegramLogs = () => store.get().telegramLogs;
export const getDebug = () => store.get().debug;
export const getScannerSettings = () => store.get().settings;
export const updateScannerSettings = (settings) => { store.updateSettings(settings); return store.get().settings; };
const missedReason = (ticker) => {
    const alertMode = getAlertMode(ticker);
    if (alertMode !== 'NO_ALERT')
        return `Now qualifies as ${alertMode}; awaiting cooldown/history capture`;
    if (!hasTradableRisk(ticker)) {
        if (ticker.pumpProjection.action === 'AVOID')
            return 'Trade plan says AVOID';
        if (ticker.macd.trend === 'BEARISH')
            return 'MACD still bearish';
        if (ticker.orderBook.imbalancePct < -15)
            return 'Order book seller pressure too high';
        if (ticker.rsi15m > 72 || ticker.isOverheated)
            return 'Already overheated';
        if (ticker.volume24h < 300000)
            return 'Liquidity too low';
        return 'Risk/reward or plan quality not good enough';
    }
    if (ticker.volumeSpikePct < 20)
        return 'Volume warming not started';
    if (ticker.relativeVolume < 1.05)
        return 'Relative volume still too low';
    if (ticker.priceChange24h > 22)
        return 'Move already too extended';
    if (ticker.distanceFromMa10Pct > 7)
        return 'Price too far from MA10; avoid chasing';
    return 'Composite early score not strong enough';
};
export const getMissedOpportunities = () => response.tickers.filter((ticker) => ticker.priceChange24h > 20 && !store.get().signalHistory.some((record) => record.symbol === ticker.symbol)).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, reason: missedReason(ticker) })).sort((a, b) => b.gain24h - a.gain24h);
export const getEarlyPumpAnalysis = () => {
    const snapshots = store.get().snapshots;
    return response.tickers.filter((ticker) => ticker.priceChange24h > 20).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, snapshots: snapshots.filter((record) => record.symbol === ticker.symbol).slice(-24) }));
};
const getLiveEarlyCandidates = () => response.tickers
    .filter((ticker) => getAlertMode(ticker) !== 'NO_ALERT' || ticker.isEarlyPump || ticker.pumpProjection.action === 'ENTER_NOW')
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((ticker) => ({
    symbol: ticker.symbol,
    price: ticker.price,
    score: ticker.score,
    mode: getAlertMode(ticker),
    action: ticker.pumpProjection.action,
    entryLow: ticker.pumpProjection.entryLow,
    entryHigh: ticker.pumpProjection.entryHigh,
    triggerPrice: ticker.pumpProjection.triggerPrice,
    takeProfit1: ticker.pumpProjection.takeProfit1,
    stopLoss: ticker.pumpProjection.stopLoss,
    priceChange15m: ticker.priceChange15m,
    priceChange1h: ticker.priceChange1h,
    volumeSpikePct: ticker.volumeSpikePct,
    relativeVolume: ticker.relativeVolume,
    macdTrend: ticker.macd.trend,
    orderBookPressure: ticker.orderBook.pressure
}));
export const getAnalytics = () => {
    const history = store.get().signalHistory;
    const matured4h = history.filter((item) => typeof item.gain4hPct === 'number');
    const matured1h = history.filter((item) => typeof item.gain1hPct === 'number');
    const winners = [...matured4h].sort((a, b) => (b.gain4hPct || 0) - (a.gain4hPct || 0)).slice(0, 10);
    const average = (items, key) => items.length ? Number((items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length).toFixed(2)) : 0;
    const accuracy = matured4h.length ? Number(((matured4h.filter((item) => Number(item.gain4hPct) > 0).length / matured4h.length) * 100).toFixed(2)) : 0;
    return {
        topAlertWinners: winners, topMissedPumps: getMissedOpportunities().slice(0, 10), averageAlertAccuracy: accuracy,
        averageProfitAfterAlert: average(matured4h, 'gain4hPct'), averageProfit1h: average(matured1h, 'gain1hPct'),
        averageProfit4h: average(matured4h, 'gain4hPct'), averageProfit24h: average(history.filter((item) => typeof item.gain24hPct === 'number'), 'gain24hPct'),
        evaluatedSignals4h: matured4h.length, pendingSignals4h: history.length - matured4h.length,
        bestPerformingIndicators: winners.slice(0, 5).map((item) => ({ symbol: item.symbol, rsi: item.rsi, volSpike: item.volSpike, relVol: item.relVol, gainLossPct: item.gain4hPct || 0 })),
        liveEarlyCandidates: getLiveEarlyCandidates()
    };
};
export const getTwentyPercentRadar = () => buildTwentyPercentRadar(response.tickers);
const evaluatePosition = async (position) => {
    const ticker = await getCoin(position.symbol);
    if (!ticker)
        return { ...position, currentPrice: null, currentValueUsdt: null, pnlUsdt: null, pnlPct: null, decision: 'DATA TIDAK TERSEDIA', reasons: ['Data Binance coin tidak tersedia. Evaluasi sengaja dikosongkan.'], technicalStopLoss: null, support1: null, takeProfit1: null, takeProfit2: null, signal: null, score: null, estimatedUpsideHighPct: null, upsideToTp1FromEntryPct: null, upsideToTp2FromEntryPct: null, riskToStopFromEntryPct: null, outlook: 'DATA TIDAK TERSEDIA' };
    const currentValueUsdt = Number((position.quantity * ticker.price).toFixed(8));
    const pnlUsdt = Number((currentValueUsdt - position.totalCostUsdt).toFixed(8));
    const pnlPct = pct(currentValueUsdt, position.totalCostUsdt);
    const reasons = [];
    const belowPersonalRisk = pnlPct <= -position.maxLossPct;
    const belowTechnicalStop = ticker.price <= ticker.entry.stopLoss;
    let decision = 'PANTAU KETAT';
    const upsideToTp1FromEntryPct = pct(ticker.entry.takeProfit1, position.averageEntryPrice);
    const upsideToTp2FromEntryPct = pct(ticker.entry.takeProfit2, position.averageEntryPrice);
    const riskToStopFromEntryPct = pct(ticker.entry.stopLoss, position.averageEntryPrice);
    let outlook = 'PELUANG NAIK TERBATAS';
    if (belowPersonalRisk || belowTechnicalStop) {
        decision = 'TINJAU BATAS RISIKO';
        if (belowPersonalRisk)
            reasons.push(`P/L ${pnlPct}% melewati batas rugi pribadi -${position.maxLossPct}%`);
        if (belowTechnicalStop)
            reasons.push('Harga berada di bawah level invalidasi teknikal');
    }
    else if (ticker.isOverheated || ticker.rsi15m > 72 || ticker.price < ticker.support1) {
        decision = 'PANTAU KETAT';
        if (ticker.isOverheated)
            reasons.push('Signal berubah menjadi OVERHEATED');
        if (ticker.rsi15m > 72)
            reasons.push(`RSI 15m tinggi di ${ticker.rsi15m}`);
        if (ticker.price < ticker.support1)
            reasons.push('Harga berada di bawah support 1');
    }
    else if (ticker.score >= 55 && ticker.price >= ticker.support1 && ticker.ma10 >= ticker.ma30) {
        decision = 'PERTIMBANGKAN HOLD';
        reasons.push('Harga masih bertahan di atas support 1');
        reasons.push('MA10 masih berada di atas atau setara MA30');
        reasons.push(`Score teknikal ${ticker.score}`);
    }
    else {
        reasons.push('Momentum belum cukup kuat untuk status hold');
    }
    if (ticker.score >= 65 && ticker.ma10 > ticker.ma30 && ticker.price >= ticker.support1 && ticker.rsi15m < 70 && upsideToTp1FromEntryPct > 0) {
        outlook = 'PELUANG NAIK MASIH TERBUKA';
        reasons.push(`Dari entry, ruang ke TP1 sekitar ${upsideToTp1FromEntryPct}% dan ke TP2 sekitar ${upsideToTp2FromEntryPct}%`);
    }
    else if (ticker.price < ticker.support1 || ticker.ma10 < ticker.ma30 || belowTechnicalStop) {
        outlook = 'RISIKO TURUN MENINGKAT';
        reasons.push(`Dari entry, risiko ke stop teknikal sekitar ${riskToStopFromEntryPct}%`);
    }
    else {
        reasons.push('Ruang naik dari entry terbatas atau belum terkonfirmasi');
    }
    return { ...position, currentPrice: ticker.price, currentValueUsdt, pnlUsdt, pnlPct, decision, reasons, technicalStopLoss: ticker.entry.stopLoss, support1: ticker.support1, takeProfit1: ticker.entry.takeProfit1, takeProfit2: ticker.entry.takeProfit2, signal: ticker.signal, score: ticker.score, estimatedUpsideHighPct: ticker.estimatedUpsideHighPct, upsideToTp1FromEntryPct, upsideToTp2FromEntryPct, riskToStopFromEntryPct, outlook };
};
export const getPortfolio = async () => Promise.all(store.get().positions.map(evaluatePosition));
export const upsertPosition = (input) => {
    const symbol = normalizeSymbol(input.symbol);
    const quantity = Number(input.quantity);
    const entryPrice = Number(input.entryPrice);
    const submittedTotal = Number(input.totalCostUsdt);
    const totalCostUsdt = Number.isFinite(submittedTotal) && submittedTotal > 0 ? submittedTotal : quantity * entryPrice;
    const averageEntryPrice = Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : totalCostUsdt / quantity;
    const maxLossPct = Number(input.maxLossPct ?? 5);
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageEntryPrice) || averageEntryPrice <= 0 || !Number.isFinite(totalCostUsdt) || totalCostUsdt <= 0 || !Number.isFinite(maxLossPct) || maxLossPct <= 0 || maxLossPct > 100)
        throw new Error('Jumlah coin, harga entry, total modal, dan batas rugi wajib diisi dengan angka valid.');
    const existing = store.get().positions.find((item) => item.symbol === symbol);
    const now = new Date().toISOString();
    const record = { id: existing?.id || id(), symbol, quantity, totalCostUsdt: Number(totalCostUsdt.toFixed(8)), averageEntryPrice: Number(averageEntryPrice.toFixed(8)), maxLossPct, createdAt: existing?.createdAt || now, updatedAt: now };
    store.upsertPosition(record);
    return record;
};
export const removePosition = (symbol) => store.removePosition(normalizeSymbol(symbol));
export const logTelegramTest = (status, message) => {
    store.addTelegramLog({ id: id(), timestamp: new Date().toISOString(), symbol: 'TEST', score: 0, signal: 'TEST', status, response: message });
    store.updateDebug(status === 'SENT' ? { lastTelegramResponse: message, lastTelegramError: null } : { lastTelegramError: message });
};
