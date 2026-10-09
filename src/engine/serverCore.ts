import { realizedVol15, type Candle } from './math'
import { step, type Cycle } from './cycle'
import { signalM15 } from './signalM15'
import { pipSize, pipValuePerLot } from './pairs'
import { newCopy, processCopyCandle, type CopyState } from './copyCore'
import type { CycleLogRow, SignalRow } from '../db/db'

/** Mon-Fri, 08:00-17:00 GMT. Entries happen at 15-minute opens from 08:00 to 16:45 so the 15-minute binary ends by 17:00. */
export const isTradingSession = (t: number) => { const d = new Date(t), day = d.getUTCDay(); return day >= 1 && day <= 5 && d.getUTCHours() >= 8 && d.getUTCHours() < 17 }
export interface Settings { stakeUsd: number; payoutMin: number; payoutMax: number; maxLots: number; autoLots: boolean; stopUsd: number; tpUsd: number; commission: number; counterWindowMin: number; counterMinLeft: number; minStrength: number; ghsPerUsd: number; leverage: number; tgNoTrade: boolean; copyLots: number }
export const defaultSettings: Settings = { stakeUsd: 5, payoutMin: 91, payoutMax: 95, maxLots: 0.2, autoLots: true, stopUsd: 8, tpUsd: 15, commission: 9, counterWindowMin: 5, counterMinLeft: 1, minStrength: 60, ghsPerUsd: 11, leverage: 500, tgNoTrade: true, copyLots: 0.01 }
export type Notice = { kind: 'signal'; row: SignalRow } | { kind: 'cycle'; row: CycleLogRow } | { kind: 'notrade'; pair: string; time: string; reasons: string[] } | { kind: 'info'; text: string }
export interface EngineState {
  v?: number; enabled: boolean; news: boolean; binary: number; exness: number; capital: { binary: number; exness: number }; status: string; lastTick: number; lastDecision: number; nextId: number
  candles: Record<string, Candle[]>; m15: Record<string, Candle[]>; h1: Record<string, Candle[]>; h1At: Record<string, number>; prices: Record<string, number>
  cycle: Cycle | null; cycles: CycleLogRow[]; signals: SignalRow[]; credits: { day: string; n: number }; lastReport?: string; settings: Settings; copy: CopyState
}
export const START_USD = 250 / 11
export const newState = (): EngineState => ({ v: 2, enabled: true, news: false, binary: START_USD, exness: START_USD, capital: { binary: START_USD, exness: START_USD }, status: 'Starting', lastTick: 0, lastDecision: 0, nextId: 1, candles: {}, m15: {}, h1: {}, h1At: {}, prices: {}, cycle: null, cycles: [], signals: [], credits: { day: '', n: 0 }, settings: { ...defaultSettings }, copy: newCopy() })
export function setCapital(s: EngineState, binaryGhs: number, exnessGhs: number) { const r = s.settings.ghsPerUsd; s.capital = { binary: binaryGhs / r, exness: exnessGhs / r }; s.binary = s.capital.binary; s.exness = s.capital.exness }
/** Clears cycles, signals and the open trade, and puts both accounts back to the starting capital. Copy trading is untouched. */
export function clearAuto(s: EngineState) { s.cycle = null; s.cycles = []; s.signals = []; s.nextId = 1; s.binary = s.capital.binary; s.exness = s.capital.exness; s.lastDecision = 0 }

