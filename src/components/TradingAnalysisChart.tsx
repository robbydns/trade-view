import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, Time } from 'lightweight-charts'
import { fetchCoinKlines } from '../services/api'
import { Candle } from '../types'

type Timeframe = '15m' | '1h' | '4h' | '1d'
type Trend = 'BULLISH' | 'BEARISH' | 'SIDEWAYS'
type StructureStatus = 'BREAKOUT' | 'RETEST' | 'REJECTION' | 'BREAKDOWN' | 'SIDEWAYS'
type Decision = 'BUY WATCH' | 'WAIT' | 'AVOID'

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
  ema9: number[]
  ema21: number[]
  ma50: Array<number | null>
  rsi: number
  volumeSpikePct: number
  distanceToSupportPct: number
  distanceToResistancePct: number
  trendline: TrendLine
  markers: Array<{ time: Time; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }>
  reasons: string[]
}

const timeframes: Timeframe[] = ['15m', '1h', '4h', '1d']
const label: Record<Timeframe, string> = { '15m': '15M', '1h': '1H', '4h': '4H', '1d': '1D' }
const round = (value: number, digits = 8) => Number(value.toFixed(digits))
const number = (value: number, digits = 4) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const percent = (value: number) => `${value > 0 ? '+' : ''}${number(value, 2)}%`
const pct = (current: number, previous: number) => previous ? ((current - previous) / previous) * 100 : 0
const average = (values: number[]) => values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0

const ema = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((result, value, index) => {
    result.push(index ? value * multiplier + result[index - 1] * (1 - multiplier) : value)
    return result
  }, [])
}

const sma = (values: number[], period: number) => values.map((_, index) => index < period - 1 ? null : average(values.slice(index - period + 1, index + 1)))

const rsi = (candles: Candle[], period = 14) => {
  const closes = candles.slice(-(period + 1)).map((candle) => candle.close)
  if (closes.length < period + 1) return 0
  let gains = 0
  let losses = 0
  for (let index = 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1]
    if (delta >= 0) gains += delta
    else losses += Math.abs(delta)
  }
  return losses ? 100 - (100 / (1 + gains / losses)) : 100
}

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

export const analyzeCandles = (candles: Candle[]): Analysis => {
  const latest = candles[candles.length - 1]
  const previous = candles[candles.length - 2]
  const closes = candles.map((candle) => candle.close)
  const ema9 = ema(closes, 9)
  const ema21 = ema(closes, 21)
  const ma50 = sma(closes, 50)
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
  const currentRsi = rsi(candles)
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
  const trend: Trend = lastEma9 > lastEma21 && lastEma21 >= lastMa50 ? 'BULLISH' : lastEma9 < lastEma21 && lastEma21 <= lastMa50 ? 'BEARISH' : 'SIDEWAYS'
  const structureStatus: StructureStatus = breakdown ? 'BREAKDOWN' : breakout ? 'BREAKOUT' : retest ? 'RETEST' : rejection ? 'REJECTION' : 'SIDEWAYS'
  let decision: Decision = 'WAIT'
  const reasons: string[] = []
  if (rejection) {
    decision = 'AVOID'
    reasons.push('Candle terakhir memiliki wick atas besar dan volume mulai turun. Risiko rejection meningkat.')
  } else if (distanceFromEmaPct > 6 || currentRsi > 75 || longGreenCandle) {
    decision = 'WAIT'
    reasons.push('Harga sudah terlalu jauh dari EMA atau RSI/candle menunjukkan kondisi panas. Tunggu pullback.')
  } else if ((nearSupport || breakout) && lastEma9 > lastEma21 && volumeStarting && currentRsi < 70) {
    decision = 'BUY WATCH'
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
    entryLow: nearSupport ? supportLow : pullbackLow, entryHigh: nearSupport ? supportHigh : pullbackHigh, stopLoss: supportLow * 0.985,
    target: Math.max(resistanceHigh, latest.close * 1.04), ema9, ema21, ma50, rsi: currentRsi, volumeSpikePct,
    distanceToSupportPct: pct(latest.close, support.price), distanceToResistancePct: pct(resistance.price, latest.close), trendline, markers, reasons
  }
}

