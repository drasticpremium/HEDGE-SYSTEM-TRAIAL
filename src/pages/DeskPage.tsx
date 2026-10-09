import { useEffect, useState } from 'react'
import { useServer } from '../store/server'
import { TradeChart } from '../components/TradeChart'
import { SignalCards } from '../components/SignalHistory'
import { Pill } from '../components/Pill'
import { AdminToken } from '../components/AdminToken'
import { winProbability } from '../engine/math'
import { pipSize, pipValuePerLot } from '../engine/pairs'
import { isTradingSession } from '../engine/serverCore'

const hms = (t: number) => new Date(t).toISOString().slice(11, 19)
const cd = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export function DeskPage() {
  const d = useServer((s) => s.data), error = useServer((s) => s.error), control = useServer((s) => s.control), [now, setNow] = useState(Date.now()), [copied, setCopied] = useState(''), [msg, setMsg] = useState('')
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i) }, [])
  if (!d) return <div className="page-grid"><section className="panel card wide"><h2>Live Desk</h2><p className="empty">{error || 'Connecting to the server...'}</p></section></div>
  const pair = d.signals[0]?.pair ?? Object.keys(d.candles)[0] ?? 'EURUSD', m1 = d.candles[pair] ?? [], price = d.prices[pair] ?? m1[m1.length - 1]?.c, pip = pipSize(pair), pv = pipValuePerLot(pair), dp = pair.endsWith('JPY') ? 3 : 5, f = (x: number) => x.toFixed(dp)
  const last = d.signals[0], t = d.signals.find((s) => s.kind === 'TRADE' && s.pair === pair && Date.parse(s.expiry!) > now) ?? null
  const sg = t?.dir === 'CALL' ? 1 : -1, fav = t && price ? ((price - t.price) / pip) * sg : 0, left = t ? (Date.parse(t.expiry!) - now) / 60000 : 0, c = d.cycle && d.cycle.pair === pair ? d.cycle : null
  const hedgePips = c ? (c.tpHit ? c.tpPips : c.stopHit ? -c.stopPips : -fav) : -fav, exUsd = t ? hedgePips * t.lots! * pv : 0, qUsd = t ? (fav > 0 ? 0.93 : -1) * t.stake! : 0
  const next = Math.ceil((now + 1) / 900000) * 900000, inWindow = isTradingSession(next), sessionOpen = isTradingSession(now)
  const exSide = t?.hedgeSide, copy = (k: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(k); setTimeout(() => setCopied(''), 1500) }
  const state = t ? 'READY' : last?.kind === 'NO_TRADE' ? 'NO TRADE' : 'WAIT'
  return (
    <div className="page-grid">
      <section className="panel card"><h2>{pair} decision</h2>
        <div className={`state ${t ? 'ready' : 'none'}`} style={!t && last ? { background: 'var(--bad)', color: '#2a0608' } : undefined}>{state}</div>
        <p className="big">{price ? f(price) : '...'}</p>
        <p>Live real-market price (1-minute candles). Next decision in <strong>{inWindow ? cd(next - now) : 'next session'}</strong>{inWindow ? ` at ${hms(next).slice(0, 5)} GMT` : ''}.</p>
        <p className="mut">Decisions happen at the open of every 15-minute candle, 08:00 to 16:45 GMT, Mon to Fri. Session now: {sessionOpen ? 'OPEN' : 'CLOSED'}.</p>
        <div className="button-row"><AdminToken /><button type="button" className="btn" onClick={async () => setMsg((await control({ news: !d.news })) || 'Done')}>News nearby: {d.news ? 'ON (blocks)' : 'off'}</button></div>{msg && <p>{msg}</p>}</section>
      <section className="panel card"><h2>{t ? 'Why this signal' : 'Why no trade'}</h2>
        {t ? <ul className="checks"><li className="ok">✔ Strength {t.strength}/100</li><li className="ok">✔ H1 trend, M15 slope, RSI and volatility agree</li><li className="ok">✔ Session open, no news switch, balance and margin fine</li></ul>
          : last?.kind === 'NO_TRADE' ? <ul className="checks">{last.reasons.map((r) => <li key={r} className="no">✖ {r}</li>)}</ul> : <p className="empty">Waiting for the first decision.</p>}</section>
      <section className="panel card block quotex"><h2>Quotex (binary)</h2>
        {!t ? <p className="empty">No active signal. A ticket appears here at the open of a 15-minute candle when conditions are right.</p> : <>
          <p className="big"><Pill side={t.dir === 'CALL' ? 'BUY' : 'SELL'} /> <small className="mut">{t.dir}</small></p>
          <p>Stake <strong>${t.stake!.toFixed(2)}</strong>, expiry <strong>{hms(Date.parse(t.expiry!))} GMT</strong> ({cd(left * 60000)} left)</p><p>Entry about {f(t.price)}, now {price ? f(price) : '-'} ({fav >= 0 ? '+' : ''}{fav.toFixed(1)} pips for the binary)</p>
          <p>Counter plan: if the Exness stop hits and price returns to {f(t.price + sg * 0.5 * pip)} in the last 5 minutes, buy the opposite binary, same expiry.</p>
          <button type="button" className="btn" onClick={() => copy('q', `Quotex: ${t.dir === 'CALL' ? 'BUY/CALL' : 'SELL/PUT'} ${pair} $${t.stake!.toFixed(2)} expiry ${hms(Date.parse(t.expiry!))} GMT entry ${f(t.price)}`)}>{copied === 'q' ? 'Copied' : 'Copy Quotex ticket'}</button></>}</section>
      <section className="panel card block exness"><h2>Exness (hedge)</h2>
        {!t ? <p className="empty">The hedge ticket appears together with the binary.</p> : <>
          <p className="big"><Pill side={exSide!} /> {t.lots!.toFixed(2)} lots</p><p>Entry at market about {f(t.price)}</p>
          <p>Stop loss <strong>{f(t.sl!)}</strong> ({t.stopPips} pips, -${t.stopUsd?.toFixed(2)})</p><p>Take profit <strong>{f(t.tp!)}</strong> ({t.tpPips} pips, +${t.tpUsd?.toFixed(2)})</p>
          <p>Close any open hedge at expiry {hms(Date.parse(t.expiry!))} GMT.{t.scaled !== undefined && t.scaled < 1 ? ` Hedge scaled to ${(t.scaled * 100).toFixed(0)}% of plan to fit the Exness balance.` : ''}</p>
          <button type="button" className="btn" onClick={() => copy('e', `Exness: ${exSide} ${pair} ${t.lots!.toFixed(2)} lots SL ${f(t.sl!)} TP ${f(t.tp!)}`)}>{copied === 'e' ? 'Copied' : 'Copy Exness ticket'}</button></>}</section>
      {t && <section className="panel card wide"><h2>Going in my favour (model estimate)</h2>
        <div className="kpis"><div className="kpi"><span>Chance the binary finishes in the money</span><strong>{(winProbability(fav, Math.max(1, t.vol), left) * 100).toFixed(0)}%</strong></div>
          <div className="kpi"><span>Quotex now (estimate)</span><strong className={qUsd >= 0 ? 'up' : 'down'}>{qUsd >= 0 ? '+' : '-'}${Math.abs(qUsd).toFixed(2)}</strong></div>
          <div className="kpi"><span>Exness now</span><strong className={exUsd >= 0 ? 'up' : 'down'}>{exUsd >= 0 ? '+' : '-'}${Math.abs(exUsd).toFixed(2)}</strong></div>
          <div className="kpi"><span>Combined (estimate)</span><strong className={qUsd + exUsd >= 0 ? 'up' : 'down'}>{qUsd + exUsd >= 0 ? '+' : '-'}${Math.abs(qUsd + exUsd).toFixed(2)}</strong></div></div>
        <p className="mut">The percentage is a random-walk estimate, not a promise. Final results use the real price at expiry.</p></section>}
      <section className="panel card wide"><h2>{pair} chart (real market, 1-minute)</h2>
        <TradeChart candles={m1} digits={dp} levels={t ? [{ price: t.price, label: 'Entry', color: '#5ea0ff' }, { price: t.sl!, label: 'Exness stop', color: '#ff6d7a' }, { price: t.tp!, label: 'Exness TP', color: '#2ecc8f' }, { price: t.price + sg * 0.5 * pip, label: 'Counter trigger', color: '#f5b84b' }] : []}
          box={t ? { t0: Date.parse(t.time), t1: Date.parse(t.expiry!), entry: t.price, sl: t.sl!, tp: t.tp!, slPips: t.stopPips!, tpPips: t.tpPips!, quotex: t.dir === 'CALL' ? 'BUY' : 'SELL' } : null} /></section>
      <section className="wide"><h2>Signal history</h2><p className="mut">Newest first. Green = tradable candle, red = a run of no-trade candles (shown once).</p><SignalCards rows={d.signals} /></section>
    </div>
  )
}
