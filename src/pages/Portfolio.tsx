import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deletePosition, fetchPortfolio } from '../services/api'
import { PositionEvaluation } from '../types'

const number = (value: number | null, digits = 4) => value === null ? 'N/A' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const money = (value: number | null) => value === null ? 'N/A' : `${number(value, 2)} USDT`
const tone = (value: number | null) => value === null ? 'text-slate-400' : value >= 0 ? 'text-emerald-300' : 'text-rose-300'
const decisionTone = (decision: PositionEvaluation['decision']) => decision === 'PERTIMBANGKAN HOLD' ? 'border-emerald-400/40 text-emerald-300' : decision === 'TINJAU BATAS RISIKO' ? 'border-rose-400/40 text-rose-300' : 'border-amber-400/40 text-amber-300'

const Portfolio = () => {
  const [records, setRecords] = useState<PositionEvaluation[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setRecords((await fetchPortfolio()).records)
      setError('')
    } catch (err) {
      setRecords([])
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 20000)
    return () => window.clearInterval(timer)
  }, [])

  const total = useMemo(() => records.reduce((sum, item) => sum + (item.pnlUsdt || 0), 0), [records])

  return <div className="space-y-5">
    <header>
      <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Portfolio Monitor</div>
      <h1 className="mt-2 text-2xl font-semibold">Posisi Trading</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">Evaluasi memakai harga Binance terbaru dan rule teknikal. Status adalah bahan pertimbangan risiko, bukan instruksi transaksi otomatis.</p>
    </header>
    <div className="rounded-md border border-white/10 bg-slate-900/60 p-4">
      <div className="text-xs text-slate-500">Total unrealized P/L</div>
      <div className={`mt-1 text-2xl font-semibold ${tone(total)}`}>{money(total)}</div>
    </div>
    {error && <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">ERROR: {error}</div>}
    <section className="grid gap-3">
      {records.map((item) => <article key={item.id} className="rounded-md border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to={`/coin/${item.symbol}`} className="text-lg font-semibold text-white hover:text-cyan-200">{item.symbol}</Link>
            <div className="mt-1 text-xs text-slate-400">{number(item.quantity)} coin &middot; modal {money(item.totalCostUsdt)} &middot; average {number(item.averageEntryPrice, 8)}</div>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold ${decisionTone(item.decision)}`}>{item.decision}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Harga Kini</div><div className="mt-1">{number(item.currentPrice, 8)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Nilai Kini</div><div className="mt-1">{money(item.currentValueUsdt)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">P/L</div><div className={`mt-1 ${tone(item.pnlPct)}`}>{item.pnlPct === null ? 'N/A' : `${item.pnlPct > 0 ? '+' : ''}${number(item.pnlPct, 2)}%`}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">P/L USDT</div><div className={`mt-1 ${tone(item.pnlUsdt)}`}>{money(item.pnlUsdt)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Stop Teknikal</div><div className="mt-1">{number(item.technicalStopLoss, 8)}</div></div>
          <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Batas Rugi</div><div className="mt-1 text-rose-300">-{number(item.maxLossPct, 2)}%</div></div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-400">{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <div className="mt-3 flex gap-2">
          <Link to={`/coin/${item.symbol}`} className="rounded-md bg-cyan-500/15 px-3 py-2 text-xs text-cyan-200">Buka Detail</Link>
          <button type="button" onClick={async () => { await deletePosition(item.symbol); await load() }} className="rounded-md bg-rose-500/15 px-3 py-2 text-xs text-rose-200">Hapus Posisi</button>
        </div>
      </article>)}
    </section>
    {!records.length && !error && <div className="rounded-md border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Belum ada posisi. Buka detail coin untuk mencatat pembelian.</div>}
    <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Crypto sangat volatil. Tentukan batas risiko sesuai kondisi finansial Anda dan jangan mengandalkan satu indikator saja.</div>
  </div>
}

export default Portfolio
