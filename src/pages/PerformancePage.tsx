import { useMemo, useState } from 'react'
import { formatMoney, useAppStore } from '../store/useAppStore'
import { useCycles } from '../db/useCycles'
import { breakEven, cumulative, group, maxDrawdown, unhedgedPnl, wilson, currentStreak } from '../engine/stats'
import { EquityChart } from '../components/EquityChart'

const last = (x: number[]) => (x.length ? x[x.length - 1] : 0)
const RANGES = { today: 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000, all: Infinity } as const
export function PerformancePage() {
  const a = useAppStore(), all = useCycles()
  const [range, setRange] = useState<keyof typeof RANGES>('all'), [src, setSrc] = useState<'both' | 'sim' | 'live'>('both')
  const rows = useMemo(() => (all ?? []).filter((r) => Date.now() - new Date(r.time).getTime() <= RANGES[range] && (src === 'both' || r.source === src)), [all, range, src])
  const m = (v: number) => formatMoney(v, a.currencyUnit, a.ghcPerUsd)
  const net = rows.map((r) => r.netPnl), cum = cumulative(net), unh = cumulative(rows.map((r) => unhedgedPnl(r)))
  const bin = cumulative(rows.map((r) => (r.binaryResult === 'WIN' ? r.stake * 0.95 : -r.stake) + (r.counterResult ? (r.counterResult === 'WIN' ? r.stake * 0.95 : -r.stake) : 0)))
  const exn = cumulative(rows.map((r) => r.exnessResult - r.costs))
  const wins = rows.filter((r) => r.binaryResult === 'WIN').length, ci = wilson(wins, rows.length)
  const gw = net.filter((x) => x > 0), gl = net.filter((x) => x < 0)
  const pf = gl.length ? gw.reduce((x, y) => x + y, 0) / Math.abs(gl.reduce((x, y) => x + y, 0)) : null
  const live = (all ?? []).filter((r) => r.source === 'live').length
  const kpi = (l: string, v: string, tone = '') => <div className="kpi"><span>{l}</span><strong className={tone}>{v}</strong></div>
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  return (
    <div className="page-grid">
      <section className="panel card wide">
        <h2>Performance</h2>
        <div className="seg">{(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => <button key={r} type="button" className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}</div>
        <div className="seg">{(['both', 'sim', 'live'] as const).map((r) => <button key={r} type="button" className={src === r ? 'on' : ''} onClick={() => setSrc(r)}>{r}</button>)}</div>
        <p className={live >= 300 ? 'ok-note' : 'warn-note'}>{live >= 300 ? 'Enough live cycles logged to judge the edge.' : `Edge not proven yet: ${live}/300 live cycles logged. Simulated cycles never count, a random walk has no edge.`}</p>
        {src !== 'live' && <p className="warn-note">SIMULATED DATA: results only test the machinery.</p>}
      </section>
      <section className="panel card wide kpis">
        {kpi('Total P&L', m(last(cum)), (last(cum)) >= 0 ? 'up' : 'down')}{kpi('Return on both accounts', pct((last(cum)) / ((a.binaryBalanceUsd + a.exnessBalanceUsd) || 1)))}
        {kpi('Cycles', String(rows.length))}{kpi('Binary win rate', rows.length ? pct(wins / rows.length) : 'no data')}
        {kpi('95% interval', ci ? `${pct(ci[0])} to ${pct(ci[1])}` : 'no data')}{kpi('Expectancy / cycle', rows.length ? m((last(cum)) / rows.length) : 'no data')}
        {kpi('Max drawdown', m(maxDrawdown(cum)))}{kpi('Profit factor', pf ? pf.toFixed(2) : 'no data')}{kpi('Streak', String(currentStreak(rows)))}
        {kpi('Break-even (binary only)', pct(breakEven(0.95)))}{kpi('Costs paid', m(rows.reduce((x, r) => x + r.costs, 0)))}
      </section>
      <section className="panel card wide"><h2>Hedged vs unhedged (same signals)</h2><EquityChart series={[{ name: 'Hedged (full system)', color: 'var(--ac)', values: cum }, { name: 'Binary only', color: 'var(--warn)', values: unh }]} /></section>
      <section className="panel card"><h2>Binary account</h2><EquityChart height={140} series={[{ name: 'Binary P&L', color: 'var(--ok)', values: bin }]} /></section>
      <section className="panel card"><h2>Exness account</h2><EquityChart height={140} series={[{ name: 'Exness P&L after costs', color: 'var(--bad)', values: exn }]} /></section>
      <section className="panel card wide"><h2>P&L by pair</h2>
        {!rows.length ? <p className="empty">No cycles in this range yet.</p> : <table className="log-table"><thead><tr><th>Pair</th><th>Cycles</th><th>Win rate</th><th>Net</th></tr></thead><tbody>{group(rows, (r) => r.pair).map(([k, g]) => <tr key={k}><td>{k}</td><td>{g.n}</td><td>{pct(g.wins / g.n)}</td><td className={g.net >= 0 ? 'up' : 'down'}>{m(g.net)}</td></tr>)}</tbody></table>}</section>
    </div>
  )
}
