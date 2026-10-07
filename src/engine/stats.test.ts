import { describe, it, expect } from 'vitest'
import { wilson, maxDrawdown, cumulative, breakEven } from './stats'
describe('stats', () => {
  it('wilson 50/100 is about 40.4%-59.6%', () => { const [a, b] = wilson(50, 100)!; expect(a).toBeCloseTo(0.404, 2); expect(b).toBeCloseTo(0.596, 2) })
  it('wilson with no samples is null', () => expect(wilson(0, 0)).toBeNull())
  it('max drawdown', () => expect(maxDrawdown(cumulative([5, -3, -4, 2, 10, -1]))).toBe(7))
  it('break-even at 95% payout = 51.3%', () => expect(breakEven(0.95)).toBeCloseTo(0.5128, 3))
})
