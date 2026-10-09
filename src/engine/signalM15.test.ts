import { describe, it, expect } from 'vitest'
import { signalM15, rsi, ema } from './signalM15'
const mk = (n: number, f: (i: number) => number, step: number) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: i * step, o: c, h: c + 0.0002, l: c - 0.0002, c } })
describe('M15 signal', () => {
  it('ema of a constant is the constant; rsi of pure gains is 100', () => { expect(ema([2, 2, 2], 3).at(-1)).toBe(2); expect(rsi(Array.from({ length: 20 }, (_, i) => i))).toBe(100) })
  const h1 = mk(80, (i) => 1.08 + i * 0.0003, 3600000), m15 = mk(60, (i) => 1.1 + i * 0.00004 + (i % 2) * 0.00012, 900000)
  it('clear uptrend gives a CALL with reasons empty when ready', () => { const r = signalM15({ h1, m15, price: m15.at(-1)!.c, pip: 0.0001, minStrength: 40 }); expect(r.direction).toBe('CALL'); expect(r.inputs.ema50).not.toBeNull(); if (r.ready) expect(r.reasons).toEqual([]) })
  it('price below the H1 EMA50 gives a PUT direction', () => expect(signalM15({ h1, m15, price: 1.0, pip: 0.0001, minStrength: 40 }).direction).toBe('PUT'))
  it('refuses without history and explains why', () => { const r = signalM15({ h1: [], m15: [], price: 1, pip: 0.0001, minStrength: 60 }); expect(r.ready).toBe(false); expect(r.reasons.join()).toContain('H1') })
})
