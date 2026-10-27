import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, Time } from 'lightweight-charts'
import { fetchCoinKlines } from '../services/api'
import { Candle } from '../types'
import { analyzeTechnicalCandles, deriveMultiTimeframeSignal, TechnicalAnalysis } from '../services/technical-analysis'

type Timeframe = '1m' | '15m' | '1h' | '1d'
type Trend = TechnicalAnalysis['trend']
type StructureStatus = 'BREAKOUT' | 'RETEST' | 'REJECTION' | 'BREAKDOWN' | 'SIDEWAYS'
type Decision = 'STRONG BUY' | 'BUY WATCH' | 'WAIT' | 'AVOID'

type IndexedLevel = { price: number; touches: number }
type TrendLine = { type: 'bullish' | 'bearish'; from: { index: number; price: number }; to: { index: number; price: number } } | null
type Analysis = {
  trend: Trend
  structureStatus: StructureStatus
  decision: Decision
  support: IndexedLevel
  resistance: IndexedLevel
  supportLow: number
  supportHigh: number
  resistanceLow: number
  resistanceHigh: number
  pullbackLow: number
  pullbackHigh: number
  entryLow: number
  entryHigh: number
  stopLoss: number
  target: number
  target2: number
  riskReward: number | null
  ema9: number[]
  ema21: number[]
  ema50: number[]
  ma20: Array<number | null>
  ma50: Array<number | null>
  sma50Period: number
  rsi: number
  macd: TechnicalAnalysis['macd']
  volumeSpikePct: number
  volumeRatio: number | null
  score: number
  distanceToSupportPct: number
  distanceToResistancePct: number
  trendline: TrendLine
  markers: Array<{ time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }>
  reasons: string[]
}

const timeframes: Timeframe[] = ['1m', '15m', '1h', '1d']
const label: Record<Timeframe, string> = { '1m': '1M', '15m': '15M', '1h': '1H', '1d': '1D' }
const last = <T,>(values: T[], offset = 1): T | undefined => values[values.length - offset]
const number = (value: number, digits = 4) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const percent = (value: number) => `${value > 0 ? '+' : ''}${number(value, 2)}%`
const pct = (current: number, previous: number) => previous ? ((current - previous) / previous) * 100 : 0
const average = (values: number[]) => values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0

const swings = (candles: Candle[]) => {
  const lows: Array<{ index: number; price: number }> = []
  const highs: Array<{ index: number; price: number }> = []
  candles.forEach((candle, index) => {
    if (!index || index === candles.length - 1) return
    if (candle.low <= candles[index - 1].low && candle.low <= candles[index + 1].low) lows.push({ index, price: candle.low })
    if (candle.high >= candles[index - 1].high && candle.high >= candles[index + 1].high) highs.push({ index, price: candle.high })
  })
  return { lows, highs }
}

const clusteredLevel = (prices: number[], currentPrice: number, type: 'support' | 'resistance'): IndexedLevel => {
  const candidates = prices.map((price) => ({ price, touches: prices.filter((item) => Math.abs(item - price) / price <= 0.006).length }))
    .filter((item) => type === 'support' ? item.price < currentPrice : item.price > currentPrice)
    .filter((item) => item.touches >= 2)
    .sort((a, b) => b.touches - a.touches || (type === 'support' ? b.price - a.price : a.price - b.price))
  return candidates[0] || { price: type === 'support' ? currentPrice * 0.97 : currentPrice * 1.03, touches: 0 }
}

