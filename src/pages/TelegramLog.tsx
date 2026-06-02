import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTelegramLogs, testTelegram } from '../services/api'
import { TelegramLogRecord } from '../types'

const TelegramLog = () => {
  const [records,setRecords]=useState<TelegramLogRecord[]>([])
  const [message,setMessage]=useState('')
  const load=async()=>setRecords((await fetchTelegramLogs()).records)
  useEffect(()=>{load()},[])
  const test=async()=>{try{await testTelegram();setMessage('Test alert berhasil.')}catch(error){setMessage(`ERROR: ${(error as Error).message}`)}finally{await load()}}
  return <div className="space-y-5"><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Telegram Log</div><h1 className="mt-2 text-2xl font-semibold">Riwayat pengiriman alert</h1></div><button onClick={test} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">TEST ALERT</button></header>{message?<div className="rounded bg-white/5 p-3 text-sm">{message}</div>:null}<section className="overflow-x-auto rounded-md border border-white/10"><table className="min-w-[900px] text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr>{['Time','Coin','Score','Signal','Telegram Status','Telegram Response'].map(x=><th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id} className="border-t border-white/5"><td className="px-3 py-3">{new Date(r.timestamp).toLocaleString('id-ID')}</td><td className="px-3 py-3">{r.symbol === 'TEST' ? 'TEST' : <Link to={`/coin/${r.symbol}`} className="font-semibold text-white hover:text-cyan-200">{r.symbol}</Link>}</td><td className="px-3 py-3">{r.score}</td><td className="px-3 py-3">{r.signal}</td><td className="px-3 py-3">{r.status}</td><td className="max-w-lg px-3 py-3 text-slate-400">{r.response}</td></tr>)}</tbody></table>{!records.length?<div className="p-5 text-sm text-slate-400">Belum ada Telegram log.</div>:null}</section></div>
}
export default TelegramLog
