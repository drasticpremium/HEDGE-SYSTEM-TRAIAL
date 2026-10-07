export interface Series { name: string; color: string; values: number[] }
export function EquityChart({ series, height = 200 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.values).concat(0)
  if (series.every((s) => s.values.length < 2)) return <div className="empty">Not enough closed cycles yet. The auto trader adds a point after every settled cycle.</div>
  const min = Math.min(...all), max = Math.max(...all), rng = max - min || 1, W = 600
  const y = (v: number) => height - 8 - ((v - min) / rng) * (height - 16)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="equity-svg" preserveAspectRatio="none" role="img" aria-label="Equity curve">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--bd)" strokeDasharray="4 4" />
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" points={s.values.map((v, i) => `${(i / Math.max(s.values.length - 1, 1)) * W},${y(v)}`).join(' ')} />)}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}: {s.values.length ? s.values[s.values.length - 1].toFixed(2) : '0.00'}</span>)}</div>
    </div>
  )
}
