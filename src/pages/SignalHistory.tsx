import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSignalHistory, fetchMissedOpportunities } from '../services/api'
import { SignalHistoryRecord } from '../types'
import SignalBadge from '../components/SignalBadge'

const n = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 4 })

const SignalHistory = () => {
  const [records, setRecords] = useState<SignalHistoryRecord[]>([])
  const [missed, setMissed] = useState<Array<{ symbol: string; gain24h: number; reason: string }>>([])
  const load = async () => { setRecords((await fetchSignalHistory()).records); setMissed((await fetchMissedOpportunities()).records) }
  useEffect(() => { load(); const timer = window.setInterval(load, 20000); return () => window.clearInterval(timer) }, [])
  return <div className="space-y-6"><header><div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Signal History</div><h1 className="mt-2 text-2xl font-semibold">Sinyal tersimpan permanen</h1><p className="mt-2 text-sm text-slate-400">Record tetap disimpan walaupun coin berubah menjadi OVERHEATED atau keluar dari scanner.</p></header><section className="overflow-x-auto rounded-md border border-white/10"><table className="min-w-[1100px] text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr>{['Time','Symbol','Price At Alert','Current Price','Gain/Loss %','Score','Signal','Telegram Sent','Status'].map((x)=><th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody>{records.map((r)=><tr key={r.id} className="border-t border-white/5"><td className="px-3 py-3">{new Date(r.timestamp).toLocaleString('id-ID')}</td><td className="px-3 py-3 font-semibold"><Link to={`/coin/${r.symbol}`} className="text-white hover:text-cyan-200">{r.symbol}</Link></td><td className="px-3 py-3">{n(r.priceAtAlert)}</td><td className="px-3 py-3">{n(r.currentPrice)}</td><td className={`px-3 py-3 ${r.gainLossPct >= 0 ? 'text-emerald-300':'text-rose-300'}`}>{r.gainLossPct}%</td><td className="px-3 py-3">{r.score}</td><td className="px-3 py-3"><SignalBadge signal={r.signal}/></td><td className="px-3 py-3">{r.telegramSent?'YES':'NO'}</td><td className="px-3 py-3">{r.status}</td></tr>)}</tbody></table>{!records.length?<div className="p-5 text-sm text-slate-400">Belum ada coin yang memenuhi syarat alert.</div>:null}</section><section><h2 className="text-lg font-semibold">Missed Opportunities</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{missed.map((item)=><div key={item.symbol} className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="flex justify-between"><Link to={`/coin/${item.symbol}`} className="font-semibold text-white hover:text-cyan-200">{item.symbol}</Link><span className="text-emerald-300">+{item.gain24h}%</span></div><div className="mt-2 text-sm text-slate-400">{item.reason}</div></div>)}</div></section></div>
}
export default SignalHistory
