import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addWatchlist, fetchScan, fetchWatchlist, removeWatchlist } from '../services/api'
import { MarketTicker } from '../types'
import SignalBadge from '../components/SignalBadge'

const Watchlist = () => {
  const [symbols, setSymbols] = useState<string[]>([])
  const [tickers, setTickers] = useState<MarketTicker[]>([])
  const [input, setInput] = useState('')

  const load = async () => {
    const [watchlist, scan] = await Promise.all([fetchWatchlist(), fetchScan()])
    setSymbols(watchlist.symbols)
    setTickers(scan.tickers)
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(
    () => symbols.map((symbol) => tickers.find((ticker) => ticker.symbol === symbol)).filter((ticker): ticker is MarketTicker => Boolean(ticker)),
    [symbols, tickers]
  )

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Watchlist</div>
        <h1 className="mt-2 text-2xl font-semibold">Pair USDT pilihan</h1>
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Contoh: BTCUSDT" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <button onClick={async () => { setSymbols((await addWatchlist(input)).symbols); setInput('') }} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Tambah</button>
      </div>
      <div className="grid gap-3">
        {rows.map((ticker) => (
          <div key={ticker.symbol} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-900/60 p-4">
            <Link to={`/coin/${ticker.symbol}`} className="min-w-0 flex-1 rounded-sm hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/60">
              <div className="font-semibold text-white">{ticker.symbol}</div>
              <div className="mt-1 text-sm text-slate-400">Score {ticker.score} &middot; 15m {ticker.priceChange15m}% &middot; spike {ticker.volumeSpikePct}%</div>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <SignalBadge signal={ticker.signal} />
              <button onClick={async () => setSymbols((await removeWatchlist(ticker.symbol)).symbols)} className="rounded bg-rose-500/15 px-2 py-1 text-sm text-rose-200">Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Watchlist
