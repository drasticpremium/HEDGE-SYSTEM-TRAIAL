import { create } from 'zustand'
import type { Candle } from '../engine/math'
import { defaultVol15, pipSize, pipValuePerLot, startPrice } from '../engine/pairs'
import { evaluateSignal, isTradingSession } from '../engine/evaluate'
import { step, type Cycle } from '../engine/cycle'
import { sessionMult } from '../feed/sim'
import { isSessionOpen } from '../engine/clock'
import { useAppStore } from './useAppStore'
import { addEventRow, addHistoryRow, db, type SignalRow } from '../db/db'

interface TraderState {
  running: boolean; news: boolean; speed: number; respectSession: boolean; watchlist: string[]
  simT: number; prices: Record<string, number>; candles: Record<string, Candle[]>
  cycle: Cycle | null; events: string[]; status: string; sessionCycles: number
  set: (p: Partial<TraderState>) => void
}
export const useTrader = create<TraderState>((set) => ({
  running: true, news: false, speed: 1, respectSession: true, watchlist: ['EURUSD', 'GBPUSD', 'AUDUSD'],
  simT: Date.now(), prices: {}, candles: {}, cycle: null, events: ['Auto trader started (SIMULATED data, paper money)'], status: 'Warming up', sessionCycles: 0,
  set: (p) => set(p),
}))
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const M = { prices: {} as Record<string, number>, candles: {} as Record<string, Candle[]>, cycle: null as Cycle | null, lastOpenT: 0, id: Date.now(), lastReal: Date.now(), simT: Date.now() }

