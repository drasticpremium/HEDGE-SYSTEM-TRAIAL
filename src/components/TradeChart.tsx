import { useEffect, useRef } from 'react'
import { ColorType, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '../engine/math'
import type { Cycle } from '../engine/cycle'
export interface Level { price: number; label: string; color: string }
/** Entry, Exness stop, Exness take profit and the counter trigger (entry +0.5 pip on the winning side) for an open cycle. */
export function cycleLevels(c: Cycle): Level[] {
  const sg = c.dir === 'CALL' ? 1 : -1
  return [{ price: c.entry, label: 'Entry', color: '#5ea0ff' }, { price: c.entry + sg * c.stopPips * c.pip, label: 'Exness stop', color: '#ff6d7a' }, { price: c.entry - sg * c.tpPips * c.pip, label: 'Exness TP', color: '#2ecc8f' }, { price: c.entry + sg * 0.5 * c.pip, label: 'Counter trigger', color: '#f5b84b' }]
}
export function TradeChart({ candles, levels, digits = 5, height = 340 }: { candles: Candle[]; levels: Level[]; digits?: number; height?: number }) {
  const box = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null), series = useRef<ISeriesApi<'Candlestick'> | null>(null), lines = useRef<IPriceLine[]>([]), fitted = useRef(false)
  useEffect(() => {
    const c = createChart(box.current!, { autoSize: true, layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9db0ce' }, grid: { vertLines: { color: 'rgba(120,140,170,.12)' }, horzLines: { color: 'rgba(120,140,170,.12)' } }, timeScale: { timeVisible: true, secondsVisible: false } })
    series.current = c.addCandlestickSeries({ upColor: '#2ecc8f', downColor: '#ff6d7a', wickUpColor: '#2ecc8f', wickDownColor: '#ff6d7a', borderVisible: false, priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } })
    chart.current = c; return () => { c.remove(); chart.current = null; series.current = null; fitted.current = false }
  }, [digits])
  useEffect(() => {
    if (!series.current || !candles.length) return
    series.current.setData(candles.map((k) => ({ time: Math.floor(k.t / 1000) as UTCTimestamp, open: k.o, high: k.h, low: k.l, close: k.c })))
    if (!fitted.current) { chart.current?.timeScale().fitContent(); fitted.current = true }
  }, [candles, digits])
  useEffect(() => {
    const s = series.current; if (!s) return
    lines.current.forEach((l) => s.removePriceLine(l)); lines.current = levels.map((l) => s.createPriceLine({ price: l.price, color: l.color, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: l.label }))
  }, [levels, digits, candles.length > 0])
  return <div ref={box} style={{ height, width: '100%' }} />
}