/** Decision at the open of a 15-minute candle: records the signal (one red card per no-trade run) and opens a paper cycle when everything is green. */
export function decide(s: EngineState, pair: string, t0: number, price: number): Notice[] {
  const st = s.settings, pip = pipSize(pair), pv = pipValuePerLot(pair), time = new Date(t0).toISOString(), out: Notice[] = []
  const sig = signalM15({ h1: s.h1[pair] ?? [], m15: s.m15[pair] ?? [], price, pip, minStrength: st.minStrength }), reasons = [...sig.reasons]
  if (s.news) reasons.push('News nearby switch is on')
  if (s.cycle) reasons.push('Previous cycle still open')
  if (s.binary < st.stakeUsd) reasons.push('Binary balance is below the stake')
  const vol = Math.max(1, realizedVol15((s.candles[pair] ?? []).slice(-60).map((c) => c.c), pip) ?? 3.2)
  const desired = st.autoLots ? Math.min(st.maxLots, Math.max(0.01, Math.floor((st.stopUsd / (1.25 * vol * pv)) * 100 + 1e-9) / 100)) : st.maxLots
  const perLot = ((pair.startsWith('USD') ? 1 : price * (pv / (100000 * pip))) * 100000) / st.leverage
  let lots = desired; const room = s.exness * 0.9
  if (lots * perLot > room) lots = Math.floor((room / perLot) * 100 + 1e-9) / 100
  if (lots < 0.01) { reasons.push('Exness balance is too small for even 0.01 lots'); lots = 0.01 }
  const f = Math.min(1, lots / desired), stopPips = +((st.stopUsd * f) / (lots * pv)).toFixed(2), tpPips = +((st.tpUsd * f) / (lots * pv)).toFixed(2), sg = sig.direction === 'CALL' ? 1 : -1
  const last = s.signals.find((x) => x.pair === pair)
  if (reasons.length) {
    if (last?.kind === 'NO_TRADE') { last.skipped++; last.reasons = reasons } else s.signals.unshift({ id: s.nextId++, time, pair, kind: 'NO_TRADE', price, strength: sig.strength, vol, reasons, skipped: 1 })
    out.push({ kind: 'notrade', pair, time, reasons })
  } else {
    const row: SignalRow = { id: s.nextId++, time, pair, kind: 'TRADE', dir: sig.direction, price, strength: sig.strength, vol, stake: st.stakeUsd, lots, hedgeSide: sg === 1 ? 'SELL' : 'BUY', sl: price + sg * stopPips * pip, tp: price - sg * tpPips * pip, stopPips, tpPips, stopUsd: stopPips * lots * pv, tpUsd: tpPips * lots * pv, scaled: f, expiry: new Date(t0 + 900000).toISOString(), reasons: [], skipped: 0 }
    s.signals.unshift(row); out.push({ kind: 'signal', row })
    s.cycle = { id: s.nextId++, pair, dir: sig.direction, entry: price, openT: t0, expiryT: t0 + 900000, stake: st.stakeUsd, lots, pip, pipValue: pv, stopPips, tpPips, strength: sig.strength, payout: (st.payoutMin + Math.random() * (st.payoutMax - st.payoutMin)) / 100, costPerLot: st.commission, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null, cwMin: st.counterWindowMin, cMinLeft: st.counterMinLeft }
  }
  if (s.signals.length > 300) s.signals.pop()
  return out
}

/** Feed one CLOSED real 1-minute candle: steps the open cycle and any copy trades on this pair. */
export function processCandle(s: EngineState, pair: string, c: Candle): Notice[] {
  const out: Notice[] = [], arr = (s.candles[pair] ??= [])
  if (arr.length && arr[arr.length - 1].t >= c.t) return out
  arr.push(c); if (arr.length > 400) arr.shift(); s.prices[pair] = c.c
  processCopyCandle(s.copy, pair, c)
  const end = c.t + 60000, time = new Date(end).toISOString()
  if (s.cycle && s.cycle.pair === pair && c.t >= s.cycle.openT) {
    const path = c.c >= c.o ? [c.o, c.l, c.h, c.c] : [c.o, c.h, c.l, c.c]
    for (let i = 0; i < 4 && s.cycle; i++) {
      const cy = s.cycle, r = step(cy, path[i], i === 3 ? end : c.t + (i + 1) * 15000)
      r.events.filter((e) => !e.startsWith('EXPIRY')).forEach((e) => out.push({ kind: 'info', text: `${pair}: ${e}` }))
      if (r.settled) {
        const x = r.settled; s.binary += x.binary + x.counter; s.exness += x.exness - x.cost
        const row: CycleLogRow = { id: cy.id, time, pair, direction: cy.dir, entry: cy.entry, strength: cy.strength, stake: cy.stake, lots: cy.lots, binaryResult: x.binaryWin ? 'WIN' : 'LOSS', counterResult: x.counterWin === null ? undefined : x.counterWin ? 'WIN' : 'LOSS', exnessResult: +x.exness.toFixed(2), costs: +x.cost.toFixed(2), netPnl: x.net, outcomeTag: x.tag, source: 'live', binaryPnl: +x.binary.toFixed(2), counterPnl: +x.counter.toFixed(2), exnessPnl: +(x.exness - x.cost).toFixed(2), payout: +cy.payout.toFixed(4) }
        s.cycles.unshift(row); out.push({ kind: 'cycle', row }); if (s.cycles.length > 400) s.cycles.pop(); s.cycle = null
      }
    }
  }
  return out
}

