import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SignalBadge from '../components/SignalBadge'
import { fetchTwentyPercentRadar } from '../services/api'
import { TwentyPercentCandidate } from '../types'

const number = (value: number | null, digits = 2) => value === null ? 'N/A' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value)
const usd = (value: number | null) => value === null ? 'N/A' : `$${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`
const percent = (value: number) => <span className={value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-slate-300'}>{value > 0 ? '+' : ''}{number(value)}%</span>
const sentimentTone = (label: TwentyPercentCandidate['social']['sentimentLabel']) => label === 'POSITIVE' ? 'text-emerald-300' : label === 'NEGATIVE' ? 'text-rose-300' : label === 'UNAVAILABLE' ? 'text-amber-300' : 'text-slate-300'
const confidenceTone = (confidence: TwentyPercentCandidate['confidence']) => confidence === 'HIGH' ? 'border-emerald-400/40 text-emerald-300' : confidence === 'MEDIUM' ? 'border-amber-400/40 text-amber-300' : 'border-slate-400/30 text-slate-300'

const TwentyPercentRadar = () => {
  const [records, setRecords] = useState<TwentyPercentCandidate[]>([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const result = await fetchTwentyPercentRadar()
      setRecords(result.records)
      setUpdatedAt(result.updatedAt)
      setError('')
    } catch (err) {
      setRecords([])
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Technical &amp; Market Radar</div>
          <h1 className="mt-2 text-2xl font-semibold">Skenario Potensi Naik &gt;20%</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Kandidat dipilih dari momentum Binance real-time, CoinGecko Trending, DEX Screener, dan GeckoTerminal. X serta Reddit menjadi sumber sosial tambahan jika token tersedia.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">{loading ? 'Memperbarui...' : 'Refresh'}</button>
      </header>

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>Update: {updatedAt ? new Date(updatedAt).toLocaleTimeString('id-ID') : '-'}</span>
        <span>Market cache: 10 menit</span>
        <span>Jumlah kandidat: {records.length}</span>
      </div>

      {error && <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">ERROR: {error}</div>}

      <section className="grid gap-3">
        {records.map((record) => (
          <article key={record.symbol} className="rounded-md border border-white/10 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/coin/${record.symbol}`} className="text-lg font-semibold text-white hover:text-cyan-200">{record.symbol}</Link>
                  <SignalBadge signal={record.signal} />
                  <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold ${confidenceTone(record.confidence)}`}>{record.confidence} CONFIDENCE</span>
                  <span className="rounded-full border border-cyan-400/40 px-2 py-1 text-[0.65rem] font-semibold text-cyan-300">{record.market.marketTrendLabel}</span>
                </div>
                <div className="mt-2 text-sm text-slate-400">Signal score {record.score} &middot; Market score {record.market.marketTrendScore} &middot; RSI {number(record.rsi15m)} &middot; Rel Vol {number(record.relativeVolume)}x</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Skenario target teknikal</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">+{number(record.technicalTargetPct)}%</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">15m</div><div className="mt-1">{percent(record.priceChange15m)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">1h</div><div className="mt-1">{percent(record.priceChange1h)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">24h</div><div className="mt-1">{percent(record.priceChange24h)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Vol Spike</div><div className="mt-1">{percent(record.volumeSpikePct)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">X Posts 7d</div><div className="mt-1 text-slate-200">{number(record.social.xPosts7d, 0)}</div></div>
              <div className="rounded bg-white/5 p-2"><div className="text-slate-500">Trending</div><div className="mt-1 text-slate-200">{record.social.coinGeckoTrendingRank ? `#${record.social.coinGeckoTrendingRank}` : '-'}</div></div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">
                {record.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className="rounded-md border border-white/10 bg-slate-950/50 p-3 text-xs">
                <div className="text-slate-500">Sentimen Sosial Gabungan</div>
                <div className={`mt-1 font-semibold ${sentimentTone(record.social.sentimentLabel)}`}>{record.social.sentimentLabel} {record.social.sentimentScore !== null ? `(${record.social.sentimentScore})` : ''}</div>
                <div className="mt-2 text-slate-400">X: {record.social.xSentimentLabel} &middot; {number(record.social.xPosts7d, 0)} post / 7d &middot; sample {number(record.social.xRecentSampleSize, 0)}</div>
                <div className="mt-1 text-slate-400">X engagement sample: {number(record.social.xEngagement, 0)}</div>
                <div className="mt-1 text-slate-400">Reddit: {number(record.social.redditMentions24h, 0)} mention / 24h &middot; engagement {number(record.social.redditEngagement, 0)}</div>
                <div className="mt-1 text-slate-500">{record.social.sources.length ? record.social.sources.join(' + ') : 'Sumber sosial unavailable'}</div>
                {record.social.error && <div className="mt-1 max-w-xs text-amber-300">{record.social.error}</div>}
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
                <div className="font-semibold text-white">DEX Screener</div>
                <div className="mt-2 text-slate-400">Liquidity: {usd(record.market.dexScreener.liquidityUsd)}</div>
                <div className="mt-1 text-slate-400">Buy pressure 5m: {record.market.dexScreener.buyPressurePct === null ? 'N/A' : `${number(record.market.dexScreener.buyPressurePct)}%`} ({number(record.market.dexScreener.buys5m, 0)} buy / {number(record.market.dexScreener.sells5m, 0)} sell)</div>
                <div className="mt-1 text-slate-400">Volume: {usd(record.market.dexScreener.volume5mUsd)} / 5m &middot; {usd(record.market.dexScreener.volume1hUsd)} / 1h</div>
                <div className="mt-1 text-slate-500">{record.market.dexScreener.available ? `${record.market.dexScreener.chainId} &middot; ${record.market.dexScreener.dexId}` : 'Pair DEX tidak ditemukan'}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
                <div className="font-semibold text-white">GeckoTerminal Trending Pools</div>
                <div className="mt-2 text-slate-400">{record.market.geckoTerminal.trending ? `Trending #${record.market.geckoTerminal.rank}` : 'Belum masuk trending pools'}</div>
                <div className="mt-1 text-slate-400">Liquidity: {usd(record.market.geckoTerminal.liquidityUsd)}</div>
                <div className="mt-1 text-slate-400">Volume 24h: {usd(record.market.geckoTerminal.volume24hUsd)}</div>
                <div className="mt-1 text-slate-500">{record.market.sources.length ? record.market.sources.join(' + ') : 'Sumber market eksternal unavailable'}</div>
                {record.market.error && <div className="mt-1 text-amber-300">{record.market.error}</div>}
              </div>
            </div>
          </article>
        ))}
      </section>

      {!loading && !records.length && !error && <div className="rounded-md border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-400">Belum ada coin yang memenuhi skenario teknikal &gt;20% saat ini.</div>}
      <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Target &gt;20% adalah skenario teknikal agresif, bukan kepastian. Market trending, liquidity, dan buy pressure dapat berubah cepat. Gunakan manajemen risiko.</div>
    </div>
  )
}

export default TwentyPercentRadar
