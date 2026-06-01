import { FormEvent, useState } from 'react'
import { login, setAuthToken } from '../services/api'

const Login = ({ onLogin }: { onLogin: () => void }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await login(email.trim(), password)
      setAuthToken(result.token)
      onLogin()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-sm rounded-md border border-white/10 bg-slate-900/70 p-5 shadow-xl">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Crypto Signal Compass</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Login Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">Masuk untuk membuka scanner dan pengaturan alert.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm text-slate-300">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" />
          </label>
          {error && <div className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-md bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{loading ? 'Memeriksa...' : 'Login'}</button>
        </form>
      </section>
    </main>
  )
}

export default Login
