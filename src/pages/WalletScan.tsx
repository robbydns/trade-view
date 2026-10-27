import { useEffect, useMemo, useState } from 'react'
import { fetchOnchainDashboard, fetchScan } from '../services/api'
import { OnchainDashboard } from '../types'

const usd = (value: number | null | undefined) => value === null || value === undefined ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const shortAddress = (address: string) => address.length > 18 ? `${address.slice(0, 9)}…${address.slice(-6)}` : address
const time = (timestamp: number | null) => timestamp ? new Date(timestamp).toLocaleString('id-ID') : '—'
const statusTone = (state: OnchainDashboard['status']['state']) => state === 'CONNECTED' ? 'text-emerald-300' : state === 'ERROR' ? 'text-rose-300' : state === 'CONNECTING' ? 'text-amber-300' : 'text-slate-400'

const WalletScan = () => {
  const [data, setData] = useState<OnchainDashboard | null>(null)
  const [idrRate, setIdrRate] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [chain, setChain] = useState('ALL')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [result, scan] = await Promise.all([fetchOnchainDashboard(), fetchScan()])
        if (active) { setData(result); setIdrRate(scan.idrRate); setError('') }
      } catch (requestError) {
        if (active) setError((requestError as Error).message)
      }
    }
    void load()
    const timer = window.setInterval(load, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const summaries = useMemo(() => (data?.summaries || [])
    .filter((item) => chain === 'ALL' || item.chain.toLowerCase() === chain.toLowerCase())
    .filter((item) => !search || `${item.tokenSymbol || ''} ${item.tokenAddress} ${item.chain}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.score || 0) - (a.score || 0)), [chain, data, search])
  const trades = useMemo(() => (data?.recentTrades || [])
    .filter((item) => chain === 'ALL' || item.chain.toLowerCase() === chain.toLowerCase())
    .filter((item) => !search || `${item.tokenSymbol || ''} ${item.tokenAddress} ${item.traderAddress || ''}`.toLowerCase().includes(search.toLowerCase())), [chain, data, search])

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">On-chain DEX trades · Bitquery</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Wallet & whale flow monitor</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Swap terdekode dari DEX, bukan transfer token biasa. Skor menunjukkan aktivitas yang teramati—bukan probabilitas harga naik dan bukan rekomendasi beli. Alamat wallet tidak mengungkap identitas pemilik.</p>
      </div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 px-4 py-3 text-sm">
        <div className="text-slate-400">Provider status</div>
        <div className={`mt-1 font-semibold ${statusTone(data?.status.state || 'NOT_CONFIGURED')}`}>{data?.status.state || 'LOADING'}</div>
        <div className="mt-1 text-xs text-slate-500">Subscription aktif: {data?.status.subscriptionCount || 0} · Chains: {data?.status.chains.join(', ') || '—'}</div>
      </div>
    </header>

    {error && <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">API error: {error}</div>}
    {data?.status.lastError && <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{data.status.lastError}</div>}
    {data && !data.status.enabled && <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">On-chain monitoring belum aktif. Set ONCHAIN_ENABLED=true dan BITQUERY_API_KEY di konfigurasi backend lokal. Fitur tetap nonaktif secara default; verifikasi kuota/akses stream Bitquery untuk akun Anda sebelum mengaktifkannya.</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Token terpantau</div><div className="mt-2 text-3xl font-semibold text-white">{data?.summaries.length ?? '—'}</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Inflow 15m (observed)</div><div className="mt-2 text-2xl font-semibold text-emerald-300">{usd(summaries.reduce((sum, item) => sum + item.windows['15m'].buyUsd, 0))}</div><div className="mt-1 text-xs text-slate-500">{idrRate ? `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(summaries.reduce((sum, item) => sum + item.windows['15m'].buyUsd, 0) * idrRate)}` : 'Rp N/A'}</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Net flow 15m</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{usd(summaries.reduce((sum, item) => sum + item.windows['15m'].netBuyUsd, 0))}</div><div className="mt-1 text-xs text-slate-500">{idrRate ? `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(summaries.reduce((sum, item) => sum + item.windows['15m'].netBuyUsd, 0) * idrRate)}` : 'Rp N/A'}</div></div>
      <div className="rounded-md border border-white/10 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">Trade terakhir</div><div className="mt-2 text-sm font-semibold text-white">{time(data?.status.lastMessageAt || null)}</div><div className="mt-1 text-xs text-slate-500">Stream message time</div></div>
    </section>

    <section className="grid gap-3 md:grid-cols-[1fr_220px]">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari token, contract, wallet" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
      <select value={chain} onChange={(event) => setChain(event.target.value)} className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"><option value="ALL">Semua jaringan</option>{(data?.status.chains || []).map((item) => <option key={item} value={item.toLowerCase().replace(/\s+/g, '-')}>{item}</option>)}</select>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-white">Token flow summaries</h2><span className="text-xs text-slate-500">Rolling windows · 1m / 5m / 15m</span></div>
      <div className="grid gap-3">
        {summaries.map((item) => <article key={item.tokenKey} className="rounded-md border border-white/10 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold text-white">{item.tokenSymbol || 'Unknown token'}</span><span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-xs text-cyan-200">{item.chain}</span><span className={`rounded-full border border-white/10 px-2 py-0.5 text-xs ${item.confidence === 'HIGH' ? 'text-emerald-300' : item.confidence === 'INCOMPLETE' ? 'text-amber-300' : 'text-slate-300'}`}>{item.confidence}</span>{item.labels.map((label) => <span key={label} className="rounded-full bg-white/5 px-2 py-0.5 text-[0.65rem] text-slate-300">{label}</span>)}</div><div className="mt-2 break-all font-mono text-xs text-slate-500">{item.tokenAddress}</div></div>
            <div className="text-right"><div className="text-xs text-slate-500">On-chain score</div><div className="mt-1 text-2xl font-semibold text-cyan-200">{item.score ?? '—'}<span className="text-sm text-slate-500">/100</span></div></div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(['1m', '5m', '15m'] as const).map((window) => <div key={window} className="rounded bg-slate-950/80 p-3 text-xs"><div className="font-semibold text-white">{window}</div><div className="mt-2 flex justify-between text-slate-400"><span>Buy / sell</span><span>{usd(item.windows[window].buyUsd)} / {usd(item.windows[window].sellUsd)}</span></div><div className="mt-1 text-right text-[0.65rem] text-slate-500">Buy {idrRate ? `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(item.windows[window].buyUsd * idrRate)}` : 'Rp N/A'} · Sell {idrRate ? `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(item.windows[window].sellUsd * idrRate)}` : 'Rp N/A'}</div><div className="mt-1 flex justify-between text-slate-400"><span>Net flow</span><span className={item.windows[window].netBuyUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{usd(item.windows[window].netBuyUsd)}</span></div><div className="mt-1 text-right text-[0.65rem] text-slate-500">{idrRate ? `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(item.windows[window].netBuyUsd * idrRate)}` : 'Rp N/A'}</div><div className="mt-1 flex justify-between text-slate-400"><span>Buyers / large buys</span><span>{item.windows[window].uniqueBuyers} / {item.windows[window].largeBuys}</span></div></div>)}
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3"><div>Repeated observed buyers: {item.repeatedBuyerCount}</div><div>Largest trade (15m): {usd(item.windows['15m'].largestTradeUsd)}</div><div>Freshness: {item.dataFreshnessSeconds === null ? '—' : `${item.dataFreshnessSeconds}s`}</div></div>
          {item.reasons.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-400">{item.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}
        </article>)}
        {!summaries.length && <div className="rounded-md border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Belum ada data real-time untuk filter ini. Tidak ada data contoh yang ditampilkan.</div>}
      </div>
    </section>

    <section className="overflow-x-auto rounded-md border border-white/10 bg-slate-900/60">
      <div className="border-b border-white/10 p-3"><h2 className="font-semibold text-white">Recent decoded DEX swaps</h2><p className="mt-1 text-xs text-slate-500">Provider Trading.Trades feed. Link transaksi tidak dibuat karena format hash berbeda antar-chain.</p></div>
      <table className="w-full min-w-[900px] text-left text-xs text-slate-300"><thead className="bg-slate-950 text-slate-500"><tr>{['Time', 'Chain', 'Token', 'Side', 'USD quote', 'Trader', 'Transaction'].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>
        {trades.map((item, index) => <tr key={`${item.chain}:${item.transactionHash}:${item.tokenId}:${index}`} className="border-t border-white/5"><td className="whitespace-nowrap px-3 py-3">{time(item.timestamp)}</td><td className="px-3 py-3">{item.chain}</td><td className="px-3 py-3">{item.tokenSymbol || shortAddress(item.tokenAddress)}</td><td className={`px-3 py-3 uppercase ${item.side === 'buy' ? 'text-emerald-300' : item.side === 'sell' ? 'text-rose-300' : 'text-slate-400'}`}>{item.side}</td><td className="px-3 py-3"><div>{usd(item.usdValue)}</div><div className="mt-1 text-[0.65rem] text-slate-500">{item.usdValue === null || !idrRate ? 'Rp N/A' : `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(item.usdValue * idrRate)}`}</div></td><td className="px-3 py-3 font-mono">{item.traderAddress ? shortAddress(item.traderAddress) : '—'}</td><td className="px-3 py-3 font-mono">{shortAddress(item.transactionHash)}</td></tr>)}
      </tbody></table>
      {!trades.length && <div className="p-5 text-sm text-slate-400">Belum ada swap terdekode yang tersedia.</div>}
    </section>

    <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">On-chain score menjelaskan aktivitas swap yang teramati, bukan peluang/probabilitas kenaikan. Token tanpa harga USD, data usang, dan data tidak lengkap ditandai atau tidak diberi skor. Beberapa wallet tidak otomatis berarti investor independen.</div>
  </div>
}

export default WalletScan
