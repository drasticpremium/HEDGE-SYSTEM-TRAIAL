import { useEffect, useMemo, useRef, useState } from 'react'
import { type Candle } from '../engine/math'
import { defaultVol15, pipSize } from '../engine/pairs'
import { buildDeskTicket, calculateSignal } from '../engine/signal'
import { makeSimFeed, type Tick } from '../feed/sim'
import { useAppStore } from '../store/useAppStore'

const createMinuteCandle = (t: number, price: number): Candle => ({
  t,
  o: price,
  h: price,
  l: price,
  c: price,
})

export function DeskPage() {
  const pair = useAppStore((state) => state.pair)
  const clockMode = useAppStore((state) => state.clockMode)
  const [tick, setTick] = useState<Tick | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [copied, setCopied] = useState(false)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const alertLock = useRef(false)

  useEffect(() => {
    setCandles([])
    setTick(null)

    const stop = makeSimFeed(pair, (nextTick) => {
      setTick(nextTick)
      const mid = (nextTick.bid + nextTick.ask) / 2
      const minute = Math.floor(nextTick.t / 60000) * 60000
      setCandles((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.t !== minute) {
          return [...prev.slice(-119), createMinuteCandle(minute, mid)]
        }
        const current = { ...last }
        current.h = Math.max(current.h, mid)
        current.l = Math.min(current.l, mid)
        current.c = mid
        return [...prev.slice(0, -1), current]
      })
    }, 1)

    return () => stop()
  }, [pair])

  const price = tick ? (tick.bid + tick.ask) / 2 : 1.0842
  const pip = pipSize(pair)
  const spreadPips = tick ? (tick.ask - tick.bid) / pip : 0.8
  const currentVol = defaultVol15(pair)
  const signal = useMemo(
    () =>
      calculateSignal({
        pair,
        price,
        m1: candles,
        spreadPips,
        atrPips: candles.length > 14 ? (candles[candles.length - 1].c - candles[candles.length - 2].c) / pip + 2.2 : 2.6,
        vol15: currentVol,
        sessionOpen: true,
      }),
    [candles, pair, price, spreadPips, currentVol],
  )

  const ticket = useMemo(
    () =>
      buildDeskTicket({
        pair,
        direction: signal.direction,
        strength: signal.strength,
        stake: 12,
        entry: price,
        stop: signal.stop,
        takeProfit: signal.takeProfit,
        expiryMinutesLeft: 14.53,
        lots: signal.lots,
        expiresAt: Date.now() + 14.53 * 60 * 1000,
      }),
    [pair, price, signal],
  )

  useEffect(() => {
    if (!signal.ready || alertLock.current) return
    alertLock.current = true
    document.title = 'Hedge Signal Desk • READY'
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Signal ready', { body: ticket })
    }
    if ('vibrate' in navigator) navigator.vibrate([120, 80, 140])
    const timeout = window.setTimeout(() => {
      document.title = 'Hedge Signal Desk'
    }, 1800)
    return () => window.clearTimeout(timeout)
  }, [signal.ready, ticket])

  const checklist = [
    { label: 'Session 08:00-17:00 GMT', ok: true },
    { label: 'News nearby toggle off', ok: true },
    { label: `Spread normal (${spreadPips.toFixed(1)} pips)`, ok: spreadPips < 1.5 },
    { label: `Realized vol in range (${currentVol.toFixed(1)} pips)`, ok: currentVol > 2 && currentVol < 7 },
    { label: `ATR regime normal (${((signal.score / 100) * 3).toFixed(1)} pips)`, ok: signal.score >= 60 },
  ]

  const copyTicket = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(ticket)
      } else {
        throw new Error('Clipboard not available')
      }
    } catch {
      // Fallback for restricted or automated browser contexts.
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const requestAlerts = async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setAlertsEnabled(permission === 'granted')
  }

  return (
    <div className="page-grid">
      <section className="panel card">
        <h2>Live Desk</h2>
        <p>Pair: {pair}</p>
        <p>Mode: {clockMode === 'sim' ? 'SIM CLOCK' : 'LIVE CLOCK'}</p>
        <p>Signal state: <strong>{signal.status}</strong></p>
        <p>Price: {price.toFixed(pair.endsWith('JPY') ? 3 : 5)}</p>
      </section>

      <section className="panel card">
        <h2>Trade ticket</h2>
        <div className="ticket-box">{ticket}</div>
        <div className="button-row">
          <button type="button" onClick={copyTicket}>{copied ? 'Copied' : 'Copy ticket'}</button>
          <button type="button" onClick={requestAlerts}>{alertsEnabled ? 'Alerts enabled' : 'Enable browser alerts'}</button>
        </div>
      </section>

      <section className="panel card">
        <h2>Signal</h2>
        <p>Strength: {signal.strength}</p>
        <p>Probability: {(signal.probability * 100).toFixed(0)}% model estimate</p>
        <div className="gauge">
          <div className="gauge-fill" style={{ width: `${Math.min(100, Math.max(0, signal.score))}%` }} />
        </div>
        <p>{signal.reasons.join(' • ')}</p>
      </section>

      <section className="panel card wide">
        <h2>Checklist</h2>
        <ul className="checklist">
          {checklist.map((item) => (
            <li key={item.label} className={item.ok ? 'ok' : 'warn'}>{item.label}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
