import type { CycleLogRow } from '../db/db'
/** 95% Wilson score interval for a win rate. */
export function wilson(wins: number, n: number): [number, number] | null {
  if (!n) return null
  const z = 1.96, p = wins / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
export const cumulative = (vals: number[]) => { let s = 0; return vals.map((v) => (s += v)) }
/** Largest peak-to-trough fall of a cumulative P&L series that starts at 0. */
export function maxDrawdown(cum: number[]): number { let peak = 0, dd = 0; for (const v of cum) { peak = Math.max(peak, v); dd = Math.max(dd, peak - v) } return dd }
/** Positive = current winning streak length, negative = losing streak. Rows oldest first. */
export function currentStreak(rows: CycleLogRow[]): number {
  let n = 0
  for (let i = rows.length - 1; i >= 0; i--) { const w = rows[i].netPnl > 0; if (n === 0) n = w ? 1 : -1; else if ((n > 0) === w) n += n > 0 ? 1 : -1; else break }
  return n
}
/** Binary-only P&L of the same signal (what you'd get with no hedge and no counter). */
export const unhedgedPnl = (r: CycleLogRow, payout = 0.95) => (r.binaryResult === 'WIN' ? r.stake * payout : -r.stake)
export function group(rows: CycleLogRow[], key: (r: CycleLogRow) => string) {
  const m = new Map<string, { n: number; wins: number; net: number }>()
  for (const r of rows) { const k = key(r), g = m.get(k) ?? { n: 0, wins: 0, net: 0 }; g.n++; g.net += r.netPnl; if (r.binaryResult === 'WIN') g.wins++; m.set(k, g) }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
/** Break-even binary win rate = 1 / (1 + payout). 95% payout gives 51.28%. */
export const breakEven = (payout = 0.95) => 1 / (1 + payout)