export const analyzeCandles = (inputCandles: Candle[]): Analysis => {
  const candles = inputCandles.length > 1 ? inputCandles.slice(0, -1) : inputCandles
  const indicators = analyzeTechnicalCandles(inputCandles)
  if (!indicators) throw new Error('Diperlukan minimal 51 candle untuk analisis lengkap.')
  const latest = candles[candles.length - 1]
  const previous = candles[candles.length - 2]
  const ema9 = indicators.ema9
  const ema21 = indicators.ema21
  const ema50 = indicators.ema50
  const ma20 = indicators.sma20
  const ma50 = indicators.sma50
  const recent = candles.slice(-100)
  const swing = swings(candles)
  const support = clusteredLevel(recent.map((candle) => candle.low), latest.close, 'support')
  const resistance = clusteredLevel(recent.map((candle) => candle.high), latest.close, 'resistance')
  const supportLow = support.price * 0.994
  const supportHigh = support.price * 1.006
  const resistanceLow = resistance.price * 0.994
  const resistanceHigh = resistance.price * 1.006
  const lastEma9 = ema9[ema9.length - 1]
  const lastEma21 = ema21[ema21.length - 1]
  const lastMa50 = ma50[ma50.length - 1] || lastEma21
  const pullbackLow = Math.min(lastEma9, lastEma21)
  const pullbackHigh = Math.max(lastEma9, lastEma21)
  const avgVolume20 = average(candles.slice(-21, -1).map((candle) => candle.quoteVolume))
  const volumeSpikePct = avgVolume20 ? pct(latest.quoteVolume, avgVolume20) : 0
  const currentRsi = indicators.rsi
  const priorBreakout = candles.slice(-9, -1).some((candle) => candle.close > resistanceHigh)
  const breakout = previous.close <= resistanceHigh && latest.close > resistanceHigh && latest.quoteVolume > avgVolume20
  const retest = priorBreakout && latest.low <= resistanceHigh * 1.01 && latest.close >= resistanceLow
  const breakdown = latest.close < supportLow
  const body = Math.max(Math.abs(latest.close - latest.open), latest.close * 0.0001)
  const upperWick = latest.high - Math.max(latest.open, latest.close)
  const rejection = latest.high >= resistanceLow && latest.close < resistanceLow && upperWick > body * 1.5 && latest.quoteVolume < avgVolume20
  const sideways = Math.abs(pct(latest.close, lastMa50)) < 2 && Math.abs(pct(lastEma9, lastEma21)) < 1
  const distanceFromEmaPct = Math.abs(pct(latest.close, average([lastEma9, lastEma21])))
  const longGreenCandle = pct(latest.close, latest.open) > 3
  const nearSupport = latest.close <= supportHigh * 1.02 || retest
  const volumeStarting = latest.quoteVolume >= avgVolume20 * 0.8
  const latestLowSwings = swing.lows.slice(-2)
  const latestHighSwings = swing.highs.slice(-2)
  const trendline: TrendLine = latestLowSwings.length === 2 && latestLowSwings[1].price > latestLowSwings[0].price
    ? { type: 'bullish', from: latestLowSwings[0], to: latestLowSwings[1] }
    : latestHighSwings.length === 2 && latestHighSwings[1].price < latestHighSwings[0].price
      ? { type: 'bearish', from: latestHighSwings[0], to: latestHighSwings[1] }
      : null
  const trend: Trend = indicators.trend
  const structureStatus: StructureStatus = breakdown ? 'BREAKDOWN' : breakout ? 'BREAKOUT' : retest ? 'RETEST' : rejection ? 'REJECTION' : 'SIDEWAYS'
  let decision: Decision = indicators.decision
  const reasons: string[] = []
  if (rejection) {
    decision = 'AVOID'
    reasons.push('Candle terakhir memiliki wick atas besar dan volume mulai turun. Risiko rejection meningkat.')
  } else if (distanceFromEmaPct > 6 || currentRsi > 75 || longGreenCandle) {
    decision = 'WAIT'
    reasons.push('Harga sudah terlalu jauh dari EMA atau RSI/candle menunjukkan kondisi panas. Tunggu pullback.')
  } else if ((nearSupport || breakout) && lastEma9 > lastEma21 && volumeStarting && currentRsi < 70 && indicators.decision !== 'AVOID') {
    decision = indicators.decision === 'STRONG BUY' && breakout ? 'STRONG BUY' : 'BUY WATCH'
    reasons.push(breakout ? 'Harga menembus resistance dengan volume di atas rata-rata 20 candle.' : 'Harga berada dekat support atau retest area.')
    reasons.push('EMA 9 berada di atas EMA 21 dan RSI masih di bawah 70.')
  } else {
    reasons.push('Belum ada konfirmasi lengkap. Pantau reaksi harga pada support, resistance, dan EMA.')
  }
  if (breakdown) reasons.push('Harga menembus support area. Risiko pelemahan lanjutan meningkat.')
  const markers: Analysis['markers'] = []
  if (breakout) markers.push({ time: Math.floor(latest.openTime / 1000) as Time, position: 'belowBar', color: '#34d399', shape: 'arrowUp', text: 'Breakout + Volume' })
  if (retest) markers.push({ time: Math.floor(latest.openTime / 1000) as Time, position: 'belowBar', color: '#22d3ee', shape: 'circle', text: 'Retest Area' })
  if (rejection || breakdown) markers.push({ time: Math.floor(latest.openTime / 1000) as Time, position: 'aboveBar', color: '#fb7185', shape: 'arrowDown', text: rejection ? 'Rejection' : 'Breakdown' })
  return {
    trend, structureStatus, decision, support, resistance, supportLow, supportHigh, resistanceLow, resistanceHigh, pullbackLow, pullbackHigh,
    entryLow: nearSupport ? Math.max(indicators.entryLow, supportLow) : indicators.entryLow,
    entryHigh: nearSupport ? Math.max(indicators.entryLow, Math.min(indicators.entryHigh, supportHigh)) : indicators.entryHigh,
    stopLoss: indicators.stopLoss,
    target: indicators.takeProfit1, target2: indicators.takeProfit2, riskReward: indicators.riskReward,
    ema9, ema21, ema50, ma20, ma50, sma50Period: indicators.sma50Period, rsi: currentRsi, macd: indicators.macd, volumeSpikePct: indicators.volumeSpikePct ?? 0, volumeRatio: indicators.volumeRatio, score: indicators.score,
    distanceToSupportPct: pct(latest.close, support.price), distanceToResistancePct: pct(resistance.price, latest.close), trendline, markers, reasons
  }
}

