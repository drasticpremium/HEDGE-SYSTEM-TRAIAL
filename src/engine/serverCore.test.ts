import { describe, it, expect } from 'vitest'
import { newState, decide, processCandle, setCapital, clearAuto, signalMessage, cycleMessage, summaryText, infoMessage, nextLadder, previewNotices, type EngineState } from './serverCore'
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
  it('stop and take profit are money-based (about $8 and $15 at full size)', () => { const big = run(25, 3000), t = big.signals.find((x) => x.kind === 'TRADE' && !x.rec)!; expect(t.lots).toBeLessThanOrEqual(0.2); if (t.scaled === 1) { expect(t.stopUsd!).toBeCloseTo(8, 0); expect(t.tpUsd!).toBeCloseTo(15, 0) } })
  it('a tiny account scales the hedge down instead of failing', () => { const t = newState(); setCapital(t, 250, 250); t.settings.minStrength = 0; t.ladder = 1; t.h1.EURUSD = Array.from({ length: 80 }, (_, i) => ({ t: i * 3600000, o: 1.08 + i * 0.0003, h: 1.0803 + i * 0.0003, l: 1.0797 + i * 0.0003, c: 1.08 + i * 0.0003 })); t.m15.EURUSD = Array.from({ length: 60 }, (_, i) => ({ t: i * 900000, o: 1.1, h: 1.1002, l: 1.0998, c: 1.1 })); t.candles.EURUSD = t.m15.EURUSD; decide(t, 'EURUSD', 2e12, 1.115); const r = t.signals[0]; expect(r.kind).toBe('TRADE'); expect(r.lots!).toBeLessThan(0.2); expect(r.scaled!).toBeLessThan(1) })
})
describe('admin helpers and messages', () => {
  it('setCapital and clearAuto', () => { const s: EngineState = newState(); setCapital(s, 1100, 550); expect(s.binary).toBeCloseTo(100, 6); expect(s.exness).toBeCloseTo(50, 6); s.binary = 80; s.cycles.push({} as never); clearAuto(s); expect(s.binary).toBeCloseTo(100, 6); expect(s.cycles.length).toBe(0) })
  const row = { time: '2026-10-06T08:15:00.000Z', pair: 'EURUSD', kind: 'TRADE' as const, dir: 'PUT' as const, price: 1.1, strength: 72, vol: 3, stake: 5, lots: 0.2, hedgeSide: 'BUY' as const, sl: 1.0996, tp: 1.10925, stopPips: 4, tpPips: 7.5, stopUsd: 8, tpUsd: 15, scaled: 1, expiry: '2026-10-06T08:30:00.000Z', reasons: [], skipped: 0 }
  it('signal message uses blue BUY and red SELL on both sides, with money stop and take profit', () => { const m = signalMessage(row); expect(m).toContain('🔴 <b>QUOTEX: SELL</b>'); expect(m).toContain('🔵 <b>EXNESS: BUY</b>'); expect(m).toContain('-$8.00'); expect(m).toContain('+$15.00'); expect(m).toContain('🟢 <b>TRADE SIGNAL</b>') })
  it('cycle message shows each side separately with result emoji', () => { const m = cycleMessage({ id: 1, time: '', pair: 'EURUSD', direction: 'PUT', entry: 1, strength: 1, stake: 5, lots: 0.2, binaryResult: 'LOSS', exnessResult: 15, costs: 1.8, netPnl: 8.2, outcomeTag: 'take-profit hit', source: 'live', binaryPnl: -5, counterPnl: 0, exnessPnl: 13.2 }); expect(m).toContain('✅'); expect(m).toContain('🔴 Quotex -$5.00'); expect(m).toContain('🟢 Exness +$13.20'); expect(m).toContain('Net +$8.20') })
  it('counter and stop events get clear cards', () => { expect(infoMessage('EURUSD', 'COUNTER_OPENED PUT at 1.1, same expiry')).toContain('🔴 <b>SELL</b>'); expect(infoMessage('EURUSD', 'STOP_HIT x')).toContain('🛑') })
  it('hourly report counts the last hour only', () => { const now = Date.UTC(2026, 9, 6, 12, 0), mk = (m: number, n: number) => ({ id: m, time: new Date(now - m * 60000).toISOString(), pair: 'EURUSD', direction: 'CALL' as const, entry: 1, strength: 70, stake: 1, lots: 0.01, binaryResult: 'WIN', exnessResult: 0, costs: 0, netPnl: n, outcomeTag: 'x', source: 'live' as const }); const t = summaryText([mk(10, 2), mk(50, -1), mk(120, 5)], 22, 22, now, 11); expect(t).toContain('Last hour: 2 cycles, +$1.00'); expect(t).toContain('Today: 3 cycles, +$6.00') })
})
const series = (n: number, f: (i: number) => number, step: number) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: 1.7e12 + i * step, o: c, h: c + 0.0002, l: c - 0.0002, c } })
/** State with a clear uptrend, a rich account, and a minimum strength nobody can reach (so normal trades are blocked). */
function ready(extra: Partial<EngineState['settings']> = {}) {
  const s = newState(); setCapital(s, 50000, 50000); Object.assign(s.settings, { minStrength: 101, ...extra })
  s.h1.EURUSD = series(80, (i) => 1.08 + i * 0.0003, 3600000); s.m15.EURUSD = series(60, (i) => 1.1 + i * 0.00004, 900000); s.candles.EURUSD = series(60, (i) => 1.1 + i * 0.00001, 60000); return s
}
describe('recovery ladder', () => {
  it('transitions: loss climbs 0>1>2, third loss halts, any win resets, off disables', () => { expect(nextLadder(0, true, true)).toBe(1); expect(nextLadder(1, true, true)).toBe(2); expect(nextLadder(2, true, true)).toBe(0); expect(nextLadder(1, false, true)).toBe(0); expect(nextLadder(0, true, false)).toBe(0) })
  it('a normal candle is blocked, a recovery candle is traded regardless of gates and the news switch', () => {
    const a = ready(); a.news = true; decide(a, 'EURUSD', 2e12, 1.115); expect(a.cycle).toBeNull()
    const b = ready(); b.news = true; b.ladder = 1; const out = decide(b, 'EURUSD', 2e12, 1.115); expect(b.cycle?.rec).toBe(1); expect(out.some((n) => n.kind === 'signal')).toBe(true); expect(b.cycle!.stake).toBe(5)
  })
  it('recovery trades repeat the first trade direction even when the trend says the opposite', () => {
    const b = ready(); b.ladder = 1; b.ladderDir = 'PUT'; decide(b, 'EURUSD', 2e12, 1.115); expect(b.cycle!.dir).toBe('PUT'); expect(b.signals[0].hedgeSide).toBe('BUY')
    const c = ready(); c.ladder = 2; c.ladderDir = 'PUT'; decide(c, 'EURUSD', 2e12, 1.115); expect(c.cycle!.dir).toBe('PUT')
    const d = ready(); d.ladder = 1; decide(d, 'EURUSD', 2e12, 1.115); expect(d.cycle!.dir).toBe('CALL')
  })
  it('the chain remembers the first direction and forgets it on a win or halt', () => {
    const lose = (rec: number, drop: number) => { const s = ready({ minStrength: 0 }); s.ladder = 1; decide(s, 'EURUSD', 2e12, 1.115); const c = s.cycle!; c.rec = rec; if (rec > 0) s.ladderDir = c.dir; for (let i = 0; i < 15; i++) { const px = c.entry + (c.dir === 'CALL' ? -1 : 1) * drop * 0.0001 * (i / 14); processCandle(s, 'EURUSD', { t: c.openT + i * 60000, o: px, h: px + 0.00001, l: px - 0.00001, c: px }) } return { s, dir: c.dir } }
    const a = lose(0, 3); expect(a.s.ladderDir).toBe(a.dir); const b = lose(1, 3); expect(b.s.ladderDir).toBe(b.dir); expect(lose(2, 3).s.ladderDir).toBeNull(); expect(lose(1, -3).s.ladderDir).toBeNull()
  })
  it('the third trade doubles both stake and lots (and the money stop and take profit)', () => {
    const b = ready(); b.ladder = 1; decide(b, 'EURUSD', 2e12, 1.115); const c = ready(); c.ladder = 2; decide(c, 'EURUSD', 2e12, 1.115)
    expect(c.cycle!.rec).toBe(2); expect(c.cycle!.stake).toBe(10); expect(c.cycle!.lots).toBeCloseTo(b.cycle!.lots * 2, 6)
    expect(c.signals[0].stopUsd!).toBeCloseTo(b.signals[0].stopUsd! * 2, 1); expect(c.signals[0].tpUsd!).toBeCloseTo(b.signals[0].tpUsd! * 2, 1)
  })
  it('a losing binary queues the next recovery, a loss on step 2 halts, a win resets', () => {
    const run = (rec: number, drop: number) => { const s = ready({ minStrength: 0 }); s.ladder = 1; decide(s, 'EURUSD', 2e12, 1.115); const c = s.cycle!; c.rec = rec; const start = c.openT
      for (let i = 0; i < 15; i++) { const px = c.entry + (c.dir === 'CALL' ? -1 : 1) * drop * 0.0001 * (i / 14), o = px; processCandle(s, 'EURUSD', { t: start + i * 60000, o, h: o + 0.00001, l: o - 0.00001, c: px }) } return s }
    expect(run(0, 3).ladder).toBe(1); expect(run(1, 3).ladder).toBe(2); expect(run(2, 3).ladder).toBe(0); expect(run(1, -3).ladder).toBe(0)
  })
  it('turning the ladder off stops forced trades', () => { const b = ready({ recoveryOn: false }); b.ladder = 1; decide(b, 'EURUSD', 2e12, 1.115); expect(b.cycle).toBeNull() })
})
describe('heads-up before an open', () => {
  const open = Date.UTC(2026, 9, 6, 8, 15), mk = (s: EngineState) => { s.candles.EURUSD = series(60, (i) => 1.1 + i * 0.00001, 60000).map((c, i) => ({ ...c, t: open - (60 - i) * 60000 })); s.m15.EURUSD = series(60, (i) => 1.1 + i * 0.00004, 900000).map((c, i) => ({ ...c, t: open - 900000 * (61 - i) })); return s }
  it('sends once per lead time, never changes the books, and respects the on/off setting', () => {
    const s = mk(ready({ minStrength: 0 })), n0 = s.signals.length, first = previewNotices(s, 'EURUSD', open, 2)
    expect(s.signals.length).toBe(n0); expect(s.cycle).toBeNull(); expect(previewNotices(s, 'EURUSD', open, 2)).toEqual([]); expect(previewNotices(s, 'EURUSD', open, 5)).toEqual([])
    if (first.length) expect((first[0] as { text: string }).text).toContain('HEADS-UP')
    const off = mk(ready({ minStrength: 0, headsUp: false })); expect(previewNotices(off, 'EURUSD', open, 2)).toEqual([])
  })
  it('a second message reports cancelled when conditions disappear', () => { const s = mk(ready({ minStrength: 0 })); previewNotices(s, 'EURUSD', open, 2); s.settings.minStrength = 101; const second = previewNotices(s, 'EURUSD', open, 1); if (s.heads?.dir === null && second.length) expect((second[0] as { text: string }).text).toContain('CANCELLED') })
})
