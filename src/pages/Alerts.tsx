import { useEffect, useState } from 'react'
import { fetchTelegramSettings, testTelegram, updateTelegramSettings } from '../services/api'

const Alerts = () => {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [hasBotToken, setHasBotToken] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchTelegramSettings().then((settings) => {
      setChatId(settings.chatId)
      setEnabled(settings.enabled)
      setHasBotToken(Boolean(settings.hasBotToken))
    })
  }, [])

  const save = async () => {
    try {
      const settings = await updateTelegramSettings({ botToken, chatId, enabled })
      setHasBotToken(Boolean(settings.hasBotToken))
      setChatId(settings.chatId)
      setBotToken('')
      setMessage('Pengaturan Telegram tersimpan di server.')
    } catch (error) {
      setMessage(`ERROR: ${(error as Error).message}`)
    }
  }

  const test = async () => {
    try {
      await testTelegram()
      setMessage('Pesan tes berhasil dikirim.')
    } catch (error) {
      setMessage(`ERROR: ${(error as Error).message}`)
    }
  }

  return <div className="max-w-3xl space-y-5">
    <div><div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Telegram Settings</div><h1 className="mt-2 text-2xl font-semibold">Alert sinyal real-time</h1><p className="mt-2 text-sm text-slate-400">Server mengirim alert jika score minimal 80, signal BREAKOUT atau BUY WATCH, dan coin belum dikirim dalam 30 menit terakhir.</p></div>
    <section className="space-y-4 rounded-md border border-white/10 bg-slate-900/60 p-5">
      <label className="block text-sm text-slate-300">Telegram Bot Token<input value={botToken} onChange={(event) => setBotToken(event.target.value)} type="password" placeholder={hasBotToken ? 'Token sudah tersimpan, isi hanya untuk mengganti' : 'Masukkan bot token'} className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2" /></label>
      <label className="block text-sm text-slate-300">Telegram Chat ID<input value={chatId} onChange={(event) => setChatId(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2" /></label>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable alert otomatis</label>
      <div className="flex gap-3"><button onClick={save} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Simpan</button><button onClick={test} className="rounded-md border border-white/10 px-4 py-2 text-sm">Test Send Message</button></div>
      {message ? <div className="rounded bg-white/5 p-3 text-sm text-slate-300">{message}</div> : null}
    </section>
  </div>
}

export default Alerts
