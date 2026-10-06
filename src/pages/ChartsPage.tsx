import { useEffect, useMemo, useState } from 'react'
import { type Candle } from '../engine/math'
import { makeSimFeed } from '../feed/sim'
import { useAppStore } from '../store/useAppStore'

export function ChartsPage() {
  const pair = useAppStore((state) => state.pair)
  const [timeframe, setTimeframe] = useState<'M1' | 'M5' | 'M15'>('M1')
  const [candles, setCandles] = useState<Candle[]>([])

  useEffect(() => {
    const stop = makeSimFeed(pair, (tick) => {
      const mid = (tick.bid + tick.ask) / 2
      const minute = Math.floor(tick.t / 60000) * 60000
      setCandles((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.t !== minute) {
          return [...prev.slice(-119), { t: minute, o: mid, h: mid, l: mid, c: mid }]
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

  const visibleCandles = useMemo(() => {
    const count = timeframe === 'M1' ? 30 : timeframe === 'M5' ? 24 : 16
    return candles.slice(-count)
  }, [candles, timeframe])

  const chart = useMemo(() => {
    const min = Math.min(...visibleCandles.map((c) => c.l), ...visibleCandles.map((c) => c.c))
    const max = Math.max(...visibleCandles.map((c) => c.h), ...visibleCandles.map((c) => c.c))
    const range = max - min || 0.0005
    return visibleCandles.map((candle, index) => {
      const x = (index / Math.max(visibleCandles.length - 1, 1)) * 100
      const openY = 100 - ((candle.o - min) / range) * 100
      const closeY = 100 - ((candle.c - min) / range) * 100
      const highY = 100 - ((candle.h - min) / range) * 100
      const lowY = 100 - ((candle.l - min) / range) * 100
      return { ...candle, x, openY, closeY, highY, lowY }
    })
  }, [visibleCandles])

  return (
    <div className="page-grid">
      <section className="panel card wide">
        <h2>Chart</h2>
        <div className="button-row">
          {(['M1', 'M5', 'M15'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={timeframe === option ? 'active-tab' : ''}
              onClick={() => setTimeframe(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <svg viewBox="0 0 100 100" className="chart-svg" preserveAspectRatio="none" aria-label={`${pair} ${timeframe} chart`}>
          {chart.map((candle) => (
            <g key={candle.t}>
              <line x1={`${candle.x}`} y1={`${candle.highY}`} x2={`${candle.x}`} y2={`${candle.lowY}`} stroke="var(--mut)" strokeWidth="0.6" />
              <rect
                x={`${candle.x - 1.2}`}
                y={Math.min(candle.openY, candle.closeY)}
                width="2.4"
                height={Math.max(Math.abs(candle.closeY - candle.openY), 1.6)}
                fill={candle.c >= candle.o ? 'var(--ok)' : 'var(--bad)'}
                rx="0.5"
              />
            </g>
          ))}
        </svg>
      </section>

      <section className="panel card wide">
        <h2>TradingView widget</h2>
        <div className="tv-widget">
          <strong>Real market data only.</strong>
          <span>This widget is not connected to the simulated desk feed.</span>
        </div>
      </section>
    </div>
  )
}
