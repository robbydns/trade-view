import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addWatchlist, fetchCoin, savePosition } from '../services/api'
import { MarketTicker } from '../types'
import SignalBadge from '../components/SignalBadge'
import TradingAnalysisChart from '../components/TradingAnalysisChart'

const value = (number: number) => number < 1 ? number.toFixed(8) : number.toLocaleString('id-ID', { maximumFractionDigits: 4 })
const rupiah = (number: number, idrRate: number | null) => idrRate ? `Rp${(number * idrRate).toLocaleString('id-ID', { maximumFractionDigits: 2 })}` : 'Rp N/A'
const signedPercent = (number: number) => `${number > 0 ? '+' : ''}${number.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
const tone = (number: number) => number > 0 ? 'text-emerald-300' : number < 0 ? 'text-rose-300' : 'text-slate-200'

const Metric = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className="min-w-0 rounded-md border border-white/10 bg-slate-900/70 px-3 py-2.5">
    <div className="text-[0.65rem] uppercase text-slate-500">{label}</div>
    <div className={`mt-1 truncate text-sm font-semibold sm:text-base ${className}`}>{children}</div>
  </div>
)

const PriceRow = ({ label, price, idrRate, className = '' }: { label: string; price: number; idrRate: number | null; className?: string }) => (
  <div className="flex items-start justify-between gap-3 border-b border-white/5 py-2 last:border-0">
    <span className="text-slate-400">{label}</span>
    <div className={`text-right font-mono font-semibold ${className}`}>
      <div>{value(price)}</div>
      <div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(price, idrRate)}</div>
    </div>
  </div>
)

const ZoneRow = ({ label, low, high, idrRate }: { label: string; low: number; high: number; idrRate: number | null }) => (
  <div className="flex items-start justify-between gap-3 border-b border-white/5 py-2">
    <span className="text-slate-400">{label}</span>
    <div className="text-right font-mono font-semibold text-white">
      <div>{value(low)} - {value(high)}</div>
      <div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(low, idrRate)} - {rupiah(high, idrRate)}</div>
    </div>
  </div>
)

const CoinDetail = () => {
  const { symbol = '' } = useParams()
  const [ticker, setTicker] = useState<MarketTicker | null>(null)
  const [idrRate, setIdrRate] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [quantity, setQuantity] = useState('')
  const [totalCostUsdt, setTotalCostUsdt] = useState('')
  const [maxLossPct, setMaxLossPct] = useState('5')

  useEffect(() => {
    let active = true
    const load = () => fetchCoin(symbol)
      .then((result) => {
        if (!active) return
        setTicker(result.ticker)
        setIdrRate(result.idrRate)
        setError('')
      })
      .catch((err) => {
        if (active) setError((err as Error).message)
      })
    load()
    const timer = window.setInterval(load, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [symbol])

  const saveWatchlist = async () => {
    if (!ticker) return
    try {
      await addWatchlist(ticker.symbol)
      setMessage(`${ticker.symbol} ditambahkan ke watchlist.`)
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const saveTradePosition = async () => {
    if (!ticker) return
    try {
      await savePosition({ symbol: ticker.symbol, quantity: Number(quantity), totalCostUsdt: Number(totalCostUsdt), maxLossPct: Number(maxLossPct) })
      setMessage(`Posisi ${ticker.symbol} tersimpan. Pantau evaluasinya melalui menu Portfolio.`)
    } catch (err) {
      setMessage(`ERROR: ${(err as Error).message}`)
    }
  }

  if (error && !ticker) return <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-5 text-rose-200">ERROR: {error}</div>
  if (!ticker) return <div className="p-5 text-slate-400">Memuat candle Binance...</div>

  return <div className="space-y-4">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/" className="text-sm text-cyan-300 hover:text-cyan-200">&larr; Scanner</Link>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{ticker.symbol}</h1>
        <SignalBadge signal={ticker.signal} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveWatchlist} className="rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700">+ Add to watchlist</button>
        <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${error ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'}`}>{error ? 'DISCONNECTED' : 'CONNECTED'}</span>
      </div>
    </section>

    {message && <div className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">{message}</div>}
    {error && <div className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Pembaruan terakhir gagal: {error}</div>}

    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Metric label="Harga"><div>{value(ticker.price)} <span className="text-[0.65rem] text-slate-500">USDT</span></div><div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(ticker.price, idrRate)}</div></Metric>
      <Metric label="15m" className={tone(ticker.priceChange15m)}>{signedPercent(ticker.priceChange15m)}</Metric>
      <Metric label="1h" className={tone(ticker.priceChange1h)}>{signedPercent(ticker.priceChange1h)}</Metric>
      <Metric label="24h" className={tone(ticker.priceChange24h)}>{signedPercent(ticker.priceChange24h)}</Metric>
      <Metric label="Vol Spike" className={tone(ticker.volumeSpikePct)}>{signedPercent(ticker.volumeSpikePct)}</Metric>
      <Metric label="RSI 15m">{ticker.rsi15m.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</Metric>
      <Metric label="MA10">{value(ticker.ma10)}</Metric>
      <Metric label="MA30">{value(ticker.ma30)}</Metric>
      <Metric label="Rel Vol">{ticker.relativeVolume.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x</Metric>
      <Metric label="Score" className={ticker.score >= 65 ? 'text-emerald-300' : ticker.score >= 50 ? 'text-amber-300' : 'text-slate-200'}>{ticker.score}</Metric>
    </section>

    <TradingAnalysisChart symbol={ticker.symbol} />

    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <h2 className="mb-2 font-semibold text-white">Support &amp; Resistance</h2>
        <PriceRow label="Resistance 2" price={ticker.resistance2} idrRate={idrRate} className="text-rose-300" />
        <PriceRow label="Resistance 1" price={ticker.resistance1} idrRate={idrRate} className="text-rose-300" />
        <PriceRow label="Price" price={ticker.price} idrRate={idrRate} className="text-white" />
        <PriceRow label="Support 1" price={ticker.support1} idrRate={idrRate} className="text-emerald-300" />
        <PriceRow label="Support 2" price={ticker.support2} idrRate={idrRate} className="text-emerald-300" />
      </div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">Rekomendasi Entry</h2>
          <span className="text-xs text-emerald-300">Upside teknikal +{ticker.estimatedUpsideLowPct}% - +{ticker.estimatedUpsideHighPct}%</span>
        </div>
        <div className="mt-2">
          <ZoneRow label="Early Entry Zone" low={ticker.entry.earlyEntryLow} high={ticker.entry.earlyEntryHigh} idrRate={idrRate} />
          <ZoneRow label="Pullback Entry Zone" low={ticker.entry.pullbackEntryLow} high={ticker.entry.pullbackEntryHigh} idrRate={idrRate} />
          <ZoneRow label="Breakout Entry" low={ticker.entry.breakoutEntryLow} high={ticker.entry.breakoutEntryHigh} idrRate={idrRate} />
          <PriceRow label="Take Profit 1" price={ticker.entry.takeProfit1} idrRate={idrRate} className="text-emerald-300" />
          <PriceRow label="Take Profit 2" price={ticker.entry.takeProfit2} idrRate={idrRate} className="text-emerald-300" />
          <PriceRow label="Stop Loss" price={ticker.entry.stopLoss} idrRate={idrRate} className="text-rose-300" />
        </div>
      </div>
    </section>

    <section className="rounded-md border border-cyan-400/20 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">Catat Posisi Trading</h2>
          <p className="mt-1 text-xs text-slate-400">Simpan jumlah coin dan total modal agar Portfolio dapat menghitung P/L serta menampilkan pertimbangan risiko.</p>
        </div>
        <Link to="/portfolio" className="rounded-md border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200">Buka Portfolio</Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-slate-400">Jumlah coin<input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Contoh: 1000" className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Total modal USDT<input type="number" min="0" step="any" value={totalCostUsdt} onChange={(event) => setTotalCostUsdt(event.target.value)} placeholder="Contoh: 50" className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Batas rugi pribadi %<input type="number" min="0.1" max="100" step="0.1" value={maxLossPct} onChange={(event) => setMaxLossPct(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <div className="flex items-end"><button type="button" onClick={saveTradePosition} className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Simpan Posisi</button></div>
      </div>
      <div className="mt-2 text-xs text-slate-500">Average entry preview: {Number(quantity) > 0 && Number(totalCostUsdt) > 0 ? `${value(Number(totalCostUsdt) / Number(quantity))} USDT` : '-'}</div>
    </section>

    <section className="rounded-md border border-white/10 bg-slate-900/60 p-3">
      <h2 className="font-semibold text-white">Alasan Sinyal</h2>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
        {ticker.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
    </section>

    <p className="text-xs text-slate-500">Sinyal adalah alat bantu analisis, bukan nasihat finansial. Tetap gunakan manajemen risiko.</p>
  </div>
}

export default CoinDetail
