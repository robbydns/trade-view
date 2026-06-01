import React from 'react'

type Props = {
  values: number[]
}

const LineChart: React.FC<Props> = ({ values }) => {
  const width = 300
  const height = 120
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(max - min, 1)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  })

  return (
    <svg width={width} height={height} className="rounded-3xl bg-slate-950/80 p-2">
      <path d={`M${points.join(' L')}`} className="chart-line" />
      {points.map((point, index) => {
        const [x, y] = point.split(',').map(Number)
        return <circle key={index} cx={x} cy={y} r={2.5} fill="#22c55e" />
      })}
    </svg>
  )
}

export default LineChart