const TradingAnalysisChart = ({ symbol, idrRate }: { symbol: string; idrRate: number | null }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candlesByTimeframe, setCandlesByTimeframe] = useState<Partial<Record<Timeframe, Candle[]>>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const candles = candlesByTimeframe[timeframe] || []
  const analysis = useMemo(() => candles.length >= 51 ? analyzeCandles(candles) : null, [candles])
  const closedCandles = useMemo(() => candles.length > 1 ? candles.slice(0, -1) : candles, [candles])
  const priceWithIdr = (value: number) => `${number(value, 8)} USDT · ${idrRate ? `Rp${number(value * idrRate, 2)}` : 'Rp N/A'}`
  const multiTimeframeAnalysis = useMemo(() => Object.fromEntries(timeframes.map((interval) => [interval, analyzeTechnicalCandles(candlesByTimeframe[interval] || [])])) as Partial<Record<Timeframe, TechnicalAnalysis | null>>, [candlesByTimeframe])
  const consensus = useMemo(() => deriveMultiTimeframeSignal(multiTimeframeAnalysis), [multiTimeframeAnalysis])

  useEffect(() => {
    let active = true
    let firstLoad = true
    const load = async () => {
      try {
        const results = await Promise.allSettled(timeframes.map((interval) => fetchCoinKlines(symbol, interval, 200)))
        if (!active) return
        const next: Partial<Record<Timeframe, Candle[]>> = {}
        const failures: string[] = []
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') next[timeframes[index]] = result.value.candles
          else failures.push(`${label[timeframes[index]]}: ${(result.reason as Error).message}`)
        })
        setCandlesByTimeframe(next)
        setError(failures.join(' · '))
      } finally {
        if (active && firstLoad) { setLoading(false); firstLoad = false }
      }
    }
    void load().catch((err) => active && setError((err as Error).message))
    const timer = window.setInterval(() => { void load().catch((err) => active && setError((err as Error).message)) }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [symbol])

  useEffect(() => {
    if (!containerRef.current || !analysis || !candles.length) return
    const container = containerRef.current
    const chart = createChart(container, {
      width: container.clientWidth, height: 520,
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(148,163,184,0.08)' }, horzLines: { color: 'rgba(148,163,184,0.08)' } },
      timeScale: { borderColor: 'rgba(148,163,184,0.2)', timeVisible: true },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' },
      crosshair: { vertLine: { color: 'rgba(34,211,238,0.45)' }, horzLine: { color: 'rgba(34,211,238,0.45)' } }
    })
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: '#34d399', downColor: '#fb7185', wickUpColor: '#34d399', wickDownColor: '#fb7185', borderVisible: false })
    candleSeries.setData(closedCandles.map((candle) => ({ time: Math.floor(candle.openTime / 1000) as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close })))
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volume.setData(closedCandles.map((candle) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: candle.quoteVolume, color: candle.close >= candle.open ? 'rgba(52,211,153,0.45)' : 'rgba(251,113,133,0.45)' })))
    const ema9Series = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, title: 'EMA 9' })
    const ema21Series = chart.addSeries(LineSeries, { color: '#facc15', lineWidth: 2, title: 'EMA 21' })
    const ema50Series = chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 2, title: 'EMA 50' })
    const ma20Series = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1, title: 'SMA 20' })
    const ma50Series = chart.addSeries(LineSeries, { color: '#f472b6', lineWidth: 1, title: 'SMA 50' })
    ema9Series.setData(closedCandles.map((candle, index) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ema9[index] })))
    ema21Series.setData(closedCandles.map((candle, index) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ema21[index] })))
    ema50Series.setData(closedCandles.map((candle, index) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ema50[index] })))
    ma20Series.setData(closedCandles.flatMap((candle, index) => analysis.ma20[index] === null ? [] : [{ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ma20[index] as number }]))
    ma50Series.setData(closedCandles.flatMap((candle, index) => analysis.ma50[index] === null ? [] : [{ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ma50[index] as number }]))
    candleSeries.createPriceLine({ price: analysis.support.price, color: '#34d399', lineStyle: 2, axisLabelVisible: true, title: 'Support Area' })
    candleSeries.createPriceLine({ price: analysis.resistance.price, color: '#f472b6', lineStyle: 2, axisLabelVisible: true, title: 'Resistance Area' })
    candleSeries.createPriceLine({ price: analysis.stopLoss, color: '#fb7185', lineStyle: 2, axisLabelVisible: true, title: 'Stop Loss Area' })
    candleSeries.createPriceLine({ price: analysis.target, color: '#22d3ee', lineStyle: 2, axisLabelVisible: true, title: 'Target Area' })
    createSeriesMarkers(candleSeries, analysis.markers)
    chart.timeScale().fitContent()
    const resize = () => chart.applyOptions({ width: container.clientWidth })
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [analysis, closedCandles])

  const multiTimeframe = consensus.reasons.join(' ')

  return <section className="rounded-md border border-white/10 bg-slate-900/60">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
      <div>
        <h2 className="font-semibold text-white">Interactive Trading Analysis</h2>
        <p className="mt-1 text-xs text-slate-500">Candle Binance yang sudah close · chart axis USDT · nilai IDR memakai kurs referensi USDT/IDR</p>
      </div>
      <div className="flex gap-1">{timeframes.map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} className={`rounded-md px-3 py-2 text-xs font-semibold ${timeframe === item ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 text-slate-300 hover:bg-white/5'}`}>{label[item]}{!multiTimeframeAnalysis[item] ? ' ·' : ''}</button>)}</div>
    </div>
    {error && <div className="m-3 rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">ERROR: {error}</div>}
    {loading && <div className="grid h-64 place-items-center text-sm text-slate-400">Memuat candle Binance {label[timeframe]}...</div>}
    {!loading && !analysis && <div className="m-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">Candle {label[timeframe]} belum cukup untuk analisis (perlu minimal 51 candle valid). Data tidak dipakai untuk sinyal.</div>}
    {!loading && analysis && <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="relative">
          <div ref={containerRef} />
          <AnalysisOverlay analysis={analysis} candles={closedCandles} />
        </div>
      </div>
      <aside className="space-y-3 p-3 text-xs">
        <div className="flex items-center justify-between"><span className="text-slate-500">Timeframe aktif</span><strong>{label[timeframe]}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Trend</span><strong>{analysis.trend}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><strong>{analysis.structureStatus}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Konsensus 1m/15m/1h/1d</span><strong className={consensus.decision === 'STRONG BUY' || consensus.decision === 'BUY WATCH' ? 'text-emerald-300' : consensus.decision === 'AVOID' ? 'text-rose-300' : 'text-amber-300'}>{consensus.decision} · {consensus.score}/100</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Sinyal TF aktif</span><strong className={analysis.decision === 'STRONG BUY' || analysis.decision === 'BUY WATCH' ? 'text-emerald-300' : analysis.decision === 'AVOID' ? 'text-rose-300' : 'text-amber-300'}>{analysis.decision} · {analysis.score}/100</strong></div>
        <div className="flex flex-col"><span className="text-slate-500">Harga candle close</span><strong className="mt-1 text-right">{priceWithIdr(last(closedCandles)?.close || 0)}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">EMA status</span><strong>{analysis.ema9[analysis.ema9.length - 1] > analysis.ema21[analysis.ema21.length - 1] ? 'EMA 9 > EMA 21' : 'EMA 9 < EMA 21'}</strong></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Support</div><div className="mt-1">{priceWithIdr(analysis.support.price)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Resistance</div><div className="mt-1">{priceWithIdr(analysis.resistance.price)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">EMA 50</div><div className="mt-1">{priceWithIdr(last(analysis.ema50) || 0)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">SMA 20 / 50</div><div className="mt-1">{priceWithIdr(last(analysis.ma20) || 0)} / {priceWithIdr(last(analysis.ma50) || 0)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Ke support</div><div className="mt-1">{percent(analysis.distanceToSupportPct)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Ke resistance</div><div className="mt-1">{percent(analysis.distanceToResistancePct)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">RSI</div><div className="mt-1">{number(analysis.rsi, 2)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">MACD</div><div className="mt-1">{analysis.macd.trend} · hist {number(analysis.macd.histogram, 8)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Volume / spike</div><div className="mt-1">{analysis.volumeRatio === null ? 'N/A' : `${number(analysis.volumeRatio)}x / ${percent(analysis.volumeSpikePct)}`}</div></div>
        </div>
        <div className="rounded bg-emerald-500/10 p-2 text-emerald-200">Entry watch: {priceWithIdr(analysis.entryLow)} – {priceWithIdr(analysis.entryHigh)}</div>
        <div className="rounded bg-rose-500/10 p-2 text-rose-200">Stop loss: {priceWithIdr(analysis.stopLoss)}</div>
        <div className="rounded bg-cyan-500/10 p-2 text-cyan-200">TP1: {priceWithIdr(analysis.target)}</div>
        <div className="rounded bg-cyan-500/10 p-2 text-cyan-200">TP2: {priceWithIdr(analysis.target2)}</div>
        <div className="rounded bg-white/5 p-2 text-slate-300">Risk/Reward TP1: {analysis.riskReward === null ? 'Belum valid' : `${analysis.riskReward}:1`}</div>
        <ul className="list-disc space-y-1 pl-4 text-slate-400">{analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </aside>
    </div>}
    {!loading && <div className="grid gap-2 border-t border-white/10 p-3 text-xs md:grid-cols-5">
      {timeframes.map((interval) => {
        const item = multiTimeframeAnalysis[interval]
        return <div key={interval} className="rounded bg-white/5 p-3"><div className="font-semibold text-white">Analisis {label[interval]}</div><div className="mt-1 text-slate-400">{item ? `${item.trend} · ${item.decision} · ${item.score}/100` : 'Data belum cukup / tidak tersedia'}</div><div className="mt-1 text-slate-500">RSI {item ? number(item.rsi, 1) : '—'} · MACD {item?.macd.trend || '—'} · Vol {item?.volumeRatio === null || item?.volumeRatio === undefined ? '—' : `${number(item.volumeRatio)}x`}</div></div>
      })}
      <div className="rounded bg-white/5 p-3"><div className="font-semibold text-white">Konsensus Multi-TF</div><div className={`mt-1 ${consensus.decision === 'STRONG BUY' || consensus.decision === 'BUY WATCH' ? 'text-emerald-300' : consensus.decision === 'AVOID' ? 'text-rose-300' : 'text-amber-300'}`}>{consensus.decision} · {consensus.score}/100</div><div className="mt-1 text-slate-400">{multiTimeframe}</div></div>
    </div>}
    <div className="border-t border-white/10 p-3 text-xs text-slate-500">Analisis ini bukan prediksi pasti dan bukan nasihat finansial. Gunakan manajemen risiko.</div>
  </section>
}

export default TradingAnalysisChart

const AnalysisOverlay = ({ analysis, candles }: { analysis: Analysis; candles: Candle[] }) => {
  const min = Math.min(...candles.map((candle) => candle.low), analysis.stopLoss)
  const max = Math.max(...candles.map((candle) => candle.high), analysis.target)
  const range = Math.max(max - min, Number.EPSILON)
  const y = (price: number) => 5 + ((max - price) / range) * 73
  const height = (low: number, high: number) => Math.max(1.2, y(low) - y(high))
  const x = (index: number) => 4 + (index / Math.max(candles.length - 1, 1)) * 91
  const zone = (name: string, low: number, high: number, color: string, width = 94) => <g key={name}>
    <rect x="3" y={y(high)} width={width} height={height(low, high)} fill={color} rx="0.8" />
    <text x="4" y={Math.max(3, y(high) - 0.7)} fill="rgba(226,232,240,0.85)" fontSize="2.6">{name}</text>
  </g>
  return <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {zone('Resistance Area', analysis.resistanceLow, analysis.resistanceHigh, 'rgba(244,114,182,0.16)')}
    {zone('Breakout Zone', analysis.resistanceHigh, analysis.resistanceHigh * 1.012, 'rgba(34,211,238,0.10)', 80)}
    {zone('Support Area', analysis.supportLow, analysis.supportHigh, 'rgba(52,211,153,0.16)')}
    {zone('Pullback Zone', analysis.pullbackLow, analysis.pullbackHigh, 'rgba(250,204,21,0.10)', 76)}
    {zone(analysis.decision === 'BUY WATCH' ? 'BUY WATCH Area' : 'Entry Watch Zone', analysis.entryLow, analysis.entryHigh, 'rgba(34,197,94,0.11)', 60)}
    {analysis.structureStatus === 'RETEST' && zone('Retest Area', analysis.resistanceLow, analysis.resistanceHigh, 'rgba(34,211,238,0.16)', 68)}
    {analysis.decision === 'WAIT' && zone('WAIT - Harga sudah tinggi', analysis.pullbackHigh, analysis.pullbackHigh * 1.015, 'rgba(250,204,21,0.13)', 72)}
    {zone('Stop Loss Area', analysis.stopLoss * 0.996, analysis.stopLoss * 1.004, 'rgba(251,113,133,0.15)', 52)}
    {zone('Target Area', analysis.target * 0.996, analysis.target * 1.004, 'rgba(34,211,238,0.13)', 48)}
    {analysis.decision === 'AVOID' && zone('AVOID - Rawan dump', analysis.resistanceLow, analysis.resistanceHigh * 1.025, 'rgba(239,68,68,0.13)', 88)}
    {analysis.trendline && <g>
      <line x1={x(analysis.trendline.from.index)} y1={y(analysis.trendline.from.price)} x2={x(analysis.trendline.to.index)} y2={y(analysis.trendline.to.price)} stroke="#60a5fa" strokeWidth="0.45" strokeDasharray="1.2 0.7" />
      <text x={x(analysis.trendline.from.index)} y={y(analysis.trendline.from.price) - 1} fill="#93c5fd" fontSize="2.6">{analysis.trendline.type === 'bullish' ? 'Bullish Trendline' : 'Bearish Trendline'}</text>
    </g>}
  </svg>
}