const TradingAnalysisChart = ({ symbol }: { symbol: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [dailyCandles, setDailyCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const analysis = useMemo(() => candles.length >= 50 ? analyzeCandles(candles) : null, [candles])
  const dailyAnalysis = useMemo(() => dailyCandles.length >= 50 ? analyzeCandles(dailyCandles) : null, [dailyCandles])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([fetchCoinKlines(symbol, timeframe, 200), fetchCoinKlines(symbol, '1d', 200)])
      .then(([activeResult, dailyResult]) => {
        if (!active) return
        setCandles(activeResult.candles)
        setDailyCandles(dailyResult.candles)
        setError('')
      })
      .catch((err) => {
        if (!active) return
        setCandles([])
        setDailyCandles([])
        setError((err as Error).message)
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [symbol, timeframe])

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
    candleSeries.setData(candles.map((candle) => ({ time: Math.floor(candle.openTime / 1000) as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close })))
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volume.setData(candles.map((candle) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: candle.quoteVolume, color: candle.close >= candle.open ? 'rgba(52,211,153,0.45)' : 'rgba(251,113,133,0.45)' })))
    const ema9Series = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, title: 'EMA 9' })
    const ema21Series = chart.addSeries(LineSeries, { color: '#facc15', lineWidth: 2, title: 'EMA 21' })
    const ma50Series = chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 2, title: 'MA 50' })
    ema9Series.setData(candles.map((candle, index) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ema9[index] })))
    ema21Series.setData(candles.map((candle, index) => ({ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ema21[index] })))
    ma50Series.setData(candles.flatMap((candle, index) => analysis.ma50[index] === null ? [] : [{ time: Math.floor(candle.openTime / 1000) as Time, value: analysis.ma50[index] as number }]))
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
  }, [analysis, candles])

  const multiTimeframe = useMemo(() => {
    if (!analysis || !dailyAnalysis) return '-'
    if (dailyAnalysis.trend === 'BULLISH' && analysis.structureStatus === 'BREAKOUT') return 'KONFIRMASI KUAT: tren 1D bullish dan 1H/TF aktif breakout.'
    if (dailyAnalysis.trend === 'BEARISH' && ['BREAKOUT', 'RETEST'].includes(analysis.structureStatus)) return 'WARNING COUNTER TREND: TF aktif naik, tetapi arah besar 1D masih bearish.'
    if (dailyAnalysis.trend === 'SIDEWAYS' && analysis.distanceToSupportPct <= 3) return 'WATCH: tren 1D sideways dan harga mendekati support pada TF aktif.'
    if (dailyAnalysis.rsi > 75 && analysis.trend === 'BULLISH') return 'WAIT / AVOID: 1D overbought dan TF aktif masih pump tinggi.'
    return `TF aktif ${analysis.trend.toLowerCase()}, sedangkan arah besar 1D ${dailyAnalysis.trend.toLowerCase()}.`
  }, [analysis, dailyAnalysis])

  return <section className="rounded-md border border-white/10 bg-slate-900/60">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
      <div>
        <h2 className="font-semibold text-white">Interactive Trading Analysis</h2>
        <p className="mt-1 text-xs text-slate-500">Candle Binance real-time proxy &middot; pan, zoom, dan crosshair aktif</p>
      </div>
      <div className="flex gap-1">{timeframes.map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} className={`rounded-md px-3 py-2 text-xs font-semibold ${timeframe === item ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 text-slate-300 hover:bg-white/5'}`}>{label[item]}</button>)}</div>
    </div>
    {error && <div className="m-3 rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">ERROR: {error}</div>}
    {loading && <div className="grid h-64 place-items-center text-sm text-slate-400">Memuat candle Binance {label[timeframe]}...</div>}
    {!loading && analysis && <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="relative">
          <div ref={containerRef} />
          <AnalysisOverlay analysis={analysis} candles={candles} />
        </div>
      </div>
      <aside className="space-y-3 p-3 text-xs">
        <div className="flex items-center justify-between"><span className="text-slate-500">Timeframe aktif</span><strong>{label[timeframe]}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Trend</span><strong>{analysis.trend}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><strong>{analysis.structureStatus}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Sinyal</span><strong className={analysis.decision === 'BUY WATCH' ? 'text-emerald-300' : analysis.decision === 'AVOID' ? 'text-rose-300' : 'text-amber-300'}>{analysis.decision}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">Harga sekarang</span><strong>{number(candles[candles.length - 1].close, 8)}</strong></div>
        <div className="flex items-center justify-between"><span className="text-slate-500">EMA status</span><strong>{analysis.ema9[analysis.ema9.length - 1] > analysis.ema21[analysis.ema21.length - 1] ? 'EMA 9 > EMA 21' : 'EMA 9 < EMA 21'}</strong></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Support</div><div className="mt-1">{number(analysis.support.price, 8)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Resistance</div><div className="mt-1">{number(analysis.resistance.price, 8)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Ke support</div><div className="mt-1">{percent(analysis.distanceToSupportPct)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Ke resistance</div><div className="mt-1">{percent(analysis.distanceToResistancePct)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">RSI</div><div className="mt-1">{number(analysis.rsi, 2)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Volume spike</div><div className="mt-1">{percent(analysis.volumeSpikePct)}</div></div>
        </div>
        <div className="rounded bg-emerald-500/10 p-2 text-emerald-200">Entry watch: {number(analysis.entryLow, 8)} - {number(analysis.entryHigh, 8)}</div>
        <div className="rounded bg-rose-500/10 p-2 text-rose-200">Stop loss area: {number(analysis.stopLoss, 8)}</div>
        <div className="rounded bg-cyan-500/10 p-2 text-cyan-200">Target area: {number(analysis.target, 8)}</div>
        <ul className="list-disc space-y-1 pl-4 text-slate-400">{analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </aside>
    </div>}
    {!loading && analysis && dailyAnalysis && <div className="grid gap-2 border-t border-white/10 p-3 text-xs md:grid-cols-3">
      <div className="rounded bg-white/5 p-3"><div className="font-semibold text-white">Analisis {label[timeframe]}</div><div className="mt-1 text-slate-400">{analysis.trend} &middot; {analysis.structureStatus} &middot; RSI {number(analysis.rsi, 2)}</div></div>
      <div className="rounded bg-white/5 p-3"><div className="font-semibold text-white">Analisis 1D</div><div className="mt-1 text-slate-400">{dailyAnalysis.trend} &middot; {dailyAnalysis.structureStatus} &middot; RSI {number(dailyAnalysis.rsi, 2)}</div></div>
      <div className="rounded bg-white/5 p-3"><div className="font-semibold text-white">Kesimpulan Multi-Timeframe</div><div className="mt-1 text-slate-400">{multiTimeframe}</div></div>
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
