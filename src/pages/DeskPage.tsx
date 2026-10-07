import { useEffect, useMemo, useRef, useState } from 'react'
import { pipSize, pipValuePerLot } from '../engine/pairs'
import { ensurePair, evaluate, useTrader } from '../store/trader'
import { SignalHistory } from '../components/SignalHistory'
import { TradeChart } from '../components/TradeChart'
import { useServer } from '../store/server'
import type { Candle } from '../engine/math'
import { Pill } from '../components/Pill'
import { useAppStore } from '../store/useAppStore'

interface Ticket { dir: 'CALL' | 'PUT'; entry: number; t: number; strength: number; stake: number; lots: number; stopPips: number; tpPips: number; missed: boolean }
const beep = () => { try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + 0.25) } catch { /* sound blocked */ } }
const hms = (t: number) => new Date(t).toISOString().slice(11, 19)

export function DeskPage() {
  const app = useAppStore(), pair = app.pair, tr = useTrader()
  const news = tr.news, setNews = (v: boolean) => tr.set({ news: v }), [ticket, setTicket] = useState<Ticket | null>(null), [now, setNow] = useState(Date.now()), [copied, setCopied] = useState('')
  useEffect(() => ensurePair(pair), [pair])
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i) }, [])
  const srv = useServer((x) => x.data), [mode, setMode] = useState<'sim' | 'live'>('sim')
  const liveC: Candle[] | undefined = srv?.candles?.[pair], useLive = mode === 'live' && !!liveC?.length, win = useLive ? 120 : 20
  const m1: Candle[] = useLive ? liveC! : tr.candles[pair] ?? [], price = useLive ? liveC![liveC!.length - 1].c : tr.prices[pair], pip = pipSize(pair), pv = pipValuePerLot(pair)
  const calc = useMemo(() => (price ? (useLive ? evaluate(pair, Date.now(), { m1, price }) : evaluate(pair, tr.simT)) : null), [price, m1.length, pair, tr.simT, useLive, tr.news, tr.respectSession])
  const ready = !!calc && calc.ready
  const tRef = useRef(ticket); tRef.current = ticket
  useEffect(() => {
    if (!calc || !price) return
    const tk = tRef.current
    if (!tk && ready) { setTicket({ dir: calc.sig.direction, entry: price, t: Date.now(), strength: calc.sig.strength, stake: calc.stake, lots: calc.sz.lots, stopPips: calc.sz.stopPips, tpPips: calc.sz.tpPips, missed: false }); beep(); document.title = 'SIGNAL READY - Hedge Signal Desk' }
    else if (tk && !tk.missed && (Date.now() - tk.t > win * 1000 || Math.abs(price - tk.entry) / pip > 0.5)) setTicket({ ...tk, missed: true })
    else if (tk && tk.missed && !ready) { setTicket(null); document.title = 'Hedge Signal Desk' }
  }, [price, ready])
  const dp = pair.endsWith('JPY') ? 3 : 5, f = (x: number) => x.toFixed(dp)
  const check = (ok: boolean, label: string) => <li className={ok ? 'ok' : 'no'}>{ok ? '✔' : '✖'} {label}</li>
  const copy = (k: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(k); setTimeout(() => setCopied(''), 1500) }
  const tk = ticket, left = tk ? Math.max(0, win - (now - tk.t) / 1000) : 0
  const exSide = tk?.dir === 'CALL' ? 'SELL' : 'BUY', sg = tk?.dir === 'CALL' ? 1 : -1
  const expiry = tk ? hms(tk.t + 15 * 60000) : ''
  const quoteUsd = pv / 100000 / pip
  const margin = tk && price ? (tk.lots * 100000 * (pair.startsWith('USD') ? 1 : price * quoteUsd)) / app.leverage : 0
  return (
    <div className="page-grid">
      <section className="panel card wide row-between"><div className="seg"><button type="button" className={mode === 'sim' ? 'on' : ''} onClick={() => setMode('sim')}>Simulated feed</button><button type="button" className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live market (server)</button></div><span className={mode === 'live' && !useLive ? 'down' : 'mut'}>{mode === 'sim' ? 'Prices are SIMULATED. Do not trade real money from them.' : useLive ? `LIVE 1-minute candles via the 24/7 server. Last update ${Math.round((Date.now() - (srv?.lastTick ?? 0)) / 60000)} min ago. ${srv?.status}` : 'No live data yet. Check the 24/7 Server page.'}</span></section>
      <section className="panel card"><h2>{pair} signal</h2>
        <div className={`state ${ready ? 'ready' : calc ? 'wait' : 'none'}`}>{!calc ? 'LOADING' : ready ? 'READY' : calc.session && !news ? 'WAIT' : 'NO TRADE'}</div>
        <p className="big">{price ? f(price) : '...'}</p>
        <p>Strength {calc?.sig.strength ?? 0}/100, direction {calc?.sig.direction ?? '-'}. Volatility {calc?.vol.toFixed(1) ?? '-'} pips per 15 min.</p>
        <label className="watch-item"><input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} /> News nearby (blocks signals)</label></section>
      <section className="panel card"><h2>Conditions</h2><ul className="checks">
        {check(!!calc?.session, 'Session open 08:00-17:00 GMT (sim clock)')}{check(!news, 'No news nearby')}{check((calc?.spread ?? 9) <= 1.4, 'Spread normal')}
        {check((calc?.vol ?? 0) >= 1.5 && (calc?.vol ?? 99) <= 8, 'Volatility in normal range')}{check((calc?.sig.strength ?? 0) >= 60, 'Strength at least 60')}{check(app.binaryBalanceUsd >= app.minimumBinaryStake, 'Balance covers minimum stake')}</ul></section>
      <section className="panel card block quotex"><h2>Quotex (binary)</h2>
        {!tk ? <p className="empty">Waiting for a READY signal. You will get a sound and a ticket here.</p> : <>
          <p className="big"><Pill side={tk.dir === 'CALL' ? 'BUY' : 'SELL'} /> <small className="mut">{tk.dir}</small> {pair.slice(0, 3)}/{pair.slice(3)}</p>
          <p>Stake <strong>${tk.stake.toFixed(2)}</strong>, expiry <strong>{expiry} GMT</strong> (15 min)</p><p>Entry about {f(tk.entry)}</p>
          <p>Counter plan: if the Exness stop hits, wait for price at {f(tk.entry + sg * 0.5 * pip)} (entry +0.5 pip, never below entry), then buy a {tk.dir === 'CALL' ? 'PUT' : 'CALL'} for $${tk.stake.toFixed(2)} with the same expiry, at least 1 minute left. One counter at most.</p>
          <button type="button" className="btn" onClick={() => copy('q', `Quotex: ${tk.dir} ${pair} $${tk.stake.toFixed(2)} expiry ${expiry} GMT entry ${f(tk.entry)}`)}>{copied === 'q' ? 'Copied' : 'Copy Quotex ticket'}</button></>}</section>
      <section className="panel card block exness"><h2>Exness (hedge)</h2>
        {!tk ? <p className="empty">The hedge ticket appears together with the binary.</p> : <>
          <p className="big"><Pill side={exSide as 'BUY' | 'SELL'} /> {tk.lots.toFixed(2)} lots</p>
          <p>Entry at market about {f(tk.entry)}</p><p>Stop loss <strong>{f(tk.entry + sg * tk.stopPips * pip)}</strong> ({tk.stopPips} pips)</p><p>Take profit <strong>{f(tk.entry - sg * tk.tpPips * pip)}</strong> ({tk.tpPips} pips)</p>
          <p>Close any open hedge at binary expiry {expiry} GMT. Approx margin ${margin.toFixed(2)} at 1:{app.leverage}.</p>
          <button type="button" className="btn" onClick={() => copy('e', `Exness: ${exSide} ${pair} ${tk.lots.toFixed(2)} lots SL ${f(tk.entry + sg * tk.stopPips * pip)} TP ${f(tk.entry - sg * tk.tpPips * pip)}`)}>{copied === 'e' ? 'Copied' : 'Copy Exness ticket'}</button></>}</section>
      {tk && <section className="panel card wide"><h2>Ticket status</h2>{tk.missed ? <p className="down"><strong>MISSED.</strong> Price moved over 0.5 pip or the time window passed. Wait for the next signal.</p> : <><p>Take both trades within <strong>{left.toFixed(0)} s</strong>.</p><div className="bar"><i style={{ width: `${(left / win) * 100}%` }} /></div></>}
        <p className="mut">Real trades are placed by you on Quotex and Exness. This site never places orders. Prices here are simulated, so use the live feed (coming) before trading real money.</p></section>}
      <section className="panel card wide"><h2>{pair} trade chart {useLive ? '(live)' : '(simulated)'}</h2><TradeChart candles={m1} digits={dp} levels={tk && !tk.missed ? [{ price: tk.entry, label: 'Entry', color: '#5ea0ff' }, { price: tk.entry + sg * tk.stopPips * pip, label: 'Exness stop', color: '#ff6d7a' }, { price: tk.entry - sg * tk.tpPips * pip, label: 'Exness TP', color: '#2ecc8f' }, { price: tk.entry + sg * 0.5 * pip, label: 'Counter trigger', color: '#f5b84b' }] : []} /></section>
      <SignalHistory pair={pair} />
    </div>
  )
}
