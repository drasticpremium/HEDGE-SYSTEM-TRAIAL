export interface Candle { t: number; o: number; h: number; l: number; c: number }
/** Wilder ATR in price units. Null until period+1 candles exist. */
export function atr(c: Candle[], period = 14): number | null {
  if (c.length < period + 1) return null
  const tr = (i: number) => Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c))
  let a = 0
  for (let i = 1; i <= period; i++) a += tr(i)
  a /= period
  for (let i = period + 1; i < c.length; i++) a = (a * (period - 1) + tr(i)) / period
  return a
}
/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
export function normCdf(x: number): number {
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return 0.5 * (1 + s * y)
}
/** P(binary finishes in the money). distancePips > 0 = in favour. Model estimate only. */
export function winProbability(distancePips: number, vol15: number, minutesLeft: number): number {
  if (minutesLeft <= 0) return distancePips > 0 ? 1 : distancePips < 0 ? 0 : 0.5
  return normCdf(distancePips / (vol15 * Math.sqrt(minutesLeft / 15)))
}
/** Realized 15-min volatility (pips) from 1-minute closes: stdev of 1-min changes x sqrt(15). */
export function realizedVol15(closes: number[], pip: number): number | null {
  if (closes.length < 3) return null
  const r = closes.slice(1).map((x, i) => (x - closes[i]) / pip)
  const m = r.reduce((a, b) => a + b, 0) / r.length
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)
  return Math.sqrt(v * 15)
}
export interface Sizing { stopPips: number; tpPips: number; lots: number; stopUsd: number; tpUsd: number }
/** stop = stopMult x vol15, tp = tpMult x vol15, lots = risk$ / (stop pips x pip value per lot). */
export function sizing(vol15: number, riskUsd: number, pipValue: number, stopMult = 1.25, tpMult = 1.9): Sizing {
  const stopPips = +(vol15 * stopMult).toFixed(1), tpPips = +(vol15 * tpMult).toFixed(1)
  const lots = Math.max(0.01, Math.floor((riskUsd / (stopPips * pipValue)) * 100 + 1e-9) / 100)
  return { stopPips, tpPips, lots, stopUsd: stopPips * pipValue * lots, tpUsd: tpPips * pipValue * lots }
}
