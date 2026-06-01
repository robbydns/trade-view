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
