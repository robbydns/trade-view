import fs from 'fs';
const storeFile = new URL('./store.json', import.meta.url);
const defaults = {
    signalHistory: [],
    telegramLogs: [],
    snapshots: [],
    settings: { includeNewListings: true, includeLowMarketCapCoins: true, includeMemeCoins: true },
    debug: { lastScanTime: null, coinsScanned: 0, coinsQualified: 0, alertsSentToday: 0, lastAlertCoin: null, lastAlertTime: null, lastTelegramResponse: null, lastTelegramError: null },
    positions: []
};
const load = () => {
    try {
        return { ...defaults, ...JSON.parse(fs.readFileSync(storeFile, 'utf8')) };
    }
    catch {
        return structuredClone(defaults);
    }
};
let data = load();
const save = () => fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
export const store = {
    get: () => data,
    mutate: (change) => { change(data); save(); },
    addSignal: (record) => store.mutate((draft) => { draft.signalHistory.unshift(record); draft.signalHistory = draft.signalHistory.slice(0, 2000); }),
    addTelegramLog: (record) => store.mutate((draft) => { draft.telegramLogs.unshift(record); draft.telegramLogs = draft.telegramLogs.slice(0, 2000); }),
    addSnapshots: (records) => store.mutate((draft) => {
        draft.snapshots.push(...records);
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        draft.snapshots = draft.snapshots.filter((record) => Date.parse(record.timestamp) >= cutoff);
    }),
    updateSettings: (settings) => store.mutate((draft) => { draft.settings = { ...draft.settings, ...settings }; }),
    updateDebug: (debug) => store.mutate((draft) => { draft.debug = { ...draft.debug, ...debug }; }),
    upsertPosition: (record) => store.mutate((draft) => {
        const index = draft.positions.findIndex((item) => item.symbol === record.symbol);
        if (index >= 0)
            draft.positions[index] = record;
        else
            draft.positions.unshift(record);
    }),
    removePosition: (symbol) => store.mutate((draft) => { draft.positions = draft.positions.filter((item) => item.symbol !== symbol); })
};
