import { useEffect, useMemo, useState } from 'react'
import { type Candle } from '../engine/math'
import { makeSimFeed } from '../feed/sim'
import { useAppStore } from '../store/useAppStore'

const defaultWatchlist = ['EURUSD', 'GBPUSD', 'AUDUSD']

export function AutoPage() {
  const pair = useAppStore((state) => state.pair)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [seed, setSeed] = useState('seed-001')
  const [watchlist, setWatchlist] = useState<string[]>(defaultWatchlist)
  const [events, setEvents] = useState<string[]>([
    'SIMULATED: feed ready',
    'WAIT: waiting for a valid setup',
  ])
  const [candles, setCandles] = useState<Candle[]>([])
  const [price, setPrice] = useState(1.0842)

  useEffect(() => {
    if (!running) return

    const stop = makeSimFeed(pair, (tick) => {
      const nextPrice = (tick.bid + tick.ask) / 2
      setPrice(nextPrice)
      const minute = Math.floor(tick.t / 60000) * 60000
      setCandles((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.t !== minute) {
          return [...prev.slice(-119), { t: minute, o: nextPrice, h: nextPrice, l: nextPrice, c: nextPrice }]
        }
        const current = { ...last }
        current.h = Math.max(current.h, nextPrice)
        current.l = Math.min(current.l, nextPrice)
        current.c = nextPrice
        return [...prev.slice(0, -1), current]
      })

      if (Math.random() > 0.7) {
        setEvents((prev) => [`SIMULATED: ${pair} tick ${nextPrice.toFixed(5)}`, ...prev].slice(0, 8))
      }
    }, speed)

    return () => stop()
  }, [running, pair, speed])

  const status = useMemo(() => (running ? 'RUNNING' : 'PAUSED'), [running])

  const togglePair = (next: string) => {
    setWatchlist((prev) =>
      prev.includes(next) ? prev.filter((item) => item !== next) : [...prev, next],
    )
  }

  const startTrader = () => {
    setRunning(true)
    setEvents((prev) => ['START: auto paper trader engaged', ...prev].slice(0, 8))
  }

  const pauseTrader = () => {
    setRunning(false)
    setEvents((prev) => ['PAUSE: awaiting next trigger', ...prev].slice(0, 8))
  }

  const stopTrader = () => {
    setRunning(false)
    setCandles([])
    setEvents(['STOP: simulation stopped', ...events].slice(0, 8))
  }

  return (
    <div className="page-grid">
      <section className="panel card">
        <h2>Auto Paper Trader</h2>
        <div className="button-row">
          <button type="button" onClick={startTrader}>Start</button>
          <button type="button" onClick={pauseTrader}>Pause</button>
          <button type="button" onClick={stopTrader}>Stop</button>
        </div>
        <div className="field-row">
          <label>
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={1}>1x</option>
              <option value={5}>5x</option>
              <option value={15}>15x</option>
              <option value={60}>60x</option>
            </select>
          </label>
          <label>
            Seed
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
        </div>
        <p>Status: <strong>{status}</strong></p>
        <p>Current pair: {pair}</p>
        <p>Price: {price.toFixed(pair.endsWith('JPY') ? 3 : 5)}</p>
      </section>

      <section className="panel card">
        <h2>Pair watchlist</h2>
        <div className="watchlist">
          {['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'NZDUSD'].map((item) => (
            <label key={item} className="watch-item">
              <input
                type="checkbox"
                checked={watchlist.includes(item)}
                onChange={() => togglePair(item)}
              />
              {item}
            </label>
          ))}
        </div>
      </section>

      <section className="panel card wide">
        <h2>Event stream</h2>
        <ul className="event-stream">
          {events.map((event) => (
            <li key={`${event}-${Math.random()}`}>{event}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
