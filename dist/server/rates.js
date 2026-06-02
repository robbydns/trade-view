import axios from 'axios';
const RATE_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const CACHE_MS = 60 * 1000;
const TIMEOUT_MS = 10000;
let cache = { rate: null, updatedAt: null, expiresAt: 0 };
export const getIdrRate = async () => {
    if (cache.expiresAt > Date.now())
        return cache;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await axios.get(`${RATE_URL}/simple/price`, {
                params: { ids: 'tether', vs_currencies: 'idr' },
                timeout: TIMEOUT_MS
            });
            const rate = Number(response.data?.tether?.idr);
            if (!Number.isFinite(rate) || rate <= 0)
                throw new Error('Kurs USDT/IDR tidak tersedia');
            cache = { rate, updatedAt: new Date().toISOString(), expiresAt: Date.now() + CACHE_MS };
            return cache;
        }
        catch (error) {
            lastError = error;
        }
    }
    cache = { rate: null, updatedAt: null, expiresAt: Date.now() + CACHE_MS };
    console.error('[CoinGecko] Kurs USDT/IDR gagal:', lastError?.message || 'unknown error');
    return cache;
};
