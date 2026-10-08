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
import { summaryText, signalMessage, cycleMessage } from './serverCore'
describe('notification text', () => {
  it('hourly report counts only the last hour', () => {
    const now = Date.UTC(2026, 9, 6, 12, 0), mk = (mins: number, net: number) => ({ id: mins, time: new Date(now - mins * 60000).toISOString(), pair: 'EURUSD', direction: 'CALL' as const, entry: 1, strength: 70, stake: 1, lots: 0.01, binaryResult: 'WIN' as const, exnessResult: 0, costs: 0, netPnl: net, outcomeTag: 'x', source: 'live' as const })
    const t = summaryText([mk(10, 2), mk(50, -1), mk(120, 5)], 22, 22, now, 11)
    expect(t).toContain('Last hour: 2 cycles, +$1.00'); expect(t).toContain('Today: 3 cycles, +$6.00')
  })
  it('signal message shows buy/sell, stop and take profit', () => {
    const m = signalMessage({ time: '2026-10-06T10:00:00.000Z', pair: 'EURUSD', kind: 'TRADE', dir: 'PUT', price: 1.1, strength: 72, vol: 3, stake: 1, lots: 0.01, hedgeSide: 'BUY', sl: 1.0996, tp: 1.1006, stopPips: 4, tpPips: 6, expiry: '2026-10-06T10:15:00.000Z', reasons: [], skipped: 0 })
    expect(m).toContain('SELL (PUT)'); expect(m).toContain('Exness: BUY'); expect(m).toContain('Stop loss 1.09960'); expect(cycleMessage({ id: 1, time: '', pair: 'EURUSD', direction: 'PUT', entry: 1, strength: 1, stake: 1, lots: 1, binaryResult: 'WIN', exnessResult: 0, costs: 0, netPnl: -2.5, outcomeTag: 'stop hit', source: 'live' })).toContain('-$2.50')
  })
})