const dp = (pair: string) => (pair.endsWith('JPY') ? 3 : 5), usd = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
const hm = (iso?: string) => (iso ? iso.slice(11, 16) : '')
export const signalMessage = (r: SignalRow) => {
  const d = dp(r.pair), buy = r.dir === 'CALL', pip = r.pair.endsWith('JPY') ? 0.01 : 0.0001, counter = r.price + (buy ? 1 : -1) * 0.5 * pip
  return `SIGNAL ${hm(r.time)} GMT ${r.pair} (strength ${r.strength}/100)\nQUOTEX: ${buy ? 'BUY (CALL)' : 'SELL (PUT)'} $${r.stake?.toFixed(2)}, 15 min, expiry ${hm(r.expiry)} GMT\nEntry about ${r.price.toFixed(d)}\nEXNESS: ${r.hedgeSide} ${r.lots?.toFixed(2)} lots\nStop loss ${r.sl?.toFixed(d)} (${r.stopPips} pips, -$${r.stopUsd?.toFixed(2)})\nTake profit ${r.tp?.toFixed(d)} (${r.tpPips} pips, +$${r.tpUsd?.toFixed(2)})\nCounter: if the stop hits and price returns to ${counter.toFixed(d)} in the last 5 minutes, buy ${buy ? 'SELL (PUT)' : 'BUY (CALL)'} $${r.stake?.toFixed(2)} with the same expiry.${r.scaled !== undefined && r.scaled < 1 ? `\nNote: hedge scaled to ${(r.scaled * 100).toFixed(0)}% of plan to fit the Exness balance.` : ''}\nPaper signal. You trade manually elsewhere.`
}
export const noTradeMessage = (pair: string, time: string, reasons: string[]) => `NO TRADE ${hm(time)} GMT ${pair}\n${reasons.map((x) => '- ' + x).join('\n')}`
export const cycleMessage = (r: CycleLogRow) => `CYCLE CLOSED ${r.pair} ${r.direction === 'CALL' ? 'BUY' : 'SELL'}: ${r.outcomeTag}\nQuotex ${usd((r.binaryPnl ?? 0) + (r.counterPnl ?? 0))} | Exness ${usd(r.exnessPnl ?? r.exnessResult - r.costs)} | Net ${usd(r.netPnl)} (paper)`
/** Plain-text P&L report for the last hour and the current UTC day. rate = GH₵ per USD. */
export function summaryText(cycles: CycleLogRow[], binary: number, exness: number, now: number, rate = 11) {
  const hr = cycles.filter((c) => now - Date.parse(c.time) <= 3600000), day = cycles.filter((c) => c.time.slice(0, 10) === new Date(now).toISOString().slice(0, 10))
  const net = (x: CycleLogRow[]) => x.reduce((a, c) => a + c.netPnl, 0), f = (v: number) => `${usd(v)} (GH₵${Math.abs(v * rate).toFixed(2)})`
  return `HOURLY REPORT (paper)\nLast hour: ${hr.length} cycles, ${hr.length ? f(net(hr)) : 'no trades'}\nToday: ${day.length} cycles, ${day.length ? f(net(day)) : 'no trades'}\nBinary account GH₵${(binary * rate).toFixed(2)}, Exness GH₵${(exness * rate).toFixed(2)}`
}
