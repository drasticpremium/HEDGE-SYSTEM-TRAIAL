import { atr, realizedVol15, sizing, type Candle } from './math'
import { defaultVol15, pipSize, pipValuePerLot } from './pairs'
import { calculateSignal } from './signal'
/** Forex session used for signals: Mon-Fri, 08:00-17:00 GMT. */
export const isTradingSession = (t: number) => { const d = new Date(t), day = d.getUTCDay(); return day >= 1 && day <= 5 && d.getUTCHours() >= 8 && d.getUTCHours() < 17 }
export interface EvalIn { pair: string; m1: Candle[]; price: number; session: boolean; news: boolean; balanceUsd: number; stakePct: number; minStake: number; hedgeRiskRatio: number }
/** One shared signal check used by the browser trader, the Live Desk and the 24/7 server. Spread is an assumed 0.6 pip (feeds give no spread). */
export function evaluateSignal(i: EvalIn) {
  if (!i.m1 || !i.price || i.m1.length < 15) return null
  const pip = pipSize(i.pair), vol = Math.max(1, realizedVol15(i.m1.slice(-60).map((c) => c.c), pip) ?? defaultVol15(i.pair)), a = atr(i.m1, 14), spread = 0.6
  const sig = calculateSignal({ pair: i.pair, price: i.price, m1: i.m1, spreadPips: spread, atrPips: a ? a / pip : vol / 3, vol15: vol, sessionOpen: i.session })
  const stake = Math.max(i.minStake, (i.balanceUsd * i.stakePct) / 100), sz = sizing(vol, stake * i.hedgeRiskRatio, pipValuePerLot(i.pair))
  const reasons: string[] = []
  if (!i.session) reasons.push('Session closed (08:00-17:00 GMT)')
  if (i.news) reasons.push('News nearby switch is on')
  if (spread > 1.4) reasons.push('Spread too wide')
  if (vol < 1.5 || vol > 8) reasons.push(`Volatility ${vol.toFixed(1)} pips is outside the normal 1.5-8 range`)
  if (sig.strength < 60) reasons.push(`Strength ${sig.strength} is below 60`)
  else if (!sig.ready) reasons.push('Trend and momentum disagree')
  if (i.balanceUsd < stake) reasons.push('Balance below minimum stake')
  return { vol, spread, sig, stake, sz, session: i.session, price: i.price, pip, reasons, ready: reasons.length === 0 && sig.ready }
}
