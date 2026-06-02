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
const isQualified = (ticker) => ticker.score >= 80 && ['BUY WATCH', 'STRONG BUY', 'BREAKOUT'].includes(ticker.signal);
const recordStatus = (ticker) => !ticker ? 'EXPIRED' : ticker.isOverheated ? 'OVERHEATED' : 'ACTIVE';
const updatePersistedStatuses = (tickers) => {
    const currentBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
    store.mutate((draft) => {
        for (const record of draft.signalHistory) {
            const current = currentBySymbol.get(record.symbol);
            record.currentPrice = current?.price || record.currentPrice;
            record.gainLossPct = pct(record.currentPrice, record.priceAtAlert);
            record.status = recordStatus(current);
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
        const record = { id: id(), symbol: ticker.symbol, priceAtAlert: ticker.price, currentPrice: ticker.price, gainLossPct: 0, score: ticker.score, rsi: ticker.rsi15m, volSpike: ticker.volumeSpikePct, relVol: ticker.relativeVolume, openInterest: ticker.openInterest, signal: ticker.signal, timestamp: new Date().toISOString(), telegramSent: false, status: 'ACTIVE' };
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
    const winners = [...history].sort((a, b) => b.gainLossPct - a.gainLossPct).slice(0, 10);
    const averageProfit = history.length ? Number((history.reduce((sum, item) => sum + item.gainLossPct, 0) / history.length).toFixed(2)) : 0;
    const accuracy = history.length ? Number(((history.filter((item) => item.gainLossPct > 0).length / history.length) * 100).toFixed(2)) : 0;
    return { topAlertWinners: winners, topMissedPumps: getMissedOpportunities().slice(0, 10), averageAlertAccuracy: accuracy, averageProfitAfterAlert: averageProfit, bestPerformingIndicators: winners.slice(0, 5).map((item) => ({ symbol: item.symbol, rsi: item.rsi, volSpike: item.volSpike, relVol: item.relVol, gainLossPct: item.gainLossPct })) };
};
export const getTwentyPercentRadar = () => buildTwentyPercentRadar(response.tickers);
const evaluatePosition = async (position) => {
    const ticker = await getCoin(position.symbol);
    if (!ticker)
        return { ...position, currentPrice: null, currentValueUsdt: null, pnlUsdt: null, pnlPct: null, decision: 'DATA TIDAK TERSEDIA', reasons: ['Data Binance coin tidak tersedia. Evaluasi sengaja dikosongkan.'], technicalStopLoss: null, support1: null, takeProfit1: null, takeProfit2: null, signal: null, score: null, estimatedUpsideHighPct: null };
    const currentValueUsdt = Number((position.quantity * ticker.price).toFixed(8));
    const pnlUsdt = Number((currentValueUsdt - position.totalCostUsdt).toFixed(8));
    const pnlPct = pct(currentValueUsdt, position.totalCostUsdt);
    const reasons = [];
    const belowPersonalRisk = pnlPct <= -position.maxLossPct;
    const belowTechnicalStop = ticker.price <= ticker.entry.stopLoss;
    let decision = 'PANTAU KETAT';
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
    return { ...position, currentPrice: ticker.price, currentValueUsdt, pnlUsdt, pnlPct, decision, reasons, technicalStopLoss: ticker.entry.stopLoss, support1: ticker.support1, takeProfit1: ticker.entry.takeProfit1, takeProfit2: ticker.entry.takeProfit2, signal: ticker.signal, score: ticker.score, estimatedUpsideHighPct: ticker.estimatedUpsideHighPct };
};
export const getPortfolio = async () => Promise.all(store.get().positions.map(evaluatePosition));
export const upsertPosition = (input) => {
    const symbol = normalizeSymbol(input.symbol);
    const quantity = Number(input.quantity);
    const totalCostUsdt = Number(input.totalCostUsdt);
    const maxLossPct = Number(input.maxLossPct ?? 5);
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCostUsdt) || totalCostUsdt <= 0 || !Number.isFinite(maxLossPct) || maxLossPct <= 0 || maxLossPct > 100)
        throw new Error('Jumlah coin, total modal, dan batas rugi wajib diisi dengan angka valid.');
    const existing = store.get().positions.find((item) => item.symbol === symbol);
    const now = new Date().toISOString();
    const record = { id: existing?.id || id(), symbol, quantity, totalCostUsdt, averageEntryPrice: Number((totalCostUsdt / quantity).toFixed(8)), maxLossPct, createdAt: existing?.createdAt || now, updatedAt: now };
    store.upsertPosition(record);
    return record;
};
export const removePosition = (symbol) => store.removePosition(normalizeSymbol(symbol));
export const logTelegramTest = (status, message) => {
    store.addTelegramLog({ id: id(), timestamp: new Date().toISOString(), symbol: 'TEST', score: 0, signal: 'TEST', status, response: message });
    store.updateDebug(status === 'SENT' ? { lastTelegramResponse: message, lastTelegramError: null } : { lastTelegramError: message });
};
