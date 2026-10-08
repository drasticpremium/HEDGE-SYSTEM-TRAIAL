import { useEffect, useRef, useState } from 'react'
import { ColorType, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '../engine/math'
import type { Cycle } from '../engine/cycle'
export interface Level { price: number; label: string; color: string }
/** Position box like TradingView's long/short tool. The hedge is on the Exness side; quotex is the binary side. */
export interface PosBox { t0: number; t1: number; entry: number; sl: number; tp: number; slPips: number; tpPips: number; quotex: 'BUY' | 'SELL' }
export function cycleLevels(c: Cycle): Level[] {
  const sg = c.dir === 'CALL' ? 1 : -1
  return [{ price: c.entry, label: 'Entry', color: '#5ea0ff' }, { price: c.entry + sg * c.stopPips * c.pip, label: 'Exness stop', color: '#ff6d7a' }, { price: c.entry - sg * c.tpPips * c.pip, label: 'Exness TP', color: '#2ecc8f' }, { price: c.entry + sg * 0.5 * c.pip, label: 'Counter trigger', color: '#f5b84b' }]
}
export const cycleBox = (c: Cycle): PosBox => { const sg = c.dir === 'CALL' ? 1 : -1; return { t0: c.openT, t1: c.expiryT, entry: c.entry, sl: c.entry + sg * c.stopPips * c.pip, tp: c.entry - sg * c.tpPips * c.pip, slPips: c.stopPips, tpPips: c.tpPips, quotex: c.dir === 'CALL' ? 'BUY' : 'SELL' } }
const sec = (t: number) => Math.floor(t / 1000) as UTCTimestamp
export function TradeChart({ candles, levels, box, digits = 5, height = 360 }: { candles: Candle[]; levels: Level[]; box?: PosBox | null; digits?: number; height?: number }) {
  const el = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null), series = useRef<ISeriesApi<'Candlestick'> | null>(null), lines = useRef<IPriceLine[]>([]), prev = useRef({ n: 0, t: 0 }), [, force] = useState(0)
  useEffect(() => {
    const c = createChart(el.current!, { autoSize: true, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9db0ce' }, grid: { vertLines: { color: 'rgba(120,140,170,.12)' }, horzLines: { color: 'rgba(120,140,170,.12)' } }, timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 22 } })
    series.current = c.addCandlestickSeries({ upColor: '#2ecc8f', downColor: '#ff6d7a', wickUpColor: '#2ecc8f', wickDownColor: '#ff6d7a', borderVisible: false, priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } })
    chart.current = c; prev.current = { n: 0, t: 0 }; return () => { c.remove(); chart.current = null; series.current = null }
  }, [digits])
  const last = candles[candles.length - 1]
  // The trader updates its candle array in place, so depend on the last candle's values, not on the array identity.
  useEffect(() => {
    const s = series.current; if (!s || !last) return
    const row = (k: Candle) => ({ time: sec(k.t), open: k.o, high: k.h, low: k.l, close: k.c }), p = prev.current
    try {
      if (p.n && candles.length === p.n && last.t === p.t) s.update(row(last))
      else if (p.n && candles.length === p.n + 1 && candles[candles.length - 2].t === p.t) { s.update(row(candles[candles.length - 2])); s.update(row(last)) }
      else { s.setData(candles.map(row)); chart.current?.timeScale().fitContent() }
    } catch { s.setData(candles.map(row)) }
    prev.current = { n: candles.length, t: last.t }
  }, [last?.t, last?.c, last?.h, last?.l, candles.length, digits])
  const key = levels.map((l) => l.label + l.price).join('|')
  useEffect(() => {
    const s = series.current; if (!s) return
    lines.current.forEach((l) => s.removePriceLine(l)); lines.current = levels.map((l) => s.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.label }))
  }, [key, digits, !!last])
  useEffect(() => { if (!box) return; const i = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(i) }, [box])
  let rect: JSX.Element | null = null
  const c = chart.current, s = series.current
  try {
  if (box && c && s && candles.length > 1) {
    const ts = c.timeScale(), a = candles[candles.length - 1], b = candles[candles.length - 2], xa = ts.timeToCoordinate(sec(a.t)), xb = ts.timeToCoordinate(sec(b.t))
    if (xa !== null && xb !== null) {
      const sp = xa - xb, xAt = (t: number) => (t >= a.t ? xa + ((t - a.t) / 60000) * sp : ts.timeToCoordinate(sec(t)))
      const x0 = xAt(box.t0), x1 = xAt(box.t1), ye = s.priceToCoordinate(box.entry), ys = s.priceToCoordinate(box.sl), yt = s.priceToCoordinate(box.tp)
      if (x0 !== null && x1 !== null && ye !== null && ys !== null && yt !== null) {
        const left = Math.min(x0, x1), width = Math.max(4, Math.abs(x1 - x0)), hedge = box.quotex === 'BUY' ? 'SELL' : 'BUY'
        rect = <>
          <div className="tv-box tv-profit" style={{ left, width, top: Math.min(ye, yt), height: Math.abs(yt - ye) }}><span>Take profit {box.tpPips}p</span></div>
          <div className="tv-box tv-loss" style={{ left, width, top: Math.min(ye, ys), height: Math.abs(ys - ye) }}><span>Stop loss {box.slPips}p</span></div>
          <div className="tv-entry" style={{ left, width, top: ye }}><span>Quotex {box.quotex} + Exness {hedge} @ {box.entry.toFixed(digits)}</span></div></>
      }
    }
  }
  } catch { rect = null }
  return <div style={{ position: 'relative', height, width: '100%' }}><div ref={el} style={{ position: 'absolute', inset: 0 }} /><div className="tv-overlay">{rect}</div></div>
}