function advance(pair: string, t: number): boolean {
  const pip = pipSize(pair), sig = defaultVol15(pair) / Math.sqrt(900)
  const mid = (M.prices[pair] += gauss() * sig * pip * sessionMult(new Date(t).getUTCHours()))
  const min = Math.floor(t / 60000) * 60000, arr = M.candles[pair], last = arr[arr.length - 1]
  if (!last || last.t !== min) { arr.push({ t: min, o: mid, h: mid, l: mid, c: mid }); if (arr.length > 400) arr.shift(); return true }
  last.h = Math.max(last.h, mid); last.l = Math.min(last.l, mid); last.c = mid
  return false
}
export function ensurePair(pair: string) {
  if (M.prices[pair]) return
  M.prices[pair] = startPrice(pair); M.candles[pair] = []
  const t0 = M.simT - 200 * 60000
  for (let s = 0; s < 200 * 60; s += 5) advance(pair, t0 + s * 1000) // instant history so indicators work immediately
}
const push = (msg: string, cycleId?: number) => {
  useTrader.setState((s) => ({ events: [`${new Date(M.simT).toISOString().slice(11, 19)} ${msg}`, ...s.events].slice(0, 40) }))
  void addEventRow({ cycleId, time: new Date(M.simT).toISOString(), message: msg, level: 'info' })
}
export function evaluate(pair: string, simT: number, live?: { m1: Candle[]; price: number }) {
  const app = useAppStore.getState(), tr = useTrader.getState()
  const m1 = live?.m1 ?? M.candles[pair], price = live?.price ?? M.prices[pair]
  if (!m1 || !price) return null
  const session = live ? isTradingSession(simT) : !tr.respectSession || isSessionOpen(simT)
  return evaluateSignal({ pair, m1, price, session, news: tr.news, balanceUsd: app.binaryBalanceUsd, stakePct: app.binaryStakePercent, minStake: app.minimumBinaryStake, hedgeRiskRatio: app.hedgeRiskRatio })
}
const lastKind: Record<string, { kind: string; id: number; skipped: number }> = {}, inits: Record<string, Promise<void>> = {}
/** One row per tradable candle. Consecutive no-trade candles share ONE red row until a candle is tradable again. */
async function recordSignal(pair: string) {
  const e = evaluate(pair, M.simT); if (!e) return
  await (inits[pair] ??= db.signals.where('pair').equals(pair).last().then((r) => { lastKind[pair] = r ? { kind: r.kind, id: r.id!, skipped: r.skipped } : { kind: '', id: 0, skipped: 0 } }))
  const last = lastKind[pair], time = new Date(M.simT).toISOString()
  if (!e.ready) {
    if (last.kind === 'NO_TRADE') { last.skipped++; if (last.id > 0) void db.signals.update(last.id, { skipped: last.skipped, reasons: e.reasons }); return }
    const st = { kind: 'NO_TRADE', id: -1, skipped: 1 }; lastKind[pair] = st
    st.id = await db.signals.add({ time, pair, kind: 'NO_TRADE', price: e.price, strength: e.sig.strength, vol: e.vol, reasons: e.reasons, skipped: 1 }); return
  }
  const dir = e.sig.direction, sg = dir === 'CALL' ? 1 : -1
  const row: SignalRow = { time, pair, kind: 'TRADE', dir, price: e.price, strength: e.sig.strength, vol: e.vol, stake: e.stake, lots: e.sz.lots, hedgeSide: dir === 'CALL' ? 'SELL' : 'BUY', sl: e.price + sg * e.sz.stopPips * e.pip, tp: e.price - sg * e.sz.tpPips * e.pip, stopPips: e.sz.stopPips, tpPips: e.sz.tpPips, expiry: new Date(M.simT + 15 * 60000).toISOString(), reasons: e.reasons, skipped: 0 }
  lastKind[pair] = { kind: 'TRADE', id: 0, skipped: 0 }
  await db.signals.add(row)
  const n = await db.signals.count(); if (n > 500) await db.signals.orderBy('id').limit(n - 500).delete()
}
function tryOpen(pair: string) {
  const app = useAppStore.getState()
  const e = evaluate(pair, M.simT)
  if (!e) return
  if (!e.ready) { useTrader.setState({ status: `WAIT: ${e.reasons[0] ?? 'no clean setup'}` }); return }
  if (M.simT - M.lastOpenT < 120000) { useTrader.setState({ status: 'WAIT: cooldown after last cycle' }); return }
  const { sig, stake, sz } = e
  const c: Cycle = { id: ++M.id, pair, dir: sig.direction, entry: e.price, openT: M.simT, expiryT: M.simT + 15 * 60000, stake, lots: sz.lots, pip: e.pip, pipValue: pipValuePerLot(pair), stopPips: sz.stopPips, tpPips: sz.tpPips, strength: sig.strength, payout: 0.95, costPerLot: app.commissionPerLotRoundTrip, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null }
  M.cycle = c; M.lastOpenT = M.simT
  push(`OPEN ${pair} ${c.dir} strength ${c.strength}. Quotex: $${stake.toFixed(2)} 15m. Exness: ${c.dir === 'CALL' ? 'SELL' : 'BUY'} ${c.lots} lots, stop ${c.stopPips}p, TP ${c.tpPips}p`, c.id)
}
function settle(c: Cycle, s: NonNullable<ReturnType<typeof step>['settled']>) {
  const app = useAppStore.getState()
  app.setAccountBalance('binary', app.binaryBalanceUsd + s.binary + s.counter)
  app.setAccountBalance('exness', app.exnessBalanceUsd + s.exness - s.cost)
  void addHistoryRow({ time: new Date(M.simT).toISOString(), pair: c.pair, direction: c.dir, entry: c.entry, strength: c.strength, stake: c.stake, lots: c.lots, binaryResult: s.binaryWin ? 'WIN' : 'LOSS', counterResult: s.counterWin === null ? undefined : s.counterWin ? 'WIN' : 'LOSS', exnessResult: +s.exness.toFixed(2), costs: +s.cost.toFixed(2), netPnl: s.net, outcomeTag: s.tag, source: 'sim' })
  M.cycle = null; useTrader.setState((st) => ({ sessionCycles: st.sessionCycles + 1 }))
}
function tick() {
  const tr = useTrader.getState(); if (!tr.running) { M.lastReal = Date.now(); return }
  tr.watchlist.forEach(ensurePair)
  const now = Date.now(), realSecs = Math.max(1, Math.round((now - M.lastReal) / 1000)); M.lastReal = now
  const n = Math.min(realSecs * tr.speed, 7200) // catches up after the tab was throttled in the background
  for (let k = 0; k < n; k++) {
    M.simT += 1000
    for (const p of tr.watchlist) {
      const rolled = advance(p, M.simT)
      if (rolled) { void recordSignal(p); if (!M.cycle) tryOpen(p) }
    }
    if (M.cycle) {
      const c = M.cycle, r = step(c, M.prices[c.pair], M.simT)
      r.events.forEach((e) => push(e, c.id))
      if (r.settled) { const s = r.settled; settle(c, s) }
    }
  }
  useTrader.setState({ simT: M.simT, prices: { ...M.prices }, candles: { ...M.candles }, cycle: M.cycle ? { ...M.cycle } : null })
}
setInterval(tick, 1000)
