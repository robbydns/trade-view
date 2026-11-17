# Crypto Signal Compass

Binance USDT real-time scanner untuk mencari coin yang baru mulai bergerak. Aplikasi tidak menggunakan data dummy, mock, atau harga palsu.

## Data Source

- WebSocket ticker: `wss://stream.binance.com:9443/ws/!ticker@arr`
- REST 24h ticker: `/api/v3/ticker/24hr`
- REST klines: `/api/v3/klines`
- Semua request Binance berjalan dari backend proxy.
- Nominal rupiah adalah konversi referensi `USDT -> IDR` dari CoinGecko public API. Jika kurs gagal diambil, UI menampilkan `Rp N/A`.

Jika Binance API gagal, backend mengembalikan status `ERROR` dan tabel frontend tetap kosong.

## Menjalankan

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000`

## Technical analysis timeframes

Coin Detail now loads Binance closed candles for 1m, 15m, 1h, and 1d and uses a shared indicator engine for RSI (Wilder), EMA 9/21/50, SMA 20/50, MACD 12/26/9, quote-volume ratio, ATR, support/resistance, entry, stop, TP1/TP2, and risk/reward. The display also converts USDT estimates to IDR using the existing CoinGecko USDT/IDR reference rate. A timeframe with incomplete/unavailable data is clearly marked; incomplete timeframe coverage cannot produce a strong consensus. 1m is used for entry timing, while a strong consensus requires aligned closed-candle evidence from 15m, 1h, and 1d. The overall Binance scanner score is still separately based on the existing 15m signal with higher-timeframe trend confirmation; the detail-page consensus is an additional analysis, not a rewrite of the scanner's CEX score. Signals are analytical filters and never guarantee outcomes.

## Telegram alert policy

Automatic Telegram trading notifications are restricted to `STRONG BUY` only and must additionally pass the existing market-liquidity/risk checks, not be overheated, have a HIGH-confidence projection, avoid an `AVOID` action, and have projected TP1 reward/risk of at least 1.5:1. Early ignition, breakout-watch, pullback-reentry, and on-chain-only events remain visible in dashboard/history but do not trigger Telegram messages. The manual Telegram test button still sends its explicit test message. A strong signal is not a guarantee that price will rise; use the posted entry/stop/targets as analysis, not certainty.

## Optional on-chain DEX whale monitor

The Wallet Inflow view uses Bitquery's documented GraphQL v2 `Trading.Trades` stream, not sample/demo wallet records. The adapter normalizes chain, token ID/address, swap side, trader address, transaction hash, quote/USD amount, pool, and timestamp. Normal token transfers are not treated as buys or sells. DEX/AMM protocol-family rows are required; unknown directions and missing USD prices are not included in directional totals.

### Enable safely

1. Use Node.js 22 or newer (the Bitquery adapter uses the built-in WebSocket client).
2. Obtain a Bitquery API access token and verify that the account plan permits the `Trading.Trades` GraphQL subscription and the chosen chains. In the account's V2 IDE/schema, verify the exact DEX-only `Pair.Market.ProtocolFamily` enum value; the public docs identify the field as the way to filter DEX swaps but do not publish one universal enum value. Streams are usage/plan dependent; this repository cannot verify an individual account's trial, quota, or billing.
3. Copy the on-chain placeholders from `.env.example` into the backend's local `.env`, set `BITQUERY_API_KEY` and the verified `ONCHAIN_DEX_PROTOCOL_FAMILY`, and only then set `ONCHAIN_ENABLED=true`. Never place the key in `VITE_*` variables, frontend code, or a request to the browser.
4. Start the server and open the authenticated Wallet Inflow page. Its status endpoint reports disabled, connecting, connected, or provider error. A connected socket is not proof that the account has useful quota; confirm that fresh events are arriving.

Initial configuration monitors Solana, BNB Smart Chain, Ethereum, and Base through one shared subscription. `ONCHAIN_CHAINS` accepts the supported Bitquery Trading API network names/aliases; the service deliberately caps configured chains at six and active subscriptions at one. Use the smallest chain set you need. `ONCHAIN_MIN_TRADE_USD` is the minimum fixed large-trade threshold; the detector also adapts the threshold to three times the median observed prior trade size. Rolling windows are 1m, 5m, and 15m; historical comparison requires at least five prior trades and enough retained data. The score is a weighted evidence score, not a probability.

`ONCHAIN_WINDOW_SECONDS`, `ONCHAIN_ALERT_THRESHOLD`, `ONCHAIN_STALE_AFTER_SECONDS`, `ONCHAIN_MAX_EVENTS`, `ONCHAIN_MAX_RECENT_TRADES`, and `ONCHAIN_ALERT_COOLDOWN_MS` bound the detector, memory retention, and alerts. The bounded event cache is persisted in ignored `server/onchain/events.json` and pruned to the configured rolling window. Telegram notifications reuse the existing Telegram configuration and remain subject to `TELEGRAM_ALERT_ENABLED`.

### Limitations and troubleshooting

- Bitquery documents `Trading.Trades` as real-time, multi-chain swap-level data with `Side`, `Trader.Address`, `TransactionHeader.Hash`, `Amounts`, `AmountsInUsd`, `Block`, and `Pair` fields. The implementation uses `AmountsInUsd.Quote` for USD sizing and `Pair.Token.Id` as part of chain-aware identity. `ProtocolFamily` is required as a stream filter; confirm the exact DEX-only value in the authenticated account schema before enabling. See [Bitquery Crypto Trades API](https://docs.bitquery.io/docs/trading/crypto-trades-api/trades-api/), [WebSocket subscriptions](https://docs.bitquery.io/docs/subscriptions/websockets/), and [WebSocket authorization](https://docs.bitquery.io/docs/authorization/websocket/).
- Streaming quota and trial access vary by account; do not assume the stream is free. No live provider connection is claimed until configured and observed. API key access, chain availability, and billing must be verified in the Bitquery account.
- Duplicate legs are deduplicated by chain, transaction hash, observed trader, side, token ID, and base amount. Multiple routes in one transaction can still make observed activity an estimate; addresses are not assumed independent or identified as people.
- The current market scanner is Binance CEX data. On-chain tokens are not joined to Binance symbols because symbol-only matching can map the wrong contract. Cross-feed confirmation and confirmed-breakout labels require a verified chain/contract-to-market mapping and completed Binance candles; on-chain accumulation alone never confirms a breakout. The current on-chain alerts cover `ONCHAIN_WHALE_ALERT`, `ONCHAIN_ACCUMULATION_ALERT`, and `ONCHAIN_DISTRIBUTION_ALERT`; `EARLY_WHALE_BREAKOUT` and `BREAKOUT_CONFIRMED` are deliberately not generated until that verified mapping and price-confirmation integration exists.
- If no events arrive, check the API token, enabled chains, account quota/plan, Bitquery status, and provider error shown on the Wallet Inflow page. The Binance scanner continues when the on-chain provider is disabled or unavailable.
