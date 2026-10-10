import type { Candle } from './math'
import { USD_VALUE } from './pairs'
/** Copy-trade paper ledger. Completely separate from the auto trader's accounts and history. */
export interface CopyTrade {
  id: number; created: string; pair: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT' | 'STOP'; entry: number; sl: number | null; tps: number[]
  src?: string; msgId?: number; lots: number; remaining: number; status: 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELLED'; fillPrice?: number; filledAt?: string; closedAt?: string; realized: number; tpHit: number; exit?: string; raw?: string
}
export interface Feed { id: number; name: string; enabled: boolean; lastId: number; checked: number; found: number; copied: number; ignored: number; error: string }
export interface FeedEvent { time: string; channel: string; msgId: number; status: 'copied' | 'ignored'; note: string; text: string }
export interface CopyState { balance: number; start: number; trades: CopyTrade[]; lastT: Record<string, number>; feeds: Feed[]; log: FeedEvent[] }
export const newCopy = (start = 250 / 11): CopyState => ({ balance: start, start, trades: [], lastT: {}, feeds: [], log: [] })
/** Paper P&L in USD for a price move. Quote-currency conversion uses rough fixed rates, so treat results as estimates. */
export const pnlUsd = (pair: string, diff: number, lots: number) => diff * (pair.startsWith('XAU') ? 100 : pair.startsWith('XAG') ? 5000 : 100000) * lots * (pair.startsWith('XAU') || pair.startsWith('XAG') ? 1 : USD_VALUE[pair.slice(3)] ?? 1)
export interface CopyInput { pair: string; side: 'BUY' | 'SELL'; type: 'AUTO' | 'MARKET' | 'LIMIT' | 'STOP'; entry: number | null; sl: number | null; tps: number[]; lots: number; raw?: string; src?: string; msgId?: number }
/** Create a trade. AUTO: within 0.03% of the live price = market fill, otherwise a pending limit or stop. */
export function addCopy(c: CopyState, i: CopyInput, price: number, nowIso: string, id: number): CopyTrade {
  const entry = i.entry ?? price, near = Math.abs(entry - price) / price <= 0.0003
  let type: CopyTrade['type'] = i.type === 'AUTO' ? (i.entry === null || near ? 'MARKET' : (i.side === 'BUY') === (entry < price) ? 'LIMIT' : 'STOP') : i.type
  if (type === 'MARKET' && i.entry !== null && !near && i.type === 'AUTO') type = 'LIMIT'
  const t: CopyTrade = { id, created: nowIso, pair: i.pair, side: i.side, type, entry: type === 'MARKET' ? price : entry, sl: i.sl, tps: [...i.tps], lots: i.lots, remaining: i.lots, status: 'PENDING', realized: 0, tpHit: 0, raw: i.raw, src: i.src, msgId: i.msgId }
  if (type === 'MARKET') { t.status = 'OPEN'; t.fillPrice = price; t.filledAt = nowIso }
  c.trades.unshift(t); if (c.trades.length > 200) c.trades.pop()
  return t
}
/** Step every active trade on this pair through one real candle. If stop and target are both inside one candle the stop is assumed first (conservative). */
export function processCopyCandle(c: CopyState, pair: string, k: Candle) {
  if ((c.lastT[pair] ?? 0) >= k.t) return
  c.lastT[pair] = k.t
  const closeAt = k.t + 60000, iso = new Date(closeAt).toISOString()
  for (const t of c.trades) {
    if (t.pair !== pair || t.status === 'CLOSED' || t.status === 'CANCELLED') continue
    const buy = t.side === 'BUY'
    if (t.status === 'PENDING') {
      const hit = t.type === 'LIMIT' ? (buy ? k.l <= t.entry : k.h >= t.entry) : (buy ? k.h >= t.entry : k.l <= t.entry)
      if (hit) { t.status = 'OPEN'; t.fillPrice = t.entry; t.filledAt = iso }
      continue // exits are checked from the next candle
    }
    const px = t.fillPrice!, sign = buy ? 1 : -1, book = (price: number, lots: number) => { const p = pnlUsd(pair, (price - px) * sign, lots); t.realized += p; c.balance += p; t.remaining = +(t.remaining - lots).toFixed(4) }
    if (t.sl !== null && (buy ? k.l <= t.sl : k.h >= t.sl)) { book(t.sl, t.remaining); t.status = 'CLOSED'; t.closedAt = iso; t.exit = t.tpHit ? `SL after TP${t.tpHit}` : 'SL'; continue }
    while (t.tpHit < t.tps.length && (buy ? k.h >= t.tps[t.tpHit] : k.l <= t.tps[t.tpHit])) {
      const left = t.tps.length - t.tpHit, part = left === 1 ? t.remaining : +(t.lots / t.tps.length).toFixed(4)
      book(t.tps[t.tpHit], part); t.tpHit++
      if (t.tpHit === t.tps.length) { t.status = 'CLOSED'; t.closedAt = iso; t.exit = `TP${t.tpHit}`; break }
    }
  }
}
