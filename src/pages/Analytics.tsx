import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAnalytics, fetchEarlyPumpAnalysis } from '../services/api'
import { SignalHistoryRecord } from '../types'
import { fetchScan } from '../services/api'

type Data = {
  topAlertWinners: SignalHistoryRecord[]
  topMissedPumps: Array<{ symbol: string; gain24h: number; reason: string }>
  averageAlertAccuracy: number
  averageProfitAfterAlert: number
  averageProfit1h: number
  averageProfit4h: number
  averageProfit24h: number
  evaluatedSignals4h: number
  pendingSignals4h: number
  bestPerformingIndicators: Array<{ symbol: string; rsi: number; volSpike: number; relVol: number; gainLossPct: number }>
  liveEarlyCandidates: Array<{
    symbol: string
    price: number
    score: number
    mode: 'EARLY_IGNITION' | 'BREAKOUT_CONFIRM' | 'PULLBACK_REENTRY' | 'NO_ALERT'
    action: 'ENTER_NOW' | 'WAIT_PULLBACK' | 'WAIT_BREAKOUT' | 'AVOID'
    entryLow: number | null
    entryHigh: number | null
    triggerPrice: number | null
    takeProfit1: number
    stopLoss: number
    priceChange15m: number
    priceChange1h: number
    volumeSpikePct: number
    relativeVolume: number
    macdTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    orderBookPressure: 'BUY' | 'SELL' | 'BALANCED'
    whaleScore?: number
    breakoutState?: string
  }>
}

type EarlyPump = {
  symbol: string
  gain24h: number
  snapshots: Array<{ timestamp: string; price: number; volSpike: number; relVol: number; rsi: number; openInterest: number | null }>
}

const CoinLink = ({ symbol }: { symbol: string }) => <Link to={`/coin/${symbol}`} className="font-semibold text-white hover:text-cyan-200">{symbol}</Link>
const number = (value: number | null, digits = 2) => value === null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const price = (value: number | null) => value === null ? '-' : value < 1 ? value.toFixed(8) : number(value, 4)
const actionTone = (action: Data['liveEarlyCandidates'][number]['action']) => action === 'ENTER_NOW' ? 'text-emerald-300' : action === 'AVOID' ? 'text-rose-300' : 'text-amber-300'
const rupiah = (value: number | null, rate: number | null) => value === null || !rate ? 'Rp N/A' : `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value * rate)}`

const Analytics = () => {
  const [data, setData] = useState<Data | null>(null)
  const [early, setEarly] = useState<EarlyPump[]>([])
  const [idrRate, setIdrRate] = useState<number | null>(null)

  useEffect(() => {
    fetchAnalytics().then(setData)
    fetchEarlyPumpAnalysis().then((result) => setEarly(result.records))
    fetchScan().then((scan) => setIdrRate(scan.idrRate)).catch(() => setIdrRate(null))
  }, [])

  if (!data) return <div className="text-slate-400">Memuat analytics...</div>

  return <div className="space-y-5">
    <header>
      <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Analytics</div>
      <h1 className="mt-2 text-2xl font-semibold">Evaluasi kualitas sinyal</h1>
    </header>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">4H Alert Accuracy</div><div className="mt-2 text-3xl font-semibold">{data.averageAlertAccuracy}%</div><div className="mt-2 text-xs text-slate-500">{data.evaluatedSignals4h} evaluated &middot; {data.pendingSignals4h} pending</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Average Profit 1H</div><div className="mt-2 text-3xl font-semibold">{data.averageProfit1h}%</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Average Profit 4H</div><div className="mt-2 text-3xl font-semibold">{data.averageProfit4h}%</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Average Profit 24H</div><div className="mt-2 text-3xl font-semibold">{data.averageProfit24h}%</div></div>
    </div>
    <section>
      <h2 className="font-semibold">Live Early Candidates</h2>
      <div className="mt-3 grid gap-2">
        {data.liveEarlyCandidates.map((item) => <div key={item.symbol} className="rounded bg-slate-900/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <CoinLink symbol={item.symbol} />
              <span className={`font-semibold ${actionTone(item.action)}`}>{item.action.replace('_', ' ')}</span>
              <span className="text-xs text-cyan-300">{item.mode}</span>
            </div>
            <span className="text-white">Score {item.score}</span>
          </div>
          <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-6">
            <div>Harga {price(item.price)} USDT <span className="text-slate-500">{rupiah(item.price, idrRate)}</span></div>
            <div>Entry {price(item.entryLow)}-{price(item.entryHigh)} USDT <span className="text-slate-500">{rupiah(item.entryLow, idrRate)}-{rupiah(item.entryHigh, idrRate)}</span></div>
            <div>Trigger {price(item.triggerPrice)} USDT <span className="text-slate-500">{rupiah(item.triggerPrice, idrRate)}</span></div>
            <div>TP1 {price(item.takeProfit1)} USDT <span className="text-slate-500">{rupiah(item.takeProfit1, idrRate)}</span></div>
            <div>SL {price(item.stopLoss)} USDT <span className="text-slate-500">{rupiah(item.stopLoss, idrRate)}</span></div>
            <div>15m {number(item.priceChange15m)}% | 1h {number(item.priceChange1h)}%</div>
            <div>VolSpike {number(item.volumeSpikePct)}%</div>
            <div>RelVol {number(item.relativeVolume)}x</div>
            <div>MACD {item.macdTrend}</div>
            <div>OB {item.orderBookPressure}</div>
            <div>Whale {item.whaleScore ?? '-'} </div>
            <div>Breakout {item.breakoutState ?? 'WAIT'}</div>
          </div>
        </div>)}
        {!data.liveEarlyCandidates.length && <div className="rounded bg-slate-900/60 p-3 text-sm text-slate-400">Belum ada kandidat early yang memenuhi risk gate saat ini.</div>}
      </div>
    </section>
    <section>
      <h2 className="font-semibold">Top Alert Winners</h2>
      <div className="mt-3 grid gap-2">{data.topAlertWinners.map((item) => <div key={item.id} className="flex justify-between rounded bg-slate-900/60 p-3 text-sm"><CoinLink symbol={item.symbol} /><span className="text-emerald-300">{item.gain4hPct}% dalam 4H</span></div>)}</div>
    </section>
    <section>
      <h2 className="font-semibold">Top Missed Pumps</h2>
      <div className="mt-3 grid gap-2">{data.topMissedPumps.map((item) => <div key={item.symbol} className="rounded bg-slate-900/60 p-3 text-sm"><div className="flex justify-between"><CoinLink symbol={item.symbol} /><span className="text-emerald-300">+{item.gain24h}%</span></div><div className="mt-1 text-slate-400">{item.reason}</div></div>)}</div>
    </section>
    <section>
      <h2 className="font-semibold">Early Pump Detector Snapshots</h2>
      <div className="mt-3 grid gap-3">{early.map((item) => <div key={item.symbol} className="rounded bg-slate-900/60 p-3 text-sm"><div className="flex justify-between"><CoinLink symbol={item.symbol} /><span className="text-emerald-300">+{item.gain24h}%</span></div><div className="mt-2 text-xs text-slate-400">{item.snapshots.length ? item.snapshots.slice(-4).map((snapshot) => `${new Date(snapshot.timestamp).toLocaleTimeString('id-ID')} · price ${snapshot.price} · spike ${snapshot.volSpike}% · rel ${snapshot.relVol}x · RSI ${snapshot.rsi}`).join(' | ') : 'Snapshot 5 menit akan muncul setelah scheduler merekam data.'}</div></div>)}</div>
    </section>
  </div>
}

export default Analytics
