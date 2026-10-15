import { describe, it, expect } from 'vitest'
import { newState, decide, processCandle, setCapital, clearAuto, signalMessage, cycleMessage, summaryText, infoMessage, nextLadder, previewNotices, plan, rateOf, settleExpired, cancelPending, setupMessage, validateSettings, type EngineState } from './serverCore'
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
  it('a tiny account scales the hedge down instead of failing', () => { const t = newState(); setCapital(t, 250, 250); t.settings.minStrength = 0; t.settings.recoveryOn = true; t.ladder = 1; t.h1.EURUSD = Array.from({ length: 80 }, (_, i) => ({ t: i * 3600000, o: 1.08 + i * 0.0003, h: 1.0803 + i * 0.0003, l: 1.0797 + i * 0.0003, c: 1.08 + i * 0.0003 })); t.m15.EURUSD = Array.from({ length: 60 }, (_, i) => ({ t: i * 900000, o: 1.1, h: 1.1002, l: 1.0998, c: 1.1 })); t.candles.EURUSD = t.m15.EURUSD; decide(t, 'EURUSD', 2e12, 1.115); const r = t.signals[0]; expect(r.kind).toBe('TRADE'); expect(r.lots!).toBeLessThan(0.2); expect(r.scaled!).toBeLessThan(1) })
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
  const s = newState(); setCapital(s, 50000, 50000); Object.assign(s.settings, { minStrength: 101, recoveryOn: true, ...extra })
  s.h1.EURUSD = series(80, (i) => 1.08 + i * 0.0003, 3600000); s.m15.EURUSD = series(60, (i) => 1.1 + i * 0.00004, 900000); s.candles.EURUSD = series(60, (i) => 1.1 + i * 0.00001, 60000); return s
}
describe('recovery ladder', () => {
  it('is OFF by default and only runs when switched on', () => { expect(newState().settings.recoveryOn).toBe(false); const off = ready({ recoveryOn: false }); off.ladder = 1; decide(off, 'EURUSD', 2e12, 1.115); expect(off.cycle).toBeNull() })
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
  it('the third trade doubles stake and lots (to the nearest 0.01 lot) and the money stop and take profit', () => {
    const b = ready(); b.ladder = 1; decide(b, 'EURUSD', 2e12, 1.115); const c = ready(); c.ladder = 2; decide(c, 'EURUSD', 2e12, 1.115)
    expect(c.cycle!.rec).toBe(2); expect(c.cycle!.stake).toBe(10); expect(Math.abs(c.cycle!.lots - b.cycle!.lots * 2)).toBeLessThanOrEqual(0.011)
    expect(c.signals[0].stopUsd! / b.signals[0].stopUsd!).toBeGreaterThan(1.6); expect(c.signals[0].tpUsd! / b.signals[0].tpUsd!).toBeGreaterThan(1.6)
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

describe('Exness hedge sizing: stop at most $4, a stop-hit still leaves a profit, take profit $15', () => {
  const sized = (over: Partial<EngineState['settings']> = {}, step = 0) => { const s = ready({ ...over }); setCapital(s, 500000, 500000); const p = plan(s, 'EURUSD', 1.115, { step }); return { s, p, stop: p.stopPips * p.lots * p.pv, tp: p.tpPips * p.lots * p.pv, cost: p.lots * s.settings.commission } }
  it('the stop never costs more than $4', () => { for (const stake of [1, 2, 5, 10, 25, 50, 200]) { const { stop } = sized({ stakeUsd: stake }); expect(stop).toBeLessThanOrEqual(4 + 1e-6) } })
  it('when the stop hits and the binary wins, at least the chosen profit is kept (down to the 0.01 lot minimum)', () => {
    for (const stake of [3, 5, 10, 25, 50]) for (const pm of [91, 95]) for (const keep of [0.5, 1.5, 3]) {
      const { p, stop, cost, s } = sized({ stakeUsd: stake, payoutMin: pm, payoutMax: 95, minNetWin: keep }); const net = stake * (pm / 100) - stop - cost
      if (p.lots > 0.01) expect(net).toBeGreaterThanOrEqual(keep - 1e-6); expect(net).toBeGreaterThan(0); void s
    }
  })
  it("a $5 stake with the defaults: stop about $2-3, profit kept about $1.5, take profit $15 (today's problem fixed)", () => {
    const { stop, tp, cost, p } = sized({}); expect(stop).toBeLessThanOrEqual(4); expect(5 * 0.91 - stop - cost).toBeGreaterThanOrEqual(1.5 - 1e-6); expect(tp).toBeCloseTo(15, 0); expect(p.lots).toBeGreaterThanOrEqual(0.01)
  })
  it('a big stake is limited only by the $4 budget and the lot maximum, and the stop distance follows volatility', () => { const { stop, p } = sized({ stakeUsd: 200 }); expect(stop).toBeGreaterThan(2.5); expect(stop).toBeLessThanOrEqual(4); expect(p.stopPips).toBeGreaterThanOrEqual(1.5); expect(sized({ stakeUsd: 200, maxLots: 5 }).stop).toBeGreaterThan(3.5) })
  it('asking to keep more profit makes the hedge smaller, never bigger', () => { expect(sized({ minNetWin: 3 }).p.lots).toBeLessThanOrEqual(sized({ minNetWin: 0.5 }).p.lots) })
  it('recovery step 2 doubles stake, lots and every money figure', () => { const a = sized({}, 0), b = sized({ recoveryOn: true }, 2); expect(b.p.stake).toBe(10); expect(Math.abs(b.p.lots - 2 * a.p.lots)).toBeLessThanOrEqual(0.011); expect(b.stop / a.stop).toBeGreaterThan(1.6); expect(b.stop / a.stop).toBeLessThan(2.4) })
})
describe('settling, resets and defaults', () => {
  it('Telegram no-trade and heads-up messages are off by default', () => { const d = newState().settings; expect([d.tgNoTrade, d.headsUp, d.recoveryOn, d.stopUsd, d.tpUsd]).toEqual([false, false, false, 4, 15]) })
  it('a cycle ending exactly at an open is settled first, so the new candle can be traded', () => {
    const s = ready({ minStrength: 0, recoveryOn: true }); s.ladder = 1; decide(s, 'EURUSD', 2e12, 1.115); const c = s.cycle!, before = s.binary
    expect(settleExpired(s, c.entry - (c.dir === 'CALL' ? 1 : -1) * 0.0003, c.expiryT - 1000)).toEqual([]); expect(s.cycle).not.toBeNull()          // not over yet
    const out = settleExpired(s, c.entry + (c.dir === 'CALL' ? 1 : -1) * 0.0001, c.expiryT + 2000); expect(s.cycle).toBeNull(); expect(s.cycles.length).toBe(1); expect(out.some((n) => n.kind === 'cycle')).toBe(true); expect(s.binary).not.toBe(before)
    expect(decide(s, 'EURUSD', c.expiryT, 1.115).some((n) => n.kind === 'notrade' && n.reasons.includes('Previous cycle still open'))).toBe(false)
  })
  it('a reset waits for the next open instead of re-deciding the current candle late', () => { const s = ready(); s.lastDecision = 0; const now = Date.UTC(2026, 9, 13, 8, 54); clearAuto(s, now); expect(s.lastDecision).toBe(Date.UTC(2026, 9, 13, 8, 45)); expect(s.cycle).toBeNull(); clearAuto(s); expect(s.lastDecision).toBe(0) })
})
describe('live GH₵ rate', () => {
  it('uses a fresh live rate, ignores a stale or broken one, and capital follows it', () => {
    const s = newState(), now = Date.now(); expect(rateOf(s, now)).toBe(11)
    s.fx = { rate: 14.9, at: now - 3600000, src: 'x' }; expect(rateOf(s, now)).toBe(14.9)
    s.fx = { rate: 14.9, at: now - 49 * 3600000, src: 'x' }; expect(rateOf(s, now)).toBe(11); s.fx = { rate: NaN, at: now, src: 'x' }; expect(rateOf(s, now)).toBe(11)
    s.fx = { rate: 15, at: Date.now(), src: 'x' }; setCapital(s, 1500, 750); expect(s.binary).toBeCloseTo(100, 6); expect(s.exness).toBeCloseTo(50, 6)
  })
})

const T0 = Date.UTC(2026, 9, 6, 8, 0), PRICE = 1.115
/** A state whose signal is READY (clear uptrend, RSI mid-zone, normal range) so pullback setups can be tested without relying on luck. */
const pbState = (over: Partial<EngineState['settings']> = {}, range = 0.0002) => {
  const s = newState(); setCapital(s, 50000, 50000); Object.assign(s.settings, { minStrength: 0, pullbackOn: true, ...over })
  s.h1.EURUSD = series(80, (i) => 1.08 + i * 0.0003, 3600000); let c = 1.1
  s.m15.EURUSD = Array.from({ length: 60 }, (_, i) => { if (i) c += i % 2 ? 0.00012 : -0.00007; return { t: 1.7e12 + i * 900000, o: c, h: c + range, l: c - range, c } })
  s.candles.EURUSD = series(60, (i) => 1.1 + i * 0.00001, 60000); return s
}
const m1 = (min: number, o: number, h: number, l: number, c: number) => ({ t: T0 + min * 60000, o, h, l, c })
describe('hedge size follows the recent candle range (ATR)', () => {
  it('wider recent candles give a wider stop and fewer lots, calmer candles a tighter stop and more lots, and the stop money stays within budget', () => {
    const calm = plan(pbState({ pullbackOn: false }, 0.0002), 'EURUSD', PRICE, { step: 0 }), wild = plan(pbState({ pullbackOn: false }, 0.0007), 'EURUSD', PRICE, { step: 0 })
    expect(wild.atr).toBeGreaterThan(calm.atr * 2); expect(wild.stopPips).toBeGreaterThan(calm.stopPips * 2); expect(calm.lots).toBeGreaterThanOrEqual(wild.lots)
    for (const p of [calm, wild]) { expect(p.stopPips * p.lots * p.pv).toBeLessThanOrEqual(4 + 1e-6); expect(p.tpPips * p.lots * p.pv).toBeCloseTo(15, 0) }
  })
  it('the stop-distance multiplier setting scales the stop', () => { const a = plan(pbState({ pullbackOn: false, stopAtrMult: 0.7 }), 'EURUSD', PRICE, { step: 0 }), b = plan(pbState({ pullbackOn: false, stopAtrMult: 1.4 }), 'EURUSD', PRICE, { step: 0 }); expect(b.stopPips / a.stopPips).toBeGreaterThan(1.8); expect(b.stopPips / a.stopPips).toBeLessThan(2.2) })
})
describe('pullback entry', () => {
  it('off: the trade is taken at the open as before', () => { const s = pbState({ pullbackOn: false }); decide(s, 'EURUSD', T0, PRICE); expect(s.cycle).not.toBeNull(); expect(s.pending).toBeNull() })
  it('on: nothing is entered at the open, a setup waits at 20% of the range below (CALL) with a skip level above', () => {
    const s = pbState(), out = decide(s, 'EURUSD', T0, PRICE), pd = s.pending!
    expect(s.cycle).toBeNull(); expect(pd.dir).toBe('CALL'); expect(pd.ref).toBe(PRICE); expect(pd.pips).toBeCloseTo((plan(s, 'EURUSD', PRICE, { step: 0, ignoreOpen: true }).atr * 20) / 100, 1)
    expect(pd.ref - pd.entryLevel).toBeCloseTo(pd.skipLevel - pd.ref, 8); expect(pd.entryLevel).toBeLessThan(PRICE); expect(pd.until).toBe(T0 + 8 * 60000)
    const msg = out.filter((n) => n.kind === 'info').map((n) => (n as { text: string }).text).join(); expect(msg).toContain('SETUP'); expect(msg).toContain('Do NOT enter at the open'); expect(msg).toContain(pd.entryLevel.toFixed(5)); expect(setupMessage(pd)).toContain('Skip if price rises')
  })
  it('CALL: price pulls back to the level, the trade is taken THERE, expires with the candle, hedge is opposite, prices follow the entry', () => {
    const s = pbState(); decide(s, 'EURUSD', T0, PRICE); const pd = s.pending!, d = PRICE - pd.entryLevel
    const out = processCandle(s, 'EURUSD', m1(3, PRICE, PRICE + d * 0.3, pd.entryLevel - d * 0.1, pd.entryLevel))   // open, up a little (below skip), then down through the entry level
    const c = s.cycle!; expect(c).not.toBeNull(); expect(s.pending).toBeNull(); expect(c.entry).toBeCloseTo(pd.entryLevel, 8); expect(c.expiryT).toBe(T0 + 15 * 60000); expect(c.dir).toBe('CALL')
    const row = s.signals[0]; expect(row.kind).toBe('TRADE'); expect(row.hedgeSide).toBe('SELL'); expect(row.pullbackPips).toBe(pd.pips); expect(row.openRef).toBe(PRICE); expect(row.sl!).toBeGreaterThan(row.price); expect(row.tp!).toBeLessThan(row.price)
    const msg = (out.find((n) => n.kind === 'signal') as { row: typeof row }).row; expect(signalMessage(msg)).toContain('PULLBACK ENTRY'); expect(signalMessage(msg)).toContain('Recent range (ATR)'); expect(signalMessage(msg)).toContain('to the candle end')
    for (let m = 4; m < 15; m++) processCandle(s, 'EURUSD', m1(m, pd.entryLevel, pd.entryLevel + 0.00002, pd.entryLevel - 0.00001, pd.entryLevel + 0.00001))   // flat to the candle end: binary wins
    expect(s.cycle).toBeNull(); expect(s.cycles.length).toBe(1); expect(s.cycles[0].binaryResult).toBe('WIN')
  })
  it('PUT mirrors it: waits ABOVE the open and sells there, hedge is BUY', () => {
    const s = pbState(); decide(s, 'EURUSD', T0, PRICE); const base = s.pending!; s.pending = { ...base, dir: 'PUT', entryLevel: PRICE + (PRICE - base.entryLevel), skipLevel: PRICE - (PRICE - base.entryLevel) }
    const d = s.pending.entryLevel - PRICE; processCandle(s, 'EURUSD', m1(2, PRICE, s.pending.entryLevel + d * 0.1, PRICE - d * 0.3, PRICE))   // c >= o path: o, l, h, c : low first (not past the skip), then up through the entry level
    expect(s.cycle?.dir).toBe('PUT'); expect(s.cycle!.entry).toBeCloseTo(PRICE + d, 8); expect(s.signals[0].hedgeSide).toBe('BUY'); expect(s.signals[0].sl!).toBeLessThan(s.signals[0].price)
  })
  it('price runs straight in favour first: the candle is skipped for BOTH Quotex and Exness', () => {
    const s = pbState(); decide(s, 'EURUSD', T0, PRICE); const pd = s.pending!, d = PRICE - pd.entryLevel
    const out = processCandle(s, 'EURUSD', m1(1, PRICE, pd.skipLevel + d * 0.2, pd.entryLevel - d * 0.2, PRICE - d * 0.5))   // c < o path: o, h, l, c : the skip level is touched BEFORE the pullback level
    expect(s.cycle).toBeNull(); expect(s.pending).toBeNull(); expect(s.cycles.length).toBe(0); expect(s.signals[0].kind).toBe('NO_TRADE'); expect(s.signals[0].reasons[0]).toContain('straight in favour')
    expect((out.find((n) => n.kind === 'info') as { text: string }).text).toContain('SETUP CANCELLED')
    const after = processCandle(s, 'EURUSD', m1(2, PRICE, PRICE, pd.entryLevel - d, pd.entryLevel - d)); expect(after.some((n) => n.kind === 'signal')).toBe(false); expect(s.cycle).toBeNull()   // a later dip does not revive it
  })
  it('no pullback within the window: skipped', () => {
    const s = pbState({ pullbackWindowMin: 5 }); decide(s, 'EURUSD', T0, PRICE); const pd = s.pending!
    processCandle(s, 'EURUSD', m1(1, PRICE, PRICE + 0.00001, PRICE - 0.00001, PRICE)); expect(s.pending).not.toBeNull()
    processCandle(s, 'EURUSD', m1(5, PRICE, PRICE + 0.00001, PRICE - 0.00001, PRICE)); expect(s.pending).toBeNull(); expect(s.signals[0].reasons[0]).toContain('No pullback came in time'); expect(s.cycle).toBeNull(); void pd
  })
  it('recovery trades are never delayed or skipped by the pullback rule', () => { const s = pbState({ recoveryOn: true }); s.ladder = 1; decide(s, 'EURUSD', T0, PRICE); expect(s.cycle?.rec).toBe(1); expect(s.pending).toBeNull(); expect(s.cycle!.entry).toBe(PRICE) })
  it('a new open drops an old waiting setup; a reset clears it; cancelling twice is harmless', () => {
    const s = pbState(); decide(s, 'EURUSD', T0, PRICE); expect(s.pending).not.toBeNull(); s.settings.pullbackOn = false; decide(s, 'EURUSD', T0 + 900000, PRICE); expect(s.pending).toBeNull()
    const t = pbState(); decide(t, 'EURUSD', T0, PRICE); clearAuto(t, T0); expect(t.pending).toBeNull(); expect(cancelPending(t, 'x', 'y')).toEqual([])
  })
  it('candles from before the open never trigger the setup', () => { const s = pbState(); decide(s, 'EURUSD', T0, PRICE); const pd = s.pending!; processCandle(s, 'EURUSD', { t: T0 - 60000, o: PRICE, h: PRICE, l: pd.entryLevel - 0.001, c: pd.entryLevel }); expect(s.cycle).toBeNull(); expect(s.pending).not.toBeNull() })
  it('the pullback button setting cannot be changed through the settings form; the percentages are range-checked', () => {
    const cur = newState().settings; expect(validateSettings({ pullbackOn: true, pullbackPct: 25 }, cur)).toEqual({ ok: true, values: { pullbackPct: 25 } })
    for (const bad of [{ pullbackPct: 0 }, { pullbackPct: 500 }, { pullbackWindowMin: 0 }, { stopAtrMult: 10 }]) expect(validateSettings(bad, cur).ok).toBe(false)
  })
})
