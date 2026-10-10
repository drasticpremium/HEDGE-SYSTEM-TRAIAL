import { useState } from 'react'
import { useServer } from '../store/server'
import { formatMoney, useAppStore } from '../store/useAppStore'
import { favPips } from '../engine/cycle'
import { SignalCards } from '../components/SignalHistory'
import { TradeChart, cycleLevels, cycleBox } from '../components/TradeChart'

export function ServerPage() {
  const { data, error, control } = useServer(), a = useAppStore()
  const [token, setToken] = useState(sessionStorage.adminToken ?? ''), [msg, setMsg] = useState('')
  const m = (v: number) => formatMoney(v, a.currencyUnit, a.ghcPerUsd)
  const act = async (body: object) => { sessionStorage.adminToken = token; setMsg((await control(body, token)) || 'Done') }
  if (!data) return <div className="page-grid"><section className="panel card wide"><h2>24/7 Server</h2><p className="empty">{error || 'Loading server state...'}</p></section></div>
  const pair = data.cycle?.pair ?? Object.keys(data.candles)[0] ?? 'EURUSD', c = data.cycle, ageMin = Math.round((Date.now() - data.lastTick) / 60000)
  const net = data.cycles.reduce((x, r) => x + r.netPnl, 0), wins = data.cycles.filter((r) => r.binaryResult === 'WIN').length
  const kpi = (l: string, v: string, tone = '') => <div className="kpi"><span>{l}</span><strong className={tone}>{v}</strong></div>
  return (
    <div className="page-grid">
      <section className="panel card wide">
        <div className="row-between"><h2>Auto Trader (24/7, real market data, paper money)</h2><span className={`chip ${data.enabled && !/error|Missing|failed/i.test(data.status) ? 'chip-ok' : 'chip-warn'}`}><i className="pulse" />{data.enabled ? 'Enabled' : 'Paused'}</span></div>
        <p>{data.status}</p><p>Recovery ladder: <strong>{!data.settings.recoveryOn ? 'off' : (data.ladder ?? 0) === 0 ? 'idle (next trade is a normal signal)' : (data.ladder ?? 0) === 1 ? '🔁 recovery 1 queued: next candle is traded regardless, same direction as the first trade' : '🔁 recovery 2 queued: next candle is traded regardless, same direction, with DOUBLE stake and lots'}</strong></p><p className="mut">Runs on Cloudflare every minute with your laptop off. Last check {ageMin} min ago. API credits today {data.credits.n}/800 (free plan). Paper money only, never real orders. Edge is not proven until 300 cycles.</p>
      </section>
      <section className="panel card wide"><div className="row-between"><h2>Recovery ladder (martingale)</h2>
        <button type="button" className={`btn ${data.settings.recoveryOn ? 'primary' : ''}`} onClick={async () => { if (!data.settings.recoveryOn && !confirm('Turn ON the recovery ladder?\n\nAfter a losing binary the next candle is traded regardless, in the same direction, and the third trade doubles stake and lots. This raises risk. You can switch it off any time.')) return; setMsg((await control({ action: 'ladder', on: !data.settings.recoveryOn })) || 'Done') }}>{data.settings.recoveryOn ? 'ON, press to switch off' : 'OFF, press to switch on'}</button></div>
        <p className="mut">Off by default. When on: a traded candle whose first binary loses is followed by the next candle regardless of the signal, then a third trade at double stake and lots; a third loss halts it and any win resets it. Uses your admin token.</p></section>
      <section className="panel card wide kpis">
        {kpi('Binary account', m(data.binary))}{kpi('Exness account', m(data.exness))}{kpi('Combined', m(data.binary + data.exness))}
        {kpi('Net P&L (last 400)', m(net), net >= 0 ? 'up' : 'down')}{kpi('Cycles', String(data.cycles.length))}{kpi('Binary win rate', data.cycles.length ? `${((wins / data.cycles.length) * 100).toFixed(0)}%` : 'no data')}
      </section>
      <section className="panel card wide"><h2>{pair} live chart{c ? `: open ${c.dir}, ${favPips(c, data.prices[pair]).toFixed(1)} pips in favour` : ''}</h2>
        <TradeChart candles={data.candles[pair] ?? []} levels={c ? cycleLevels(c) : []} box={c ? cycleBox(c) : null} digits={pair.endsWith('JPY') ? 3 : 5} /></section>
      <section className="panel card wide"><h2>Controls</h2>
        <p className="mut">Anyone can view this page. Changing things needs the ADMIN_TOKEN you set in Cloudflare.</p>
        <div className="button-row"><input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="button" className="btn" onClick={() => act({ action: data.enabled ? 'pause' : 'resume' })}>{data.enabled ? 'Pause' : 'Resume'}</button>
          <button type="button" className="btn" onClick={() => act({ news: !data.news })}>News nearby: {data.news ? 'ON (blocks)' : 'off'}</button>
          <button type="button" className="btn" onClick={() => { if (confirm('Reset both server accounts and history?')) void act({ action: 'reset' }) }}>Reset</button></div>
        {msg && <p>{msg}</p>}</section>
      <section className="panel card wide"><h2>Closed cycles</h2>
        {!data.cycles.length ? <p className="empty">No closed cycles yet. The server trades only inside 08:00-17:00 GMT, Mon-Fri.</p> :
          <table className="log-table"><thead><tr><th>Time (GMT)</th><th>Pair</th><th>Dir</th><th>Quotex</th><th>Exness</th><th>Net</th><th>Outcome</th></tr></thead><tbody>{data.cycles.slice(0, 30).map((r) => <tr key={r.id}><td>{r.time.slice(0, 19).replace('T', ' ')}</td><td>{r.pair}</td><td>{r.direction}</td><td className={(r.binaryPnl ?? 0) + (r.counterPnl ?? 0) >= 0 ? 'up' : 'down'}>{m((r.binaryPnl ?? 0) + (r.counterPnl ?? 0))}</td><td className={(r.exnessPnl ?? 0) >= 0 ? 'up' : 'down'}>{m(r.exnessPnl ?? 0)}</td><td className={r.netPnl >= 0 ? 'up' : 'down'}>{m(r.netPnl)}</td><td>{r.outcomeTag}</td></tr>)}</tbody></table>}</section>
      <section className="wide"><h2>Server signals</h2><SignalCards rows={data.signals} /></section>
    </div>
  )
}
