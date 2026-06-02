import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAnalytics, fetchEarlyPumpAnalysis } from '../services/api'
import { SignalHistoryRecord } from '../types'

type Data = {
  topAlertWinners: SignalHistoryRecord[]
  topMissedPumps: Array<{ symbol: string; gain24h: number; reason: string }>
  averageAlertAccuracy: number
  averageProfitAfterAlert: number
  bestPerformingIndicators: Array<{ symbol: string; rsi: number; volSpike: number; relVol: number; gainLossPct: number }>
}

type EarlyPump = {
  symbol: string
  gain24h: number
  snapshots: Array<{ timestamp: string; price: number; volSpike: number; relVol: number; rsi: number; openInterest: number | null }>
}

const CoinLink = ({ symbol }: { symbol: string }) => <Link to={`/coin/${symbol}`} className="font-semibold text-white hover:text-cyan-200">{symbol}</Link>

const Analytics = () => {
  const [data, setData] = useState<Data | null>(null)
  const [early, setEarly] = useState<EarlyPump[]>([])

  useEffect(() => {
    fetchAnalytics().then(setData)
    fetchEarlyPumpAnalysis().then((result) => setEarly(result.records))
  }, [])

  if (!data) return <div className="text-slate-400">Memuat analytics...</div>

  return <div className="space-y-5">
    <header>
      <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Analytics</div>
      <h1 className="mt-2 text-2xl font-semibold">Evaluasi kualitas sinyal</h1>
    </header>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Average Alert Accuracy</div><div className="mt-2 text-3xl font-semibold">{data.averageAlertAccuracy}%</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Average Profit After Alert</div><div className="mt-2 text-3xl font-semibold">{data.averageProfitAfterAlert}%</div></div>
    </div>
    <section>
      <h2 className="font-semibold">Top Alert Winners</h2>
      <div className="mt-3 grid gap-2">{data.topAlertWinners.map((item) => <div key={item.id} className="flex justify-between rounded bg-slate-900/60 p-3 text-sm"><CoinLink symbol={item.symbol} /><span className="text-emerald-300">{item.gainLossPct}%</span></div>)}</div>
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
