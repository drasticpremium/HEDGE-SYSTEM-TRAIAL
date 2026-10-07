import { describe, it, expect } from 'vitest'
import { step, type Cycle, type Dir } from './cycle'
const mk = (dir: Dir = 'CALL'): Cycle => ({ id: 1, pair: 'EURUSD', dir, entry: 1.1, openT: 0, expiryT: 900000, stake: 50, lots: 0.2, pip: 0.0001, pipValue: 10, stopPips: 4, tpPips: 6, strength: 70, payout: 0.95, costPerLot: 9, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null })
// run prices then a final price at expiry; mirror=true flips prices around entry for PUT
const run = (dir: Dir, prices: number[], end: number) => {
  const c = mk(dir), f = (p: number) => (dir === 'CALL' ? p : 2.2 - p)
  prices.forEach((p, i) => step(c, f(p), (i + 1) * 1000))
  return step(c, f(end), 900000).settled!
}
for (const dir of ['CALL', 'PUT'] as Dir[]) describe(`cycle state machine (${dir})`, () => {
  it('TP hit, binary loses = -39.80', () => expect(run(dir, [1.0993], 1.0995).net).toBe(-39.8))
  it('+2 pips, no stop, binary wins = +41.70', () => expect(run(dir, [1.1002], 1.1002).net).toBe(41.7))
  it('stop hit, never returns, binary wins = +37.70', () => expect(run(dir, [1.1005], 1.1005).net).toBe(37.7))
  it('stop, counter above entry, outside band = -12.30', () => expect(run(dir, [1.1005, 1.10004], 1.101).net).toBe(-12.3))
  it('stop, counter, ends inside band (both win) = +85.20', () => expect(run(dir, [1.1005, 1.10004], 1.10002).net).toBe(85.2))
  it('price below entry before counter: no counter, binary loses = -59.80', () => expect(run(dir, [1.1005, 1.0999], 1.0999).net).toBe(-59.8))
  it('max one counter and none under 1 minute left', () => {
    const c = mk(dir), f = (p: number) => (dir === 'CALL' ? p : 2.2 - p)
    step(c, f(1.1005), 1000); step(c, f(1.10004), 850000)
    expect(c.counterState).toBe('cancelled')
  })
})
