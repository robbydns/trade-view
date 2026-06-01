import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addWatchlist, fetchCoin } from '../services/api'
import { Candle, MarketTicker } from '../types'
import SignalBadge from '../components/SignalBadge'

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

const CandlestickChart = ({ candles }: { candles: Candle[] }) => {
  const visible = candles.slice(-80)
  const width = 1200
  const height = 360
  const padding = 22
  const min = Math.min(...visible.map((candle) => candle.low))
  const max = Math.max(...visible.map((candle) => candle.high))
  const range = Math.max(max - min, 0.00000001)
  const slot = (width - padding * 2) / Math.max(visible.length, 1)
  const bodyWidth = Math.max(2.5, Math.min(slot * 0.62, 10))
  const y = (price: number) => padding + ((max - price) / range) * (height - padding * 2)

  if (!visible.length) return <div className="grid h-64 place-items-center text-sm text-slate-500">Candle Binance belum tersedia.</div>

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full sm:h-[360px]" preserveAspectRatio="none" role="img" aria-label="Chart candle 15 menit Binance">
      {[0.25, 0.5, 0.75].map((part) => <line key={part} x1="0" x2={width} y1={height * part} y2={height * part} stroke="rgba(148,163,184,0.10)" />)}
      {visible.map((candle, index) => {
        const x = padding + index * slot + slot / 2
        const openY = y(candle.open)
        const closeY = y(candle.close)
        const color = candle.close >= candle.open ? '#34d399' : '#fb7185'
        return (
          <g key={`${candle.openTime}-${index}`}>
            <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.5" />
            <rect x={x - bodyWidth / 2} y={Math.min(openY, closeY)} width={bodyWidth} height={Math.max(Math.abs(openY - closeY), 2)} fill={color} />
          </g>
        )
      })}
    </svg>
  )
}

const CoinDetail = () => {
  const { symbol = '' } = useParams()
  const [ticker, setTicker] = useState<MarketTicker | null>(null)
  const [idrRate, setIdrRate] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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

  const lastUpdated = useMemo(() => ticker ? new Date(ticker.updatedAt).toLocaleTimeString('id-ID') : '', [ticker])

  const saveWatchlist = async () => {
    if (!ticker) return
    try {
      await addWatchlist(ticker.symbol)
      setMessage(`${ticker.symbol} ditambahkan ke watchlist.`)
    } catch (err) {
      setMessage((err as Error).message)
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

    <section className="overflow-hidden rounded-md border border-white/10 bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-400">
        <span>Candle 15m ({Math.min(ticker.candles.length, 80)} terakhir)</span>
        <span>Binance real-time &middot; update {lastUpdated}</span>
      </div>
      <CandlestickChart candles={ticker.candles} />
    </section>

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
