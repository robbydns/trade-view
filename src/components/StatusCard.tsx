import React from 'react'

type Props = {
  title: string
  value: string | number
  description: string
  accent?: 'green' | 'yellow' | 'red' | 'cyan'
}

const accentClasses = {
  green: 'from-emerald-500 to-slate-900',
  yellow: 'from-amber-500 to-slate-900',
  red: 'from-rose-500 to-slate-900',
  cyan: 'from-cyan-500 to-slate-900'
}

const StatusCard: React.FC<Props> = ({ title, value, description, accent = 'cyan' }) => {
  return (
    <div className={`rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-glow backdrop-blur-xl ring-1 ring-white/10`}>
      <div className={`mb-3 inline-flex rounded-full bg-gradient-to-r ${accentClasses[accent]} px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950`}>{title}</div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{description}</div>
    </div>
  )
}

export default StatusCard
