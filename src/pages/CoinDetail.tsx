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

const PriceMetric = ({ label, amount, idrRate, className = '' }: { label: string; amount: number | null; idrRate: number | null; className?: string }) => (
  <Metric label={label} className={className}>
    {amount === null ? <span>—</span> : <><div>{value(amount)} USDT</div><div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(amount, idrRate)}</div></>}
  </Metric>
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

const PumpProjectionPanel = ({ ticker, idrRate }: { ticker: MarketTicker; idrRate: number | null }) => {
  const projection = ticker.pumpProjection
  const candles = ticker.candles.slice(-80)
  const lows = candles.map((candle) => candle.low)
  const highs = candles.map((candle) => candle.high)
  const min = Math.min(...lows, ticker.support2, projection.basePrice * 0.92)
  const max = Math.max(...highs, projection.stretchTarget)
  const range = Math.max(max - min, Number.EPSILON)
  const y = (price: number) => 86 - ((price - min) / range) * 70
  const x = (index: number) => 6 + (index / Math.max(candles.length - 1, 1)) * 68
  const confidenceTone = projection.confidence === 'HIGH' ? 'border-emerald-400/40 text-emerald-300' : projection.confidence === 'MEDIUM' ? 'border-amber-400/40 text-amber-300' : 'border-slate-400/30 text-slate-300'
  const actionTone = projection.action === 'ENTER_NOW' ? 'text-emerald-300' : projection.action === 'AVOID' ? 'text-rose-300' : 'text-amber-300'
  const actionLabel = projection.action === 'ENTER_NOW' ? 'ENTRY VALID' : projection.action === 'WAIT_PULLBACK' ? 'WAIT PULLBACK' : projection.action === 'WAIT_BREAKOUT' ? 'WAIT BREAKOUT' : 'AVOID ENTRY'

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-black">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-300">Pump Projection</div>
          <h2 className="mt-1 text-lg font-semibold text-white">{ticker.symbol} &middot; {projection.label}</h2>
          <div className={`mt-1 text-sm font-semibold ${actionTone}`}>{actionLabel}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceTone}`}>{projection.confidence} CONFIDENCE</span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-h-[320px]">
          <svg className="h-[320px] w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Projection chart">
            <defs>
              <linearGradient id="projectionArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(34,211,238,0.16)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </linearGradient>
            </defs>
            {[20, 40, 60, 80].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="rgba(148,163,184,0.12)" strokeWidth="0.25" />)}
            {[20, 42, 64, 86].map((line) => <line key={line} x1={line} x2={line} y1="0" y2="100" stroke="rgba(148,163,184,0.08)" strokeWidth="0.25" />)}
            {candles.map((candle, index) => {
              const candleX = x(index)
              const up = candle.close >= candle.open
              const bodyTop = y(Math.max(candle.open, candle.close))
              const bodyHeight = Math.max(0.8, Math.abs(y(candle.open) - y(candle.close)))
              return <g key={candle.openTime}>
                <line x1={candleX} x2={candleX} y1={y(candle.high)} y2={y(candle.low)} stroke={up ? '#3b82f6' : '#ef4444'} strokeWidth="0.35" />
                <rect x={candleX - 0.35} y={bodyTop} width="0.7" height={bodyHeight} fill={up ? '#3b82f6' : '#ef4444'} />
              </g>
            })}
            <rect x="5" y={y(projection.basePrice) - 1.2} width="70" height="2.4" fill="rgba(148,163,184,0.30)" />
            <line x1="0" x2="100" y1={y(projection.basePrice)} y2={y(projection.basePrice)} stroke="#facc15" strokeWidth="0.45" />
            <line x1="75" x2="75" y1={y(projection.stretchTarget)} y2={y(projection.basePrice)} stroke="#f8fafc" strokeWidth="0.45" />
            <path d={`M 75 ${y(projection.stretchTarget)} L 73.8 ${y(projection.stretchTarget) + 2.2} M 75 ${y(projection.stretchTarget)} L 76.2 ${y(projection.stretchTarget) + 2.2}`} stroke="#f8fafc" strokeWidth="0.45" fill="none" />
            <line x1="72" x2="78" y1={y(projection.stretchTarget)} y2={y(projection.stretchTarget)} stroke="#f8fafc" strokeWidth="0.45" />
            <path d={`M 75 ${y(projection.stretchTarget)} L 75 ${y(projection.basePrice)} L 90 ${y(projection.basePrice)} L 90 ${y(projection.stretchTarget)} Z`} fill="url(#projectionArea)" />
          </svg>
          <div className="absolute right-4 top-8 text-right">
            <div className={`text-3xl font-semibold ${actionTone}`}>{actionLabel}</div>
            <div className="mt-1 text-xs text-slate-400">{projection.upsideToStretchPct.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% skenario stretch jika valid</div>
          </div>
          <div className="absolute bottom-8 right-4 rounded bg-blue-600 px-3 py-2 text-right font-mono text-sm text-white">
            <div>{value(projection.basePrice)} USDT</div>
            <div className="text-[0.65rem] opacity-80">{rupiah(projection.basePrice, idrRate)}</div>
            <div className="text-xs opacity-80">current</div>
          </div>
          <div className="absolute right-4 top-24 rounded border border-white/10 bg-slate-950/90 px-3 py-2 text-right font-mono text-sm text-white">
            <div>{value(projection.stretchTarget)} USDT</div>
            <div className="text-[0.65rem] text-slate-400">{rupiah(projection.stretchTarget, idrRate)}</div>
            <div className="text-xs text-slate-400">target</div>
          </div>
        </div>

        <aside className="border-t border-white/10 bg-slate-950 p-4 text-sm lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Action" className={actionTone}>{actionLabel}</Metric>
            <PriceMetric label="Trigger" amount={projection.triggerPrice} idrRate={idrRate} />
            <PriceMetric label="Entry Low" amount={projection.entryLow} idrRate={idrRate} />
            <PriceMetric label="Entry High" amount={projection.entryHigh} idrRate={idrRate} />
            <PriceMetric label="Stop Loss" amount={projection.stopLoss} idrRate={idrRate} className="text-rose-300" />
            <Metric label="R:R TP1">{projection.riskRewardToTp1 ? `${projection.riskRewardToTp1}:1` : '-'}</Metric>
            <PriceMetric label="TP1" amount={projection.takeProfit1} idrRate={idrRate} className="text-emerald-300" />
            <PriceMetric label="TP2" amount={projection.takeProfit2} idrRate={idrRate} className="text-emerald-300" />
            <PriceMetric label="TP3 Stretch" amount={projection.takeProfit3} idrRate={idrRate} className="text-cyan-300" />
            <Metric label="Stretch Upside" className="text-cyan-300">+{projection.upsideToStretchPct.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</Metric>
          </div>
          <div className="mt-3 rounded-md border border-cyan-400/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">{projection.entryNote}</div>
          <div className="mt-2 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">{projection.takeProfitNote}</div>
          <div className="mt-3 text-xs text-slate-500">TP3 nilai IDR: {projection.takeProfit3 ? rupiah(projection.takeProfit3, idrRate) : '-'}</div>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-400">
            {projection.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </aside>
      </div>
    </section>
  )
}

const CoinDetail = () => {
  const { symbol = '' } = useParams()
  const [ticker, setTicker] = useState<MarketTicker | null>(null)
  const [idrRate, setIdrRate] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [quantity, setQuantity] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
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
      await savePosition({ symbol: ticker.symbol, quantity: Number(quantity), entryPrice: Number(entryPrice), totalCostUsdt: totalCostUsdt ? Number(totalCostUsdt) : undefined, maxLossPct: Number(maxLossPct) })
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
      <Metric label="MA10"><div>{value(ticker.ma10)} USDT</div><div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(ticker.ma10, idrRate)}</div></Metric>
      <Metric label="MA30"><div>{value(ticker.ma30)} USDT</div><div className="mt-0.5 text-[0.65rem] font-normal text-slate-500">{rupiah(ticker.ma30, idrRate)}</div></Metric>
      <Metric label="Rel Vol">{ticker.relativeVolume.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x</Metric>
      <Metric label="MACD" className={ticker.macd.trend === 'BULLISH' ? 'text-emerald-300' : ticker.macd.trend === 'BEARISH' ? 'text-rose-300' : 'text-slate-200'}>{ticker.macd.trend}</Metric>
      <Metric label="Order Book" className={ticker.orderBook.pressure === 'BUY' ? 'text-emerald-300' : ticker.orderBook.pressure === 'SELL' ? 'text-rose-300' : 'text-slate-200'}>{ticker.orderBook.pressure}</Metric>
      <Metric label="Score" className={ticker.score >= 65 ? 'text-emerald-300' : ticker.score >= 50 ? 'text-amber-300' : 'text-slate-200'}>{ticker.score}</Metric>
    </section>

    <TradingAnalysisChart symbol={ticker.symbol} idrRate={idrRate} />

    <PumpProjectionPanel ticker={ticker} idrRate={idrRate} />

    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <h2 className="mb-2 font-semibold text-white">MACD 15m</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Trend" className={ticker.macd.trend === 'BULLISH' ? 'text-emerald-300' : ticker.macd.trend === 'BEARISH' ? 'text-rose-300' : 'text-slate-200'}>{ticker.macd.trend}</Metric>
          <Metric label="Crossover" className={ticker.macd.crossover === 'BULLISH' ? 'text-emerald-300' : ticker.macd.crossover === 'BEARISH' ? 'text-rose-300' : 'text-slate-200'}>{ticker.macd.crossover}</Metric>
          <Metric label="MACD Line">{ticker.macd.line.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</Metric>
          <Metric label="Signal Line">{ticker.macd.signal.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</Metric>
          <Metric label="Histogram">{ticker.macd.histogram.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</Metric>
          <Metric label="Prev Histogram">{ticker.macd.previousHistogram.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</Metric>
        </div>
      </div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <h2 className="mb-2 font-semibold text-white">Whale Scanner</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Whale Score" className={ticker.whale.whaleScore >= 75 ? 'text-emerald-300' : ticker.whale.whaleScore >= 60 ? 'text-amber-300' : 'text-slate-200'}>{ticker.whale.whaleScore}</Metric>
          <Metric label="Breakout State" className={ticker.whale.breakoutState === 'BREAKOUT_CONFIRMED' ? 'text-emerald-300' : ticker.whale.breakoutState === 'FAILED_BREAKOUT' || ticker.whale.breakoutState === 'DISTRIBUTION_ALERT' ? 'text-rose-300' : 'text-slate-200'}>{ticker.whale.breakoutState}</Metric>
          <Metric label="Net Taker Flow">{ticker.whale.netTakerFlow.toLocaleString('id-ID', { maximumFractionDigits: 3 })}</Metric>
          <Metric label="Volume Ratio">{ticker.whale.volumeSpikeRatio.toLocaleString('id-ID', { maximumFractionDigits: 3 })}x</Metric>
          <Metric label="Book Imbalance" className={tone(ticker.whale.orderBookImbalance * 100)}>{signedPercent(ticker.whale.orderBookImbalance * 100)}</Metric>
          <Metric label="Data Quality">{ticker.whale.dataQuality.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</Metric>
        </div>
      </div>
    </section>

    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <h2 className="mb-2 font-semibold text-white">Order Book Binance</h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Pressure" className={ticker.orderBook.pressure === 'BUY' ? 'text-emerald-300' : ticker.orderBook.pressure === 'SELL' ? 'text-rose-300' : 'text-slate-200'}>{ticker.orderBook.pressure}</Metric>
          <Metric label="Bid/Ask Ratio">{ticker.orderBook.bidAskRatio.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x</Metric>
          <Metric label="Imbalance" className={tone(ticker.orderBook.imbalancePct)}>{signedPercent(ticker.orderBook.imbalancePct)}</Metric>
          <Metric label="Bid Notional"><div>{ticker.orderBook.bidNotional.toLocaleString('id-ID', { maximumFractionDigits: 0 })} USDT</div><div className="text-[0.65rem] font-normal text-slate-500">{rupiah(ticker.orderBook.bidNotional, idrRate)}</div></Metric>
          <Metric label="Ask Notional"><div>{ticker.orderBook.askNotional.toLocaleString('id-ID', { maximumFractionDigits: 0 })} USDT</div><div className="text-[0.65rem] font-normal text-slate-500">{rupiah(ticker.orderBook.askNotional, idrRate)}</div></Metric>
          <Metric label="Ask Wall">{ticker.orderBook.nearestAskWallPrice ? `${value(ticker.orderBook.nearestAskWallPrice)} USDT (${ticker.orderBook.nearestAskWallDistancePct}%)` : '-'}</Metric>
          <Metric label="Bid Wall">{ticker.orderBook.nearestBidWallPrice ? `${value(ticker.orderBook.nearestBidWallPrice)} (${ticker.orderBook.nearestBidWallDistancePct}%)` : '-'}</Metric>
        </div>
      </div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs sm:text-sm">
        <h2 className="mb-2 font-semibold text-white">Whale Signal Reasons</h2>
        <ul className="list-disc space-y-1 pl-4 text-slate-300">
          {ticker.whale.reasons.length ? ticker.whale.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Belum ada alasan whale yang cukup valid untuk pair ini.</li>}
        </ul>
      </div>
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
          <h2 className="font-semibold text-white">Rencana Entry &amp; Take Profit</h2>
          <span className={`text-xs font-semibold ${ticker.pumpProjection.action === 'ENTER_NOW' ? 'text-emerald-300' : ticker.pumpProjection.action === 'AVOID' ? 'text-rose-300' : 'text-amber-300'}`}>{ticker.pumpProjection.action.replace('_', ' ')}</span>
        </div>
        <div className="mt-2">
          {ticker.pumpProjection.entryLow && ticker.pumpProjection.entryHigh
            ? <ZoneRow label={`${ticker.pumpProjection.entryType} Entry`} low={ticker.pumpProjection.entryLow} high={ticker.pumpProjection.entryHigh} idrRate={idrRate} />
            : <div className="rounded-md border border-rose-400/20 bg-rose-500/10 p-3 text-rose-200">Tidak ada entry baru untuk setup ini.</div>}
          {ticker.pumpProjection.triggerPrice && <PriceRow label="Trigger valid" price={ticker.pumpProjection.triggerPrice} idrRate={idrRate} className="text-cyan-300" />}
          <PriceRow label="Take Profit 1" price={ticker.pumpProjection.takeProfit1} idrRate={idrRate} className="text-emerald-300" />
          <PriceRow label="Take Profit 2" price={ticker.pumpProjection.takeProfit2} idrRate={idrRate} className="text-emerald-300" />
          {ticker.pumpProjection.takeProfit3 && <PriceRow label="Take Profit 3 Stretch" price={ticker.pumpProjection.takeProfit3} idrRate={idrRate} className="text-cyan-300" />}
          <PriceRow label="Stop Loss" price={ticker.pumpProjection.stopLoss} idrRate={idrRate} className="text-rose-300" />
          <PriceRow label="Invalidasi" price={ticker.pumpProjection.invalidationPrice} idrRate={idrRate} className="text-rose-300" />
        </div>
        <p className="mt-2 text-xs text-slate-400">{ticker.pumpProjection.entryNote}</p>
        <p className="mt-1 text-xs text-slate-400">{ticker.pumpProjection.takeProfitNote}</p>
      </div>
    </section>

    <section className="rounded-md border border-cyan-400/20 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-white">Catat Posisi Trading</h2>
          <p className="mt-1 text-xs text-slate-400">Simpan harga entry agar Portfolio dapat menghitung P/L dan menilai peluang naik dari posisi yang Anda ambil.</p>
        </div>
        <Link to="/portfolio" className="rounded-md border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200">Buka Portfolio</Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <label className="text-xs text-slate-400">Jumlah coin<input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Contoh: 1000" className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Harga entry USDT<div className="mt-1 flex gap-1"><input type="number" min="0" step="any" value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} placeholder="Harga beli" className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /><button type="button" onClick={() => setEntryPrice(String(ticker.price))} className="rounded-md border border-cyan-400/30 px-2 text-cyan-200" title="Gunakan harga Binance saat ini">Kini</button></div></label>
        <label className="text-xs text-slate-400">Total modal USDT (opsional)<input type="number" min="0" step="any" value={totalCostUsdt} onChange={(event) => setTotalCostUsdt(event.target.value)} placeholder="Otomatis dari entry" className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-400">Batas rugi pribadi %<input type="number" min="0.1" max="100" step="0.1" value={maxLossPct} onChange={(event) => setMaxLossPct(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <div className="flex items-end"><button type="button" onClick={saveTradePosition} className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Simpan Posisi</button></div>
      </div>
      <div className="mt-2 text-xs text-slate-500">Estimasi modal dari entry: {Number(quantity) > 0 && Number(entryPrice) > 0 ? `${value(Number(quantity) * Number(entryPrice))} USDT` : '-'}</div>
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
