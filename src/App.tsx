import { useEffect, useMemo, useRef, useState } from 'react'
import { PAIRS, pipSize, pipValuePerLot, defaultVol15 } from './engine/pairs'
import { atr, realizedVol15, sizing, Candle } from './engine/math'
import { makeSimFeed, Tick } from './feed/sim'

const THEMES = ['midnight', 'emerald', 'amber', 'violet', 'light', 'contrast']
const pad = (n: number) => String(n).padStart(2, '0')
const cd = (ms: number) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`

export default function App() {
  const [pair, setPair] = useState(localStorage.pair || 'EURUSD')
  const [theme, setTheme] = useState(localStorage.theme || 'midnight')
  const [risk, setRisk] = useState(8)
  const [tick, setTick] = useState<Tick | null>(null)
  const [m1, setM1] = useState<Candle[]>([])
  const [now, setNow] = useState(Date.now())
  const cur = useRef<Candle | null>(null)

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.theme = theme }, [theme])
  useEffect(() => { localStorage.pair = pair; setM1([]); setTick(null); cur.current = null
    return makeSimFeed(pair, t => {
      setTick(t)
      const mid = (t.bid + t.ask) / 2, min = Math.floor(t.t / 60000) * 60000, c = cur.current
      if (!c || c.t !== min) { if (c) setM1(a => [...a.slice(-119), c]); cur.current = { t: min, o: mid, h: mid, l: mid, c: mid } }
      else { c.h = Math.max(c.h, mid); c.l = Math.min(c.l, mid); c.c = mid }
    }, 20) // 20x speed so indicators warm up in about a minute; set to 1 for real-time
  }, [pair])
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i) }, [])

  const pip = pipSize(pair), pv = pipValuePerLot(pair), hour = new Date(now).getUTCHours()
  const open = hour >= 8 && hour < 17
  const vol = useMemo(() => realizedVol15(m1.map(c => c.c), pip), [m1, pip])
  const vol15 = vol ?? defaultVol15(pair)
  const sz = sizing(vol15, risk, pv)
  const a1 = atr(m1); const spread = tick ? (tick.ask - tick.bid) / pip : 0
  const dp = pair.endsWith('JPY') ? 3 : 5

  return (<div className="wrap">
    <header><h1>Hedge Signal Desk</h1>
      <div className="ctl">
        <select value={pair} onChange={e => setPair(e.target.value)}>{PAIRS.map(p => <option key={p}>{p}</option>)}</select>
        <select value={theme} onChange={e => setTheme(e.target.value)}>{THEMES.map(t => <option key={t}>{t}</option>)}</select>
      </div></header>
    <div className="banner">SIMULATED feed. Paper trading only. Educational tool, not financial advice. Binary options and leveraged forex carry a high risk of loss.</div>
    <main>
      <section className="card big"><h2>{pair}</h2><div className="num">{tick ? ((tick.bid + tick.ask) / 2).toFixed(dp) : '...'}</div>
        <p>Spread {spread.toFixed(1)} pips</p></section>
      <section className="card"><h2>Session</h2><div className={'num ' + (open ? 'up' : 'down')}>{open ? 'OPEN' : 'CLOSED'}</div><p>08:00-17:00 GMT, now {pad(hour)}:{pad(new Date(now).getUTCMinutes())}</p></section>
      <section className="card"><h2>Next candle</h2><div className="num">M1 {cd(60000 - (now % 60000))}</div><p>M15 {cd(900000 - (now % 900000))}</p></section>
      <section className="card"><h2>Volatility</h2><div className="num">{vol15.toFixed(1)} pips</div>
        <p>{vol ? 'Realized, 15 min' : 'Default estimate (warming up)'}; ATR(14) M1 {a1 ? (a1 / pip).toFixed(2) + ' pips' : 'needs 15 candles'}</p></section>
      <section className="card wide"><h2>Hedge sizing for {pair}</h2>
        <label>Risk per cycle ($) <input type="number" value={risk} min={1} onChange={e => setRisk(+e.target.value)} /></label>
        <div className="grid3"><div><span>Stop</span><b>{sz.stopPips} pips</b><small>${sz.stopUsd.toFixed(2)}</small></div>
          <div><span>Take profit</span><b>{sz.tpPips} pips</b><small>${sz.tpUsd.toFixed(2)}</small></div>
          <div><span>Lots</span><b>{sz.lots.toFixed(2)}</b><small>pip value ${pv.toFixed(2)}/lot</small></div></div>
        <p className="note">Stop = 1.25x and take profit = 1.9x the 15-minute volatility. Lots = risk / (stop pips x pip value).</p></section>
    </main>
    <footer>Stage 1: engine, tests, simulated feed. Signals, paper trading, charts and performance come in the next stages.</footer>
  </div>)
}
