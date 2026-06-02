import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addWatchlist, fetchDebug, fetchScan, fetchScannerSettings, updateScannerSettings } from '../services/api'
import { DebugState, MarketTicker, ScannerSettings, ScanResponse, SignalLabel } from '../types'
import SignalBadge from '../components/SignalBadge'

const number = (value: number, digits = 2) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const price = (value: number) => value < 1 ? value.toFixed(8) : number(value, 4)
const rupiah = (value: number, idrRate: number | null | undefined) => idrRate ? `Rp${number(value * idrRate, 2)}` : 'Rp N/A'
const percent = (value: number) => <span className={value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-slate-300'}>{value > 0 ? '+' : ''}{number(value)}%</span>
const signals: Array<'ALL' | SignalLabel> = ['ALL', 'EARLY SETUP', 'STRONG BUY', 'BREAKOUT', 'BUY WATCH', 'PULLBACK', 'WAIT', 'OVERHEATED', 'AVOID']
const PAGE_SIZE = 25

const Overview = () => {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [search, setSearch] = useState('')
  const [signal, setSignal] = useState<'ALL' | SignalLabel>('ALL')
  const [minimumScore, setMinimumScore] = useState('')
  const [minimumSpike, setMinimumSpike] = useState('')
  const [minimumChange15m, setMinimumChange15m] = useState('')
  const [rsiMin, setRsiMin] = useState(0)
  const [rsiMax, setRsiMax] = useState(100)
  const [hideOverheated, setHideOverheated] = useState(false)
  const [earlyOnly, setEarlyOnly] = useState(false)
  const [sort, setSort] = useState<'score' | 'volumeSpikePct' | 'priceChange15m'>('score')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [debug, setDebug] = useState<DebugState | null>(null)
  const [settings, setSettings] = useState<ScannerSettings | null>(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      setData(await fetchScan())
      setDebug(await fetchDebug())
      if (!settings) setSettings(await fetchScannerSettings())
    } catch (error) {
      setData({ status: 'ERROR', lastUpdated: null, error: (error as Error).message, tickers: [], alertsSentToday: 0, restConnected: false, websocketConnected: false, idrRate: null, idrRateUpdatedAt: null, idrRateSource: null })
    }
  }

  const toggleSetting = async (key: keyof ScannerSettings) => {
    if (!settings) return
    const next = { ...settings, [key]: !settings[key] }
    setSettings(await updateScannerSettings(next))
  }

  const resetFilters = () => {
    setSearch('')
    setSignal('ALL')
    setMinimumScore('')
    setMinimumSpike('')
    setMinimumChange15m('')
    setRsiMin(0)
    setRsiMax(100)
    setHideOverheated(false)
    setEarlyOnly(false)
    setSort('score')
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const tickers = data?.tickers || []
    return tickers
      .filter((ticker) => ticker.symbol.includes(search.trim().toUpperCase()))
      .filter((ticker) => signal === 'ALL' || ticker.signal === signal)
      .filter((ticker) => minimumScore === '' || ticker.score >= Number(minimumScore))
      .filter((ticker) => minimumSpike === '' || ticker.volumeSpikePct >= Number(minimumSpike))
      .filter((ticker) => minimumChange15m === '' || ticker.priceChange15m >= Number(minimumChange15m))
      .filter((ticker) => ticker.rsi15m >= rsiMin && ticker.rsi15m <= rsiMax)
      .filter((ticker) => !hideOverheated || !ticker.isOverheated)
      .filter((ticker) => !earlyOnly || ticker.isEarlyPump)
      .sort((a, b) => b[sort] - a[sort])
  }, [data, earlyOnly, hideOverheated, minimumChange15m, minimumScore, minimumSpike, rsiMax, rsiMin, search, signal, sort])

  const saveWatchlist = async (ticker: MarketTicker) => {
    await addWatchlist(ticker.symbol)
    setMessage(`${ticker.symbol} ditambahkan ke watchlist.`)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [earlyOnly, hideOverheated, minimumChange15m, minimumScore, minimumSpike, rsiMax, rsiMin, search, signal, sort])

  return (
    <div className="space-y-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">Binance USDT Real-Time Scanner</div>
            <h1 className="mt-2 text-2xl font-semibold text-white">Early Pump Radar</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Semua harga, candle, volume, indikator, dan sinyal dihitung dari Binance. Label EARLY SETUP mencari rebound awal setelah pullback sebelum candle hijau memanjang.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <span className={`rounded-full border px-3 py-1 ${data?.status === 'CONNECTED' ? 'border-emerald-400/50 text-emerald-300' : data?.status === 'ERROR' ? 'border-rose-400/50 text-rose-300' : 'border-amber-400/50 text-amber-300'}`}>{data?.status || 'DISCONNECTED'}</span>
            <span className={`rounded-full border px-3 py-1 ${data?.restConnected ? 'border-emerald-400/50 text-emerald-300' : 'border-rose-400/50 text-rose-300'}`}>REST {data?.restConnected ? 'CONNECTED' : 'ERROR'}</span>
            <span className={`rounded-full border px-3 py-1 ${data?.websocketConnected ? 'border-emerald-400/50 text-emerald-300' : 'border-amber-400/50 text-amber-300'}`}>WS {data?.websocketConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
            <span className="text-slate-400">Update: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString('id-ID') : '-'}</span>
            <span className="text-slate-400">USDT/IDR: {data?.idrRate ? `Rp${number(data.idrRate)}` : 'N/A'} {data?.idrRateSource ? `(${data.idrRateSource})` : ''}</span>
            <button onClick={load} className="w-full rounded-md bg-cyan-500 px-3 py-2 font-semibold text-slate-950 sm:w-auto">Refresh</button>
          </div>
        </div>
      </section>

      {data?.status === 'ERROR' ? <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">ERROR: {data.error || 'Binance API gagal. Tabel dikosongkan.'}</div> : null}
      {message ? <div className="rounded-md border border-cyan-400/20 bg-cyan-500/10 p-3 text-sm text-cyan-200">{message}</div> : null}

      <section className="grid gap-3 border-b border-white/10 pb-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-300"><div className="font-semibold text-white">Debug Panel</div><div className="mt-2 space-y-1"><div>Last Scan: {debug?.lastScanTime ? new Date(debug.lastScanTime).toLocaleTimeString('id-ID') : '-'}</div><div>Coins Scanned: {debug?.coinsScanned || 0}</div><div>Coins Qualified: {debug?.coinsQualified || 0}</div><div>Alerts Sent Today: {debug?.alertsSentToday || 0}</div></div></div>
        <div className="rounded-md border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-300"><div className="font-semibold text-white">Last Alert</div><div className="mt-2 space-y-1"><div>Coin: {debug?.lastAlertCoin ? <Link to={`/coin/${debug.lastAlertCoin}`} className="font-semibold text-white hover:text-cyan-200">{debug.lastAlertCoin}</Link> : '-'}</div><div>Time: {debug?.lastAlertTime ? new Date(debug.lastAlertTime).toLocaleTimeString('id-ID') : '-'}</div><div className="break-words">Response: {debug?.lastTelegramResponse || '-'}</div><div className="break-words text-rose-300">Error: {debug?.lastTelegramError || '-'}</div></div></div>
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/60 p-3 text-sm"><input type="checkbox" checked={settings?.includeNewListings || false} onChange={() => toggleSetting('includeNewListings')} /> Include New Listings</label>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/60 p-3 text-sm"><input type="checkbox" checked={settings?.includeLowMarketCapCoins || false} onChange={() => toggleSetting('includeLowMarketCapCoins')} /> Include Low Market Cap Coins</label>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/60 p-3 text-sm"><input type="checkbox" checked={settings?.includeMemeCoins || false} onChange={() => toggleSetting('includeMemeCoins')} /> Include Meme Coins</label>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 border-b border-white/10 pb-5 md:grid-cols-4 xl:grid-cols-8">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari pair USDT" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <select value={signal} onChange={(event) => setSignal(event.target.value as 'ALL' | SignalLabel)} className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm">{signals.map((item) => <option key={item}>{item}</option>)}</select>
        <input type="number" value={minimumScore} onChange={(event) => setMinimumScore(event.target.value)} placeholder="Min score (opsional)" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input type="number" value={minimumChange15m} onChange={(event) => setMinimumChange15m(event.target.value)} placeholder="Min 15m % (opsional)" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input type="number" value={minimumSpike} onChange={(event) => setMinimumSpike(event.target.value)} placeholder="Min spike % (opsional)" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input type="number" value={rsiMin} onChange={(event) => setRsiMin(Number(event.target.value))} placeholder="RSI min" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input type="number" value={rsiMax} onChange={(event) => setRsiMax(Number(event.target.value))} placeholder="RSI max" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm"><option value="score">Sort score</option><option value="volumeSpikePct">Sort spike</option><option value="priceChange15m">Sort 15m</option></select>
        <label className="flex items-center gap-2 text-xs text-slate-300 sm:text-sm"><input type="checkbox" checked={hideOverheated} onChange={(event) => setHideOverheated(event.target.checked)} /> Hide overheated</label>
        <label className="flex items-center gap-2 text-xs text-slate-300 sm:text-sm"><input type="checkbox" checked={earlyOnly} onChange={(event) => setEarlyOnly(event.target.checked)} /> Early pump only</label>
        <button type="button" onClick={resetFilters} className="rounded-md border border-cyan-400/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10">Reset Filter</button>
      </section>

      <section className="overflow-x-auto rounded-md border border-white/10 bg-slate-900/60">
        <div className="flex flex-col gap-1 border-b border-white/10 px-3 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Menampilkan {filtered.length} dari {data?.tickers.length || 0} pair USDT aktif</span>
          <span>{hideOverheated ? 'Overheated disembunyikan' : 'Overheated ditampilkan'}</span>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {paginated.map((ticker, index) => <article key={ticker.symbol} className="rounded-md border border-white/10 bg-slate-950/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.65rem] text-slate-500">#{(currentPage - 1) * PAGE_SIZE + index + 1}</div>
                <Link to={`/coin/${ticker.symbol}`} className="mt-1 block text-lg font-semibold text-white hover:text-cyan-200">{ticker.symbol}</Link>
                <div className="mt-1 text-sm text-slate-200">{price(ticker.price)} USDT</div>
                <div className="text-xs text-slate-500">{rupiah(ticker.price, data?.idrRate)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <SignalBadge signal={ticker.signal} />
                <span className="text-xl font-semibold text-white">{ticker.score}<span className="text-xs text-slate-500">/100</span></span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">15m</div><div className="mt-1">{percent(ticker.priceChange15m)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">24h</div><div className="mt-1">{percent(ticker.priceChange24h)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">RSI</div><div className="mt-1 text-slate-200">{number(ticker.rsi15m)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Spike</div><div className="mt-1">{percent(ticker.volumeSpikePct)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Rel Vol</div><div className="mt-1 text-slate-200">{number(ticker.relativeVolume)}x</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Upside</div><div className="mt-1 text-emerald-300">+{number(ticker.estimatedUpsideHighPct)}%</div></div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <button onClick={() => navigate(`/coin/${ticker.symbol}`)} className="rounded-md bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-slate-950">Buka Detail</button>
              <button onClick={() => saveWatchlist(ticker)} title="Tambahkan ke watchlist" className="rounded-md border border-white/10 px-4 py-2.5 text-lg text-cyan-200">+</button>
            </div>
          </article>)}
        </div>
        <table className="hidden min-w-[2400px] text-left text-xs text-slate-300 md:table">
          <thead className="bg-slate-950 text-slate-400"><tr>
            {['Rank', 'Symbol', 'Last Price', '5m', '15m', '1h', '24h', 'Vol 15m', 'Vol 1h', 'Vol 24h', 'Spike', 'Rel Vol', 'RSI 15m', 'MA10', 'MA30', 'Dist MA10', 'S1', 'S2', 'R1', 'R2', 'Est. Upside', 'Score', 'Signal', 'Action'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody>
            {paginated.map((ticker, index) => <tr key={ticker.symbol} className="border-t border-white/5 hover:bg-white/5">
              <td className="px-3 py-3">{(currentPage - 1) * PAGE_SIZE + index + 1}</td><td className="px-3 py-3 font-semibold"><Link to={`/coin/${ticker.symbol}`} className="text-white hover:text-cyan-200">{ticker.symbol}</Link></td><td className="px-3 py-3"><div>{price(ticker.price)} USDT</div><div className="mt-1 text-[0.65rem] text-slate-500">{rupiah(ticker.price, data?.idrRate)}</div></td>
              <td className="px-3 py-3">{percent(ticker.priceChange5m)}</td><td className="px-3 py-3">{percent(ticker.priceChange15m)}</td><td className="px-3 py-3">{percent(ticker.priceChange1h)}</td><td className="px-3 py-3">{percent(ticker.priceChange24h)}</td>
              <td className="px-3 py-3">{number(ticker.volume15m)}</td><td className="px-3 py-3">{number(ticker.volume1h)}</td><td className="px-3 py-3">{number(ticker.volume24h)}</td>
              <td className="px-3 py-3">{percent(ticker.volumeSpikePct)}</td><td className="px-3 py-3">{number(ticker.relativeVolume)}x</td><td className="px-3 py-3">{number(ticker.rsi15m)}</td>
              <td className="px-3 py-3">{price(ticker.ma10)}</td><td className="px-3 py-3">{price(ticker.ma30)}</td><td className="px-3 py-3">{percent(ticker.distanceFromMa10Pct)}</td>
              <td className="px-3 py-3">{price(ticker.support1)}</td><td className="px-3 py-3">{price(ticker.support2)}</td><td className="px-3 py-3">{price(ticker.resistance1)}</td><td className="px-3 py-3">{price(ticker.resistance2)}</td>
              <td className="px-3 py-3 text-emerald-300">+{number(ticker.estimatedUpsideLowPct)}% - +{number(ticker.estimatedUpsideHighPct)}%</td>
              <td className="px-3 py-3 font-semibold text-white">{ticker.score}</td><td className="px-3 py-3"><SignalBadge signal={ticker.signal} /></td>
              <td className="px-3 py-3"><div className="flex gap-2"><button onClick={() => navigate(`/coin/${ticker.symbol}`)} className="rounded bg-cyan-500/15 px-2 py-1 text-cyan-200">Detail</button><button onClick={() => saveWatchlist(ticker)} className="rounded bg-white/10 px-2 py-1">+</button></div></td>
            </tr>)}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-8 text-center text-slate-400">Tidak ada data yang cocok. Jika Binance gagal, tabel sengaja tetap kosong.</div> : null}
        {filtered.length ? <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Halaman {currentPage} dari {totalPages} · 25 coin per halaman</span>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded-md border border-white/10 px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => <button type="button" key={item} onClick={() => setPage(item)} className={`rounded-md px-3 py-1.5 ${item === currentPage ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 hover:bg-white/5'}`}>{item}</button>)}
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="rounded-md border border-white/10 px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        </div> : null}
      </section>

      <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Sinyal ini hanya alat bantu analisis, bukan nasihat finansial. Crypto sangat berisiko. Gunakan manajemen risiko.</div>
    </div>
  )
}

export default Overview
