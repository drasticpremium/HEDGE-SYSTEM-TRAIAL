import { Link } from 'react-router-dom'
import { formatMoney, useAppStore } from '../store/useAppStore'
import { useServer } from '../store/server'
import { useCycles } from '../db/useCycles'
import { cumulative, currentStreak } from '../engine/stats'
import { EquityChart } from '../components/EquityChart'
import { pipSize } from '../engine/pairs'

export function OverviewPage() {
  const a = useAppStore(), srv = useServer((x) => x.data), rows = useCycles() ?? []
  const t = { running: !!srv?.enabled, status: srv?.status ?? 'Connecting to the server...', cycle: srv?.cycle ?? null, watchlist: Object.keys(srv?.prices ?? {}), prices: srv?.prices ?? {} }
  const m = (v: number) => formatMoney(v, a.currencyUnit, a.ghcPerUsd)
  const total = rows.reduce((x, r) => x + r.netPnl, 0), wins = rows.filter((r) => r.netPnl > 0).length
  const today = rows.filter((r) => Date.now() - new Date(r.time).getTime() < 86400000).reduce((x, r) => x + r.netPnl, 0)
  const equity = (srv?.binary ?? 0) + (srv?.exness ?? 0)
  const kpi = (label: string, value: string, tone = '') => <div className="kpi"><span>{label}</span><strong className={tone}>{value}</strong></div>
  return (
    <div className="page-grid">
      <section className="hero wide">
        <div>
          <h1>Trade the hedge. Prove it with data.</h1>
          <p>Your paper account runs a Quotex binary and an opposite Exness hedge on every clean signal, and logs each cycle so the edge is measured, not guessed.</p>
          <div className="button-row"><Link className="btn primary" to="/desk">Open Live Desk</Link><Link className="btn" to="/auto">Watch auto trader</Link><Link className="btn" to="/log">View trade log</Link></div>
        </div>
        <svg viewBox="0 0 220 140" className="hero-art" aria-hidden="true">
          {[20, 52, 84, 116, 148, 180].map((x, i) => { const up = i % 2 === 0, h = 30 + ((i * 17) % 40), y = 90 - h / 2 - (i * 4) % 20; return <g key={x}><line x1={x + 8} x2={x + 8} y1={y - 12} y2={y + h + 12} stroke="var(--mut)" /><rect x={x} y={y} width="16" height={h} rx="3" fill={up ? 'var(--ok)' : 'var(--bad)'} /></g> })}
          <path d="M10 112 Q70 30 110 70 T210 24" fill="none" stroke="var(--ac)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </section>
      <section className="panel card wide kpis">
        {kpi('Combined balance', m(equity))}{kpi('Binary account', m((srv?.binary ?? 0)))}{kpi('Exness account', m((srv?.exness ?? 0)))}
        {kpi('Total P&L', m(total), total >= 0 ? 'up' : 'down')}{kpi('Last 24h', m(today), today >= 0 ? 'up' : 'down')}
        {kpi('Cycles', String(rows.length))}{kpi('Win rate (net)', rows.length ? `${((wins / rows.length) * 100).toFixed(0)}%` : 'no data')}{kpi('Streak', rows.length ? String(currentStreak(rows)) : '0')}
      </section>
      <section className="panel card wide"><h2>Equity curve (net P&L, USD)</h2><EquityChart series={[{ name: 'Net', color: 'var(--ac)', values: cumulative(rows.map((r) => r.netPnl)) }]} /></section>
      <section className="panel card"><h2>Auto trader</h2><p><strong>{t.running ? 'Running' : 'Paused'}</strong>. {t.status}</p>
        <p>{t.cycle ? `Open: ${t.cycle.pair} ${t.cycle.dir}, entry ${t.cycle.entry.toFixed(5)}` : 'No open cycle.'}</p><p className="mut">Real market data, paper money. Edge is not proven until 300 cycles are logged.</p></section>
      <section className="panel card"><h2>Live prices</h2><table className="log-table"><tbody>{t.watchlist.map((p) => <tr key={p}><td>{p}</td><td>{t.prices[p]?.toFixed(pipSize(p) === 0.01 ? 3 : 5) ?? '...'}</td></tr>)}</tbody></table></section>
    </div>
  )
}
