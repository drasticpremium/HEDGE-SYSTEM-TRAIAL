import { PAIRS } from '../engine/pairs'
import { favPips } from '../engine/cycle'
import { winProbability } from '../engine/math'
import { useTrader } from '../store/trader'

export function AutoPage() {
  const t = useTrader()
  const c = t.cycle
  const fav = c ? favPips(c, t.prices[c.pair]) : 0
  const mins = c ? Math.max(0, (c.expiryT - t.simT) / 60000) : 0
  const p = c ? winProbability(fav, Math.max(1, c.stopPips / 1.25), mins) : 0
  const toggle = (x: string) => t.set({ watchlist: t.watchlist.includes(x) ? t.watchlist.filter((i) => i !== x) : [...t.watchlist, x] })
  return (
    <div className="page-grid">
      <section className="panel card">
        <h2>Auto Paper Trader</h2>
        <div className="button-row">
          <button type="button" onClick={() => t.set({ running: !t.running })}>{t.running ? 'Pause' : 'Start'}</button>
        </div>
        <div className="field-row">
          <label>Speed
            <select value={t.speed} onChange={(e) => t.set({ speed: Number(e.target.value) })}>{[1, 5, 15, 60].map((s) => <option key={s} value={s}>{s}x</option>)}</select>
          </label>
          <label><input type="checkbox" checked={t.respectSession} onChange={(e) => t.set({ respectSession: e.target.checked })} /> Only trade 08:00-17:00 GMT (sim clock)</label>
        </div>
        <p>Status: <strong>{t.running ? 'RUNNING' : 'PAUSED'}</strong> | Sim clock {new Date(t.simT).toISOString().slice(11, 19)} GMT</p>
        <p>{t.status}</p>
        <p>Cycles this session: {t.sessionCycles}. SIMULATED data on a random walk, so results only test the machinery. It runs while this site is open in a tab.</p>
      </section>
      <section className="panel card">
        <h2>Active cycle</h2>
        {!c ? <p>No open cycle. The trader opens one when every condition is green.</p> : (
          <div>
            <p><strong>{c.pair} {c.dir}</strong>, strength {c.strength}</p>
            <p>Quotex: {c.dir} ${c.stake.toFixed(2)}, entry {c.entry.toFixed(5)}, {mins.toFixed(1)} min left</p>
            <p>Exness: {c.dir === 'CALL' ? 'SELL' : 'BUY'} {c.lots} lots, stop {c.stopPips}p, TP {c.tpPips}p {c.stopHit ? '(stop HIT)' : c.tpHit ? '(TP HIT)' : ''}</p>
            <p>Counter: {c.counterState}. Binary {fav >= 0 ? 'winning' : 'losing'} by {Math.abs(fav).toFixed(1)} pips.</p>
            <p>Model estimate of binary finishing in the money: {(p * 100).toFixed(0)}%</p>
          </div>
        )}
      </section>
      <section className="panel card">
        <h2>Pair watchlist</h2>
        <div className="watchlist">{PAIRS.map((x) => <label key={x} className="watch-item"><input type="checkbox" checked={t.watchlist.includes(x)} onChange={() => toggle(x)} />{x}</label>)}</div>
      </section>
      <section className="panel card wide">
        <h2>Event stream</h2>
        <ul className="event-stream">{t.events.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </section>
    </div>
  )
}
