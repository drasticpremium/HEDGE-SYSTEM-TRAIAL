import { describe, it, expect } from 'vitest'
import { newState, processCandle, START_USD } from './serverCore'
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
describe('24/7 server engine core', () => {
  const s = newState(); let p = 1.08; const t0 = Date.UTC(2026, 9, 6, 8, 0) // Tuesday 08:00 GMT
  for (let d = 0; d < 4; d++) for (let m = 0; m < 540; m++) {
    const o = p, steps = Array.from({ length: 4 }, () => (p += gauss() * 0.00006)), hi = Math.max(o, ...steps), lo = Math.min(o, ...steps)
    processCandle(s, 'EURUSD', { t: t0 + d * 86400000 + m * 60000, o, h: hi, l: lo, c: p })
  }
  it('records signals and settles cycles', () => { expect(s.signals.length).toBeGreaterThan(0); expect(s.cycles.length).toBeGreaterThan(0) })
  it('never stores two no-trade cards in a row for a pair', () => { for (let i = 1; i < s.signals.length; i++) expect(s.signals[i].kind === 'NO_TRADE' && s.signals[i - 1].kind === 'NO_TRADE').toBe(false) })
  it('balances move by exactly the sum of cycle P&L', () => expect(s.binary + s.exness - 2 * START_USD).toBeCloseTo(s.cycles.reduce((x, c) => x + c.netPnl, 0), 1))
  it('ignores duplicate or old candles', () => { const n = s.candles.EURUSD.length; processCandle(s, 'EURUSD', s.candles.EURUSD[0]); expect(s.candles.EURUSD.length).toBe(n) })
})
