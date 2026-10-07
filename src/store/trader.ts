import { create } from 'zustand'
import { atr, realizedVol15, sizing, type Candle } from '../engine/math'
import { defaultVol15, pipSize, pipValuePerLot, startPrice } from '../engine/pairs'
import { calculateSignal } from '../engine/signal'
import { step, type Cycle } from '../engine/cycle'
import { sessionMult } from '../feed/sim'
import { isSessionOpen } from '../engine/clock'
import { useAppStore } from './useAppStore'
import { addEventRow, addHistoryRow } from '../db/db'

interface TraderState {
  running: boolean; speed: number; respectSession: boolean; watchlist: string[]
  simT: number; prices: Record<string, number>; candles: Record<string, Candle[]>
  cycle: Cycle | null; events: string[]; status: string; sessionCycles: number
  set: (p: Partial<TraderState>) => void
}
export const useTrader = create<TraderState>((set) => ({
  running: true, speed: 1, respectSession: true, watchlist: ['EURUSD', 'GBPUSD', 'AUDUSD'],
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
function tryOpen(pair: string) {
  const app = useAppStore.getState(), tr = useTrader.getState()
  const m1 = M.candles[pair], price = M.prices[pair], pip = pipSize(pair)
  const open = !tr.respectSession || isSessionOpen(M.simT)
  if (!open) { useTrader.setState({ status: 'WAIT: session closed (08:00-17:00 GMT on sim clock)' }); return }
  if (M.simT - M.lastOpenT < 120000) { useTrader.setState({ status: 'WAIT: cooldown after last cycle' }); return }
  const vol = Math.max(1, realizedVol15(m1.slice(-60).map((c) => c.c), pip) ?? defaultVol15(pair))
  const a = atr(m1, 14)
  const sig = calculateSignal({ pair, price, m1, spreadPips: 0.6, atrPips: a ? a / pip : vol / 3, vol15: vol, sessionOpen: open })
  if (!sig.ready || sig.strength < 60) { useTrader.setState({ status: `WAIT: ${pair} strength ${sig.strength}, no clean setup` }); return }
  const stake = Math.max(app.minimumBinaryStake, (app.binaryBalanceUsd * app.binaryStakePercent) / 100)
  if (app.binaryBalanceUsd < stake) { useTrader.setState({ status: 'SKIPPED: balance below minimum stake' }); return }
  const pv = pipValuePerLot(pair), sz = sizing(vol, stake * app.hedgeRiskRatio, pv)
  const c: Cycle = { id: ++M.id, pair, dir: sig.direction, entry: price, openT: M.simT, expiryT: M.simT + 15 * 60000, stake, lots: sz.lots, pip, pipValue: pv, stopPips: sz.stopPips, tpPips: sz.tpPips, strength: sig.strength, payout: 0.95, costPerLot: app.commissionPerLotRoundTrip, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null }
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
      if (rolled && !M.cycle) tryOpen(p)
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
