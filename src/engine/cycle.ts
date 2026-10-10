import { cyclePnl } from './pnl'
export type Dir = 'CALL' | 'PUT'
export interface Cycle {
  id: number; pair: string; dir: Dir; entry: number; openT: number; expiryT: number
  stake: number; lots: number; pip: number; pipValue: number; stopPips: number; tpPips: number
  strength: number; payout: number; costPerLot: number; cwMin?: number; cMinLeft?: number; rec?: number
  stopHit: boolean; tpHit: boolean; counterState: 'none' | 'armed' | 'open' | 'cancelled'; counterEntry: number | null
}
export interface Settled { binary: number; counter: number; exness: number; cost: number; net: number; tag: string; binaryWin: boolean; counterWin: boolean | null }
/** Pips moved in the binary's favour (negative = against). The hedge is the opposite side, so hedge pips = -fav. */
export const favPips = (c: Cycle, price: number) => ((price - c.entry) / c.pip) * (c.dir === 'CALL' ? 1 : -1)
const opp = (d: Dir): Dir => (d === 'CALL' ? 'PUT' : 'CALL')

/** Advance one cycle by one price update. Mutates c. Returns events and, at expiry, the settlement. */
export function step(c: Cycle, price: number, t: number): { events: string[]; settled: Settled | null } {
  const events: string[] = []
  const fav = favPips(c, price)
  if (!c.stopHit && !c.tpHit) {
    if (fav >= c.stopPips) { c.stopHit = true; c.counterState = 'armed'; events.push(`STOP_HIT hedge stopped (-${c.stopPips} pips). Waiting for price to return to entry +0.5 pip`) }
    else if (fav <= -c.tpPips) { c.tpHit = true; events.push(`TP_HIT hedge take profit (+${c.tpPips} pips)`) }
  }
  if (c.counterState === 'armed') {
    const left = (c.expiryT - t) / 60000, win = c.cwMin ?? 5, min = c.cMinLeft ?? 1
    if (fav < 0) { c.counterState = 'cancelled'; events.push('COUNTER_CANCELLED price went below entry (both-lose zone)') }
    else if (left < min) { c.counterState = 'cancelled'; events.push(`COUNTER_CANCELLED less than ${min} minute left`) }
    else if (left <= win && fav <= 0.5) { c.counterState = 'open'; c.counterEntry = price; events.push(`COUNTER_OPENED ${opp(c.dir)} at ${price.toFixed(5)}, same expiry`) }
  }
  if (t < c.expiryT) return { events, settled: null }
  const binaryWin = fav > 0
  const counterWin = c.counterState === 'open' ? (opp(c.dir) === 'CALL' ? price > c.counterEntry! : price < c.counterEntry!) : null
  const exnessPips = c.tpHit ? c.tpPips : c.stopHit ? -c.stopPips : -fav
  const r = cyclePnl({ stake: c.stake, payout: c.payout, lots: c.lots, pipValue: c.pipValue, costPerLot: c.costPerLot, exnessPips, binaryWin, counter: counterWin === null ? undefined : { win: counterWin } })
  const tag = counterWin !== null ? (binaryWin && counterWin ? 'counter used (both won)' : !binaryWin && !counterWin ? 'counter used (both lost)' : 'counter used') : c.tpHit ? 'take-profit hit' : c.stopHit ? 'stop hit' : 'ridden to expiry'
  events.push(`EXPIRY binary ${binaryWin ? 'WON' : 'LOST'}${counterWin === null ? '' : `, counter ${counterWin ? 'WON' : 'LOST'}`}. Net ${r.net >= 0 ? '+' : ''}${r.net.toFixed(2)}`)
  return { events, settled: { ...r, tag, binaryWin, counterWin } }
}
