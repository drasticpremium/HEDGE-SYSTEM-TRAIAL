import { atr, type Candle } from './math'
export const ema = (v: number[], n: number) => { const k = 2 / (n + 1), out: number[] = []; v.forEach((x, i) => out.push(i ? x * k + out[i - 1] * (1 - k) : x)); return out }
export function rsi(c: number[], n = 14): number | null {
  if (c.length < n + 1) return null
  let g = 0, l = 0
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d }
  g /= n; l /= n
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l)
}
export interface M15Result { direction: 'CALL' | 'PUT'; strength: number; ready: boolean; reasons: string[]; inputs: { ema50: number | null; trendPips: number; slopePips: number; rsi: number | null; atrPips: number | null } }
/** Decision at the open of a 15-minute candle. Trend = price vs H1 EMA50, confirmed by M15 EMA20 slope and RSI(14), with a normal-volatility check. All inputs are returned so every signal can be explained. */
export function signalM15(i: { h1: Candle[]; m15: Candle[]; price: number; pip: number; minStrength: number }): M15Result {
  const reasons: string[] = []
  const e50 = i.h1.length >= 50 ? ema(i.h1.map((c) => c.c), 50).at(-1)! : null
  if (e50 === null) reasons.push('Not enough H1 history for EMA50')
  if (i.m15.length < 20) reasons.push('Not enough M15 history')
  const dir: 'CALL' | 'PUT' = e50 === null || i.price >= e50 ? 'CALL' : 'PUT', sg = dir === 'CALL' ? 1 : -1
  const trendPips = e50 === null ? 0 : Math.abs(i.price - e50) / i.pip
  const closes = i.m15.map((c) => c.c), e20 = closes.length >= 5 ? ema(closes, 20) : [], slopePips = e20.length >= 4 ? ((e20.at(-1)! - e20[e20.length - 4]) / i.pip) * sg : 0
  const r = rsi(closes, 14), a = atr(i.m15, 14), atrPips = a === null ? null : a / i.pip
  const trendOk = trendPips >= 1, slopeOk = slopePips >= 0.2, rsiOk = r !== null && (dir === 'CALL' ? r >= 45 && r <= 72 : r >= 28 && r <= 55), atrOk = atrPips !== null && atrPips >= 2.5 && atrPips <= 14
  if (e50 !== null && !trendOk) reasons.push('Price too close to H1 EMA50 (no clear trend)')
  if (i.m15.length >= 20 && !slopeOk) reasons.push('M15 EMA20 slope does not confirm the trend')
  if (r !== null && !rsiOk) reasons.push(`RSI ${r.toFixed(0)} is outside the ${dir === 'CALL' ? '45-72' : '28-55'} zone for a ${dir}`)
  if (atrPips !== null && !atrOk) reasons.push(`M15 ATR ${atrPips.toFixed(1)} pips is outside the normal 2.5-14 range`)
  const strength = Math.round(Math.min(trendPips / 10, 1) * 40 + (slopeOk ? Math.min(slopePips / 1.5, 1) * 20 : 0) + (rsiOk ? 20 : 0) + (atrOk ? 20 : 0))
  if (strength < i.minStrength && !reasons.length) reasons.push(`Strength ${strength} is below ${i.minStrength}`)
  return { direction: dir, strength, ready: reasons.length === 0, reasons, inputs: { ema50: e50, trendPips, slopePips, rsi: r, atrPips } }
}
