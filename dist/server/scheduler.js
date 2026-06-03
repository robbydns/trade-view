import fs from 'fs';
import { BinanceRealtimeService } from './binance.js';
import { sendTelegramAlert } from './alert.js';
import { getIdrRate } from './rates.js';
import { store } from './store.js';
import { buildTwentyPercentRadar } from './social.js';
const binance = new BinanceRealtimeService();
const cooldownBySymbol = new Map();
const watchlistFile = new URL('./watchlist.json', import.meta.url);
let lastSnapshotAt = 0;
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
const isQualified = (ticker) => ticker.score >= 88 &&
    ['STRONG BUY', 'BREAKOUT'].includes(ticker.signal) &&
    ticker.priceChange15m >= 0.5 &&
    ticker.priceChange15m <= 6 &&
    ticker.priceChange1h >= 0.5 &&
    ticker.priceChange1h <= 12 &&
    ticker.priceChange24h >= -2 &&
    ticker.priceChange24h <= 20 &&
    ticker.volumeSpikePct >= 150 &&
    ticker.volumeSpikePct <= 1500 &&
    ticker.relativeVolume >= 2 &&
    ticker.relativeVolume <= 12 &&
    ticker.rsi15m >= 52 &&
    ticker.rsi15m <= 68 &&
    ticker.ma10 > ticker.ma30 &&
    ticker.distanceFromMa10Pct >= -1 &&
    ticker.distanceFromMa10Pct <= 6 &&
    ticker.volume24h >= 500000 &&
    !ticker.isOverheated;
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
        if (!isQualified(ticker))
            continue;
        const existing = store.get().signalHistory.find((record) => record.symbol === ticker.symbol && Date.now() - Date.parse(record.timestamp) < 30 * 60 * 1000);
        if (existing)
            continue;
        const record = { id: id(), symbol: ticker.symbol, priceAtAlert: ticker.price, currentPrice: ticker.price, gainLossPct: 0, score: ticker.score, rsi: ticker.rsi15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, openInterest: ticker.openInterest, signal: ticker.signal, timestamp: new Date().toISOString(), telegramSent: false, status: 'ACTIVE', gain1hPct: null, gain4hPct: null, gain24hPct: null, maxGain4hPct: null, maxDrawdown4hPct: null };
        store.addSignal(record);
        await sendLoggedTelegram(ticker, record.id);
    }
};
const sendLoggedTelegram = async (ticker, historyId) => {
    const now = Date.now();
    const lastPersistedSent = store.get().telegramLogs.find((record) => record.symbol === ticker.symbol && record.status === 'SENT');
    const lastSentAt = Math.max(cooldownBySymbol.get(ticker.symbol) || 0, lastPersistedSent ? Date.parse(lastPersistedSent.timestamp) : 0);
    if (lastSentAt + 30 * 60 * 1000 > now) {
        addTelegramLog(ticker, 'SKIPPED', 'Cooldown 30 menit masih aktif.');
        return;
    }
    try {
        const telegramResponse = await sendTelegramAlert(formatTelegramAlert(ticker), true);
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
const formatTelegramAlert = (ticker) => `Crypto Signal Alert

Coin: ${ticker.symbol}
Signal: ${ticker.signal}
Score: ${ticker.score}
Harga: ${ticker.price}
15m Change: ${ticker.priceChange15m >= 0 ? '+' : ''}${ticker.priceChange15m}%
Volume Spike: ${ticker.volumeSpikePct >= 0 ? '+' : ''}${ticker.volumeSpikePct}%
RSI: ${ticker.rsi15m}
Open Interest: ${ticker.openInterest ?? 'N/A'}
Entry: ${ticker.entry.earlyEntryLow}-${ticker.entry.earlyEntryHigh}
TP: ${ticker.entry.takeProfit1} / ${ticker.entry.takeProfit2}
CL: ${ticker.entry.stopLoss}
Estimasi upside teknikal: +${ticker.estimatedUpsideLowPct}% sampai +${ticker.estimatedUpsideHighPct}%

Disclaimer: Bukan nasihat finansial.`;
export const initializeScheduler = async () => { binance.start(); await refresh(); setInterval(refresh, 20000); };
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
export const getMissedOpportunities = () => response.tickers.filter((ticker) => ticker.priceChange24h > 20 && !store.get().signalHistory.some((record) => record.symbol === ticker.symbol)).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, reason: ticker.volumeSpikePct < 150 ? 'VolSpike filter too strict' : ticker.relativeVolume <= 2 ? 'Relative volume filter not reached' : ticker.openInterest === null ? 'Open Interest data missing' : 'Coin did not meet score >= 80 before pump' })).sort((a, b) => b.gain24h - a.gain24h);
export const getEarlyPumpAnalysis = () => {
    const snapshots = store.get().snapshots;
    return response.tickers.filter((ticker) => ticker.priceChange24h > 20).map((ticker) => ({ symbol: ticker.symbol, gain24h: ticker.priceChange24h, snapshots: snapshots.filter((record) => record.symbol === ticker.symbol).slice(-24) }));
};
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
        bestPerformingIndicators: winners.slice(0, 5).map((item) => ({ symbol: item.symbol, rsi: item.rsi, volSpike: item.volSpike, relVol: item.relVol, gainLossPct: item.gain4hPct || 0 }))
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
