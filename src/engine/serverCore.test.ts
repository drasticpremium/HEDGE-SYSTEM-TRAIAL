import { describe, it, expect } from 'vitest'
import { newState, decide, processCandle, setCapital, clearAuto, signalMessage, cycleMessage, summaryText, type EngineState } from './serverCore'
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
/** Real-data stand-in: a long random walk, fed the same way the server feeds real candles (M1 closes, M15/H1 built from them, decision at each 15-minute open). */
function run(days: number, start = 250) {
  const s = newState(); setCapital(s, start, start); s.settings.minStrength = 40; let p = 1.08
  const t0 = Date.UTC(2026, 9, 5, 0, 0), all: { t: number; o: number; h: number; l: number; c: number }[] = []
  for (let i = 0; i < days * 1440; i++) { const o = p, st = Array.from({ length: 4 }, () => (p += gauss() * 0.00008)); all.push({ t: t0 + i * 60000, o, h: Math.max(o, ...st), l: Math.min(o, ...st), c: p }) }
  const agg = (n: number) => { const out = []; for (let i = n; i <= all.length; i += n) { const g = all.slice(i - n, i); out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[n - 1].c }) } return out }
  const m15 = agg(15), h1 = agg(60)
  all.forEach((c, i) => {
    const end = c.t + 60000
    if (end % 900000 === 0 && new Date(end).getUTCDay() % 6 !== 0 && new Date(end).getUTCHours() >= 8 && new Date(end).getUTCHours() < 17 && !(new Date(end).getUTCHours() === 16 && new Date(end).getUTCMinutes() > 45)) { s.m15.EURUSD = m15.filter((x) => x.t + 900000 <= end).slice(-60); s.h1.EURUSD = h1.filter((x) => x.t + 3600000 <= end).slice(-80); decide(s, 'EURUSD', end, c.c) }
    processCandle(s, 'EURUSD', c)
  })
  return s
}
describe('15-minute auto engine on a random walk', () => {
  const s = run(25)
  it('opens cycles only at 15-minute opens inside the session', () => { expect(s.cycles.length).toBeGreaterThan(0); for (const c of s.cycles) { const open = Date.parse(c.time) - 900000; expect(open % 900000).toBe(0); expect(new Date(open).getUTCHours()).toBeGreaterThanOrEqual(8); expect(new Date(open).getUTCHours()).toBeLessThan(17) } })
  it('payout is drawn between 91% and 95% and net = quotex + exness', () => { for (const c of s.cycles) { expect(c.payout!).toBeGreaterThanOrEqual(0.91); expect(c.payout!).toBeLessThanOrEqual(0.95); expect(c.netPnl).toBeCloseTo((c.binaryPnl ?? 0) + (c.counterPnl ?? 0) + (c.exnessPnl ?? 0), 1) } })
  it('balances move by exactly the sum of net P&L', () => expect(s.binary + s.exness - (s.capital.binary + s.capital.exness)).toBeCloseTo(s.cycles.reduce((x, c) => x + c.netPnl, 0), 0))
  it('no two no-trade cards in a row', () => { for (let i = 1; i < s.signals.length; i++) expect(s.signals[i].kind === 'NO_TRADE' && s.signals[i - 1].kind === 'NO_TRADE').toBe(false) })
  it('stop and take profit are money-based (about $8 and $15 at full size)', () => { const big = run(25, 3000), t = big.signals.find((x) => x.kind === 'TRADE')!; expect(t.lots).toBeLessThanOrEqual(0.2); if (t.scaled === 1) { expect(t.stopUsd!).toBeCloseTo(8, 0); expect(t.tpUsd!).toBeCloseTo(15, 0) } })
  it('a tiny account scales the hedge down instead of failing', () => { const tr = s.signals.filter((x) => x.kind === 'TRADE'); expect(tr.every((x) => x.lots! <= 0.2)).toBe(true); expect(tr.some((x) => x.scaled! < 1)).toBe(true) })
})
describe('admin helpers and messages', () => {
  it('setCapital and clearAuto', () => { const s: EngineState = newState(); setCapital(s, 1100, 550); expect(s.binary).toBeCloseTo(100, 6); expect(s.exness).toBeCloseTo(50, 6); s.binary = 80; s.cycles.push({} as never); clearAuto(s); expect(s.binary).toBeCloseTo(100, 6); expect(s.cycles.length).toBe(0) })
  const row = { time: '2026-10-06T08:15:00.000Z', pair: 'EURUSD', kind: 'TRADE' as const, dir: 'PUT' as const, price: 1.1, strength: 72, vol: 3, stake: 5, lots: 0.2, hedgeSide: 'BUY' as const, sl: 1.0996, tp: 1.10925, stopPips: 4, tpPips: 7.5, stopUsd: 8, tpUsd: 15, scaled: 1, expiry: '2026-10-06T08:30:00.000Z', reasons: [], skipped: 0 }
  it('signal message shows both sides with money stop and take profit', () => { const m = signalMessage(row); expect(m).toContain('QUOTEX: SELL (PUT) $5.00'); expect(m).toContain('EXNESS: BUY 0.20 lots'); expect(m).toContain('-$8.00'); expect(m).toContain('+$15.00') })
  it('cycle message shows each side separately', () => expect(cycleMessage({ id: 1, time: '', pair: 'EURUSD', direction: 'PUT', entry: 1, strength: 1, stake: 5, lots: 0.2, binaryResult: 'LOSS', exnessResult: 15, costs: 1.8, netPnl: 8.2, outcomeTag: 'take-profit hit', source: 'live', binaryPnl: -5, counterPnl: 0, exnessPnl: 13.2 })).toContain('Quotex -$5.00 | Exness +$13.20 | Net +$8.20'))
  it('hourly report counts the last hour only', () => { const now = Date.UTC(2026, 9, 6, 12, 0), mk = (m: number, n: number) => ({ id: m, time: new Date(now - m * 60000).toISOString(), pair: 'EURUSD', direction: 'CALL' as const, entry: 1, strength: 70, stake: 1, lots: 0.01, binaryResult: 'WIN', exnessResult: 0, costs: 0, netPnl: n, outcomeTag: 'x', source: 'live' as const }); const t = summaryText([mk(10, 2), mk(50, -1), mk(120, 5)], 22, 22, now, 11); expect(t).toContain('Last hour: 2 cycles, +$1.00'); expect(t).toContain('Today: 3 cycles, +$6.00') })
})
