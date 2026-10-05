import { describe, it, expect } from 'vitest'
import { cyclePnl } from './pnl'
import { atr, normCdf, winProbability, sizing, Candle } from './math'
import { pipValuePerLot } from './pairs'
const base = { stake: 50, payout: 0.95, lots: 0.2, pipValue: 10, costPerLot: 9 }
describe('cycle P&L (95%, $50, 0.2 lots, $1.80 cost)', () => {
  it('TP hit, binary loses', () => expect(cyclePnl({ ...base, exnessPips: 6, binaryWin: false }).net).toBe(-39.8))
  it('+2 pips, no stop, binary wins', () => expect(cyclePnl({ ...base, exnessPips: -2, binaryWin: true }).net).toBe(41.7))
  it('stop hit, no return, binary wins', () => expect(cyclePnl({ ...base, exnessPips: -4, binaryWin: true }).net).toBe(37.7))
  it('stop, counter above entry, outside band', () => expect(cyclePnl({ ...base, exnessPips: -4, binaryWin: true, counter: { win: false } }).net).toBe(-12.3))
  it('stop, counter above entry, inside band (both win)', () => expect(cyclePnl({ ...base, exnessPips: -4, binaryWin: true, counter: { win: true } }).net).toBe(85.2))
  it('counter below entry, inside band (both lose)', () => expect(cyclePnl({ ...base, exnessPips: -4, binaryWin: false, counter: { win: false } }).net).toBe(-109.8))
  it('stop hit, no counter, binary loses', () => expect(cyclePnl({ ...base, exnessPips: -4, binaryWin: false }).net).toBe(-59.8))
})
describe('ATR', () => {
  const mk = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ t: i, o: 1, h: 1.0002, l: 1.0, c: 1.0001 }))
  it('null with too little data', () => expect(atr(mk(10))).toBeNull())
  it('constant 2-pip range gives 0.0002', () => expect(atr(mk(30))!).toBeCloseTo(0.0002, 8))
})
describe('probability model', () => {
  it('Phi(0)=0.5 and Phi(1.96)~0.975', () => { expect(normCdf(0)).toBeCloseTo(0.5, 6); expect(normCdf(1.96)).toBeCloseTo(0.975, 3) })
  it('at entry = 50%', () => expect(winProbability(0, 3.2, 15)).toBeCloseTo(0.5, 6))
  it('+1 sigma = 84.1%', () => expect(winProbability(3.2, 3.2, 15)).toBeCloseTo(0.8413, 3))
  it('less time left makes the same lead safer', () => expect(winProbability(2, 3.2, 3)).toBeGreaterThan(winProbability(2, 3.2, 15)))
  it('expired: decided by sign', () => expect(winProbability(0.5, 3.2, 0)).toBe(1))
})
describe('sizing and pip value', () => {
  it('EURUSD vol 3.2: stop 4, tp 6.1, 0.2 lots', () => { const s = sizing(3.2, 8, 10); expect(s.stopPips).toBe(4); expect(s.tpPips).toBe(6.1); expect(s.lots).toBe(0.2) })
  it('EURUSD pip value = $10', () => expect(pipValuePerLot('EURUSD')).toBeCloseTo(10, 6))
})
