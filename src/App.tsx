import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Analytics from './pages/Analytics'
import Alerts from './pages/Alerts'
import CoinDetail from './pages/CoinDetail'
import Education from './pages/Education'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Portfolio from './pages/Portfolio'
import SignalHistory from './pages/SignalHistory'
import TelegramLog from './pages/TelegramLog'
import TwentyPercentRadar from './pages/TwentyPercentRadar'
import Watchlist from './pages/Watchlist'
import { clearAuthToken, fetchSession, getAuthToken } from './services/api'

const links = [['Scanner', '/'], ['20% Radar', '/twenty-percent-radar'], ['Portfolio', '/portfolio'], ['Signal History', '/signal-history'], ['Telegram Log', '/telegram-log'], ['Analytics', '/analytics'], ['Watchlist', '/watchlist'], ['Telegram', '/telegram'], ['Edukasi', '/education']]

const App = () => {
  const [authenticated, setAuthenticated] = useState(Boolean(getAuthToken()))
  const [checkingSession, setCheckingSession] = useState(Boolean(getAuthToken()))

  useEffect(() => {
    const logout = () => setAuthenticated(false)
    window.addEventListener('auth:logout', logout)
    if (getAuthToken()) {
      fetchSession()
        .then(() => setAuthenticated(true))
        .catch(() => setAuthenticated(false))
        .finally(() => setCheckingSession(false))
    }
    return () => window.removeEventListener('auth:logout', logout)
  }, [])

  const logout = () => {
    clearAuthToken()
    setAuthenticated(false)
  }

  if (checkingSession) return <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">Memeriksa sesi...</div>
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/95">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold text-cyan-300">Crypto Signal Compass</div>
            <div className="text-xs text-slate-500">Binance real-time only</div>
          </div>
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
            <nav className="flex gap-2">
              {links.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>{label}</NavLink>)}
            </nav>
            <button type="button" onClick={logout} className="whitespace-nowrap rounded-md border border-rose-400/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10">Logout</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-5">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/coin/:symbol" element={<CoinDetail />} />
          <Route path="/signal-history" element={<SignalHistory />} />
          <Route path="/telegram-log" element={<TelegramLog />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/twenty-percent-radar" element={<TwentyPercentRadar />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/telegram" element={<Alerts />} />
          <Route path="/education" element={<Education />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
