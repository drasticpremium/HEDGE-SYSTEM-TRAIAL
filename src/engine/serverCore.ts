import type { Candle } from './math'
import { step, type Cycle } from './cycle'
import { evaluateSignal, isTradingSession } from './evaluate'
import { pipSize, pipValuePerLot } from './pairs'
import type { CycleLogRow, SignalRow } from '../db/db'
/** Pure 24/7 engine logic (no Cloudflare APIs) so it can be unit tested. Each account starts at GH₵250 (at 11 GH₵ per USD). */
export const START_USD = 250 / 11
export interface EngineState {
  enabled: boolean; news: boolean; binary: number; exness: number; status: string; lastTick: number; lastOpenT: number; nextId: number
  candles: Record<string, Candle[]>; prices: Record<string, number>; cycle: Cycle | null; cycles: CycleLogRow[]; signals: SignalRow[]; credits: { day: string; n: number }
}
export const newState = (): EngineState => ({ enabled: true, news: false, binary: START_USD, exness: START_USD, status: 'Starting', lastTick: 0, lastOpenT: 0, nextId: 1, candles: {}, prices: {}, cycle: null, cycles: [], signals: [], credits: { day: '', n: 0 } })
const P = { stakePct: 2, minStake: 1, hedgeRiskRatio: 0.16, commission: 9 }

/** Feed one CLOSED 1-minute candle: steps any open trade, records the signal (one red card per no-trade run), opens a new trade if every condition is green. */
export function processCandle(s: EngineState, pair: string, c: Candle) {
  const arr = (s.candles[pair] ??= [])
  if (arr.length && arr[arr.length - 1].t >= c.t) return
  arr.push(c); if (arr.length > 400) arr.shift(); s.prices[pair] = c.c
  const end = c.t + 60000, time = new Date(end).toISOString()
  if (s.cycle && s.cycle.pair === pair) {
    const path = c.c >= c.o ? [c.o, c.l, c.h, c.c] : [c.o, c.h, c.l, c.c]
    for (let i = 0; i < 4 && s.cycle; i++) {
      const cy = s.cycle, r = step(cy, path[i], i === 3 ? end : c.t + (i + 1) * 15000)
      if (r.settled) {
        const x = r.settled; s.binary += x.binary + x.counter; s.exness += x.exness - x.cost
        s.cycles.unshift({ id: cy.id, time, pair, direction: cy.dir, entry: cy.entry, strength: cy.strength, stake: cy.stake, lots: cy.lots, binaryResult: x.binaryWin ? 'WIN' : 'LOSS', counterResult: x.counterWin === null ? undefined : x.counterWin ? 'WIN' : 'LOSS', exnessResult: +x.exness.toFixed(2), costs: +x.cost.toFixed(2), netPnl: x.net, outcomeTag: x.tag, source: 'live' })
        if (s.cycles.length > 400) s.cycles.pop(); s.cycle = null
      }
    }
  }
  const e = evaluateSignal({ pair, m1: arr, price: c.c, session: isTradingSession(end), news: s.news, balanceUsd: s.binary, stakePct: P.stakePct, minStake: P.minStake, hedgeRiskRatio: P.hedgeRiskRatio })
  if (!e) return
  const last = s.signals.find((x) => x.pair === pair)
  if (!e.ready) {
    if (last?.kind === 'NO_TRADE') { last.skipped++; last.reasons = e.reasons } else s.signals.unshift({ id: s.nextId++, time, pair, kind: 'NO_TRADE', price: c.c, strength: e.sig.strength, vol: e.vol, reasons: e.reasons, skipped: 1 })
  } else {
    const dir = e.sig.direction, sg = dir === 'CALL' ? 1 : -1
    s.signals.unshift({ id: s.nextId++, time, pair, kind: 'TRADE', dir, price: c.c, strength: e.sig.strength, vol: e.vol, stake: e.stake, lots: e.sz.lots, hedgeSide: dir === 'CALL' ? 'SELL' : 'BUY', sl: c.c + sg * e.sz.stopPips * e.pip, tp: c.c - sg * e.sz.tpPips * e.pip, stopPips: e.sz.stopPips, tpPips: e.sz.tpPips, expiry: new Date(end + 15 * 60000).toISOString(), reasons: [], skipped: 0 })
    if (!s.cycle && end - s.lastOpenT >= 120000) {
      s.cycle = { id: s.nextId++, pair, dir, entry: c.c, openT: end, expiryT: end + 15 * 60000, stake: e.stake, lots: e.sz.lots, pip: pipSize(pair), pipValue: pipValuePerLot(pair), stopPips: e.sz.stopPips, tpPips: e.sz.tpPips, strength: e.sig.strength, payout: 0.95, costPerLot: P.commission, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null }
      s.lastOpenT = end
    }
  }
  if (s.signals.length > 300) s.signals.pop()
}
