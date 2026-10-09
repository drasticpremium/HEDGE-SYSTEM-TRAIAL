import { describe, it, expect } from 'vitest'
import { parseSignal } from './signalParser'
import { newCopy, addCopy, processCopyCandle, pnlUsd } from './copyCore'
describe('signal parser', () => {
  it('reads a typical Telegram forex signal', () => { const p = parseSignal('🔥 GBP/JPY SELL NOW\nEntry: 190.250\nSL 190.650\nTP1: 189.900\nTP2 189.500\nTP3 : 189.000\nLots 0.05'); expect(p).toMatchObject({ pair: 'GBPJPY', side: 'SELL', entry: 190.25, sl: 190.65, tps: [189.9, 189.5, 189], lots: 0.05 }) })
  it('reads gold with comma decimals and buy limit', () => { const p = parseSignal('GOLD BUY LIMIT @ 2,350.50\nStop loss 2345,00\nTake profit 2360'); expect(p).toMatchObject({ pair: 'XAUUSD', side: 'BUY', type: 'LIMIT', entry: 2350.5, sl: 2345, tps: [2360] }) })
  it('reads TP with no index', () => expect(parseSignal('EURUSD BUY 1.0850 SL 1.0820 TP 1.0900').tps).toEqual([1.09]))
  it('reports missing fields as null', () => expect(parseSignal('hello there')).toMatchObject({ pair: null, side: null, entry: null, sl: null, tps: [] }))
})
describe('copy ledger', () => {
  const k = (t: number, o: number, h: number, l: number, c: number) => ({ t, o, h, l, c })
  it('market buy hits TP1 then TP2 with partial closes, own balance only', () => {
    const c = newCopy(1000), t = addCopy(c, { pair: 'EURUSD', side: 'BUY', type: 'AUTO', entry: 1.1, sl: 1.098, tps: [1.102, 1.104], lots: 0.1 }, 1.1, 'x', 1)
    expect(t.status).toBe('OPEN'); processCopyCandle(c, 'EURUSD', k(1, 1.1, 1.1025, 1.0999, 1.102)); expect(t.tpHit).toBe(1)
    processCopyCandle(c, 'EURUSD', k(2, 1.102, 1.1045, 1.1015, 1.104)); expect(t.status).toBe('CLOSED')
    expect(t.realized).toBeCloseTo(pnlUsd('EURUSD', 0.002, 0.05) + pnlUsd('EURUSD', 0.004, 0.05), 6); expect(c.balance).toBeCloseTo(1000 + t.realized, 6)
  })
  it('stop wins when stop and target are inside one candle', () => { const c = newCopy(1000), t = addCopy(c, { pair: 'EURUSD', side: 'SELL', type: 'AUTO', entry: 1.1, sl: 1.102, tps: [1.098], lots: 0.1 }, 1.1, 'x', 1); processCopyCandle(c, 'EURUSD', k(1, 1.1, 1.103, 1.097, 1.1)); expect(t.exit).toBe('SL'); expect(t.realized).toBeLessThan(0) })
  it('far entry becomes a pending limit and fills only when touched', () => { const c = newCopy(1000), t = addCopy(c, { pair: 'EURUSD', side: 'BUY', type: 'AUTO', entry: 1.09, sl: 1.08, tps: [1.1], lots: 0.1 }, 1.1, 'x', 1); expect(t.type).toBe('LIMIT'); processCopyCandle(c, 'EURUSD', k(1, 1.1, 1.1, 1.095, 1.096)); expect(t.status).toBe('PENDING'); processCopyCandle(c, 'EURUSD', k(2, 1.096, 1.096, 1.0895, 1.09)); expect(t.status).toBe('OPEN') })
})
