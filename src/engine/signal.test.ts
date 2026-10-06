import { describe, expect, it } from 'vitest'
import { buildDeskTicket, calculateSignal } from './signal'

describe('signal engine', () => {
  it('returns a ready signal when trend and momentum agree', () => {
    const now = Date.now()
    const m1 = Array.from({ length: 60 }, (_, i) => ({
      t: now - (60 - i) * 60000,
      o: 1.084 + i * 0.00003,
      h: 1.0842 + i * 0.00003,
      l: 1.0838 + i * 0.00003,
      c: 1.0841 + i * 0.00003,
    }))
    const signal = calculateSignal({ pair: 'EURUSD', price: 1.0841, m1, m5: m1.slice(0, 30), spreadPips: 0.8, atrPips: 3.2, vol15: 3.2 })
    expect(signal.ready).toBe(true)
    expect(signal.strength).toBeGreaterThanOrEqual(60)
    expect(['CALL', 'PUT']).toContain(signal.direction)
  })

  it('builds a desk ticket with the right fields', () => {
    const ticket = buildDeskTicket({
      pair: 'EURUSD',
      direction: 'PUT',
      strength: 78,
      stake: 12,
      entry: 1.08432,
      stop: 1.08392,
      takeProfit: 1.08493,
      expiryMinutesLeft: 14.53,
      lots: 0.2,
      expiresAt: Date.now() + 10 * 1000,
    })

    expect(ticket).toContain('SIGNAL READY')
    expect(ticket).toContain('PUT EUR/USD')
    expect(ticket).toContain('stake $12')
    expect(ticket).toContain('Exness')
  })
})
