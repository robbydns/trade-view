import { SignalLabel } from '../types'

const classes: Record<SignalLabel, string> = {
  'EARLY SETUP': 'border-lime-400 bg-lime-500/20 text-lime-200',
  BREAKOUT: 'border-emerald-400 bg-emerald-500/20 text-emerald-200',
  'BUY WATCH': 'border-cyan-400 bg-cyan-500/20 text-cyan-200',
  'STRONG BUY': 'border-green-300 bg-green-500/25 text-green-100',
  PULLBACK: 'border-blue-400 bg-blue-500/20 text-blue-200',
  WAIT: 'border-amber-400 bg-amber-500/20 text-amber-200',
  OVERHEATED: 'border-orange-400 bg-orange-500/20 text-orange-200',
  AVOID: 'border-rose-400 bg-rose-500/20 text-rose-200'
}

const SignalBadge = ({ signal }: { signal: SignalLabel }) => (
  <span className={`inline-flex rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${classes[signal]}`}>
    {signal}
  </span>
)

export default SignalBadge
