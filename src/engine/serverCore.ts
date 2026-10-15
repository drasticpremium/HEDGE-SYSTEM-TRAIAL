import { realizedVol15, type Candle } from './math'
import { step, type Cycle, type Settled } from './cycle'
import { signalM15, chopCheck } from './signalM15'
import { pipSize, pipValuePerLot } from './pairs'
import { newCopy, processCopyCandle, type CopyState } from './copyCore'
import type { CycleLogRow, SignalRow } from '../db/db'

/** Mon-Fri, 08:00-17:00 GMT. Entries happen at 15-minute opens from 08:00 to 16:45 so the 15-minute binary ends by 17:00. */
export const isTradingSession = (t: number) => { const d = new Date(t), day = d.getUTCDay(); return day >= 1 && day <= 5 && d.getUTCHours() >= 8 && d.getUTCHours() < 17 }
export interface Settings { stakeUsd: number; payoutMin: number; payoutMax: number; maxLots: number; autoLots: boolean; stopUsd: number; tpUsd: number; commission: number; counterWindowMin: number; counterMinLeft: number; minStrength: number; ghsPerUsd: number; leverage: number; tgNoTrade: boolean; copyLots: number; recoveryOn: boolean; recoveryMult: number; headsUp: boolean; leadMin: number; minNetWin: number; stopAtrMult: number; pullbackOn: boolean; pullbackPct: number; pullbackWindowMin: number; chopFilterOn: boolean; chopBars: number; chopMinBodyPct: number; chopMinEffPct: number }
export const defaultSettings: Settings = { stakeUsd: 5, payoutMin: 91, payoutMax: 95, maxLots: 0.2, autoLots: true, stopUsd: 4, tpUsd: 15, commission: 9, counterWindowMin: 5, counterMinLeft: 1, minStrength: 60, ghsPerUsd: 11, leverage: 500, tgNoTrade: false, copyLots: 0.01, recoveryOn: false, recoveryMult: 2, headsUp: false, leadMin: 2, minNetWin: 1.5, stopAtrMult: 0.7, pullbackOn: false, pullbackPct: 20, pullbackWindowMin: 8, chopFilterOn: true, chopBars: 6, chopMinBodyPct: 45, chopMinEffPct: 40 }
export type Notice = { kind: 'signal'; row: SignalRow } | { kind: 'cycle'; row: CycleLogRow } | { kind: 'notrade'; pair: string; time: string; reasons: string[] } | { kind: 'info'; text: string }
/** A planned trade waiting for its pullback: enter at entryLevel, skip if price reaches skipLevel first. */
export interface Pending { pair: string; dir: 'CALL' | 'PUT'; openT: number; ref: number; entryLevel: number; skipLevel: number; pips: number; atr: number; strength: number; until: number }
export interface EngineState {
  pending?: Pending | null;
  v?: number; sizingMode?: number; fx?: { rate: number; at: number; tried?: number; src: string; error?: string }; enabled: boolean; news: boolean; binary: number; exness: number; capital: { binary: number; exness: number }; status: string; lastTick: number; lastDecision: number; nextId: number; ladderMode?: number; ladder?: number; ladderDir?: 'CALL' | 'PUT' | null; heads?: { open: number; dir: 'CALL' | 'PUT' | null; rec: number }; headsKey?: string
  candles: Record<string, Candle[]>; m15: Record<string, Candle[]>; h1: Record<string, Candle[]>; h1At: Record<string, number>; prices: Record<string, number>
  cycle: Cycle | null; cycles: CycleLogRow[]; signals: SignalRow[]; credits: { day: string; n: number }; lastReport?: string; settings: Settings; copy: CopyState
}
export const START_USD = 250 / 11
/** GH₵ per USD: the live rate when fresh (under 48 hours old), otherwise the fallback value in settings. */
export const rateOf = (s: EngineState, now = Date.now()) => (s.fx && Number.isFinite(s.fx.rate) && s.fx.rate > 1 && now - s.fx.at < 48 * 3600000 ? s.fx.rate : s.settings.ghsPerUsd)
export const newState = (): EngineState => ({ v: 2, sizingMode: 3, pending: null, enabled: true, news: false, binary: START_USD, exness: START_USD, capital: { binary: START_USD, exness: START_USD }, status: 'Starting', lastTick: 0, lastDecision: 0, nextId: 1, ladderMode: 2, ladder: 0, candles: {}, m15: {}, h1: {}, h1At: {}, prices: {}, cycle: null, cycles: [], signals: [], credits: { day: '', n: 0 }, settings: { ...defaultSettings }, copy: newCopy() })
export function setCapital(s: EngineState, binaryGhs: number, exnessGhs: number) { const r = rateOf(s); s.capital = { binary: binaryGhs / r, exness: exnessGhs / r }; s.binary = s.capital.binary; s.exness = s.capital.exness }
/** Clears cycles, signals and the open trade, and puts both accounts back to the starting capital. Copy trading is untouched. */
export function clearAuto(s: EngineState, now = 0) { s.cycle = null; s.cycles = []; s.signals = []; s.nextId = 1; s.ladder = 0; s.ladderDir = null; s.heads = undefined; s.pending = null; s.binary = s.capital.binary; s.exness = s.capital.exness; s.lastDecision = now ? Math.floor(now / 900000) * 900000 : 0 }

/** Recovery ladder: 0 = normal. A losing binary moves 0 -> 1 -> 2; a loss on step 2 halts (back to 0); any win resets to 0. */
export const nextLadder = (rec: number, lost: boolean, on: boolean) => (!on || !lost ? 0 : rec === 0 ? 1 : rec === 1 ? 2 : 0)
const dot = (side: string) => (side === 'BUY' ? '🔵' : '🔴'), esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Everything needed for a trade at an open, without changing any state. step > 0 = forced recovery trade (signal quality, volatility and the news switch are ignored; step 2 doubles stake and lots). */
export function plan(s: EngineState, pair: string, price: number, o: { m15?: Candle[]; step?: number; ignoreOpen?: boolean; dir?: 'CALL' | 'PUT'; noGate?: boolean } = {}) {
  const st = s.settings, pip = pipSize(pair), pv = pipValuePerLot(pair), step = st.recoveryOn ? o.step ?? 0 : 0, forced = step > 0, mult = step === 2 ? st.recoveryMult : 1
  const sig = signalM15({ h1: s.h1[pair] ?? [], m15: o.m15 ?? s.m15[pair] ?? [], price, pip, minStrength: st.minStrength }), reasons: string[] = []
  if (forced || o.noGate) { if (!o.dir && !s.ladderDir && sig.inputs.ema50 === null) reasons.push('Not enough H1 history to pick a direction') } else {
    reasons.push(...sig.reasons); if (s.news) reasons.push('News nearby switch is on')
    if (st.chopFilterOn) { const ch = chopCheck(o.m15 ?? s.m15[pair] ?? [], sig.direction, st.chopBars, st.chopMinBodyPct, st.chopMinEffPct); if (!ch.ok) reasons.push(ch.reason) }   // skip choppy markets
  }
  if (s.cycle && !o.ignoreOpen) reasons.push('Previous cycle still open')
  const stake = +(st.stakeUsd * mult).toFixed(2)
  if (s.binary < stake) reasons.push(`Binary balance is below the ${mult > 1 ? 'doubled ' : ''}stake`)
  const vol = Math.max(1, realizedVol15((s.candles[pair] ?? []).slice(-60).map((c) => c.c), pip) ?? 3.2)
  // Hedge sizing. Stop distance comes from recent volatility. The stop may cost at most stopUsd, and a stop-hit plus commission must still leave minNetWin from a winning binary.
  const rangePips = sig.inputs.atrPips ?? vol * 1.6                              // recent candle range (M15 ATR) in pips: how far candles typically travel
  const win = stake * (st.payoutMin / 100), p0 = Math.max(1.5, st.stopAtrMult * rangePips), budget = st.stopUsd * mult
  const stopLots = budget / (p0 * pv), keepLots = (win - st.minNetWin * mult) / (p0 * pv + st.commission), want = st.autoLots ? Math.min(st.maxLots * mult, stopLots) : st.maxLots * mult
  const perLot = ((pair.startsWith('USD') ? 1 : price * (pv / (100000 * pip))) * 100000) / st.leverage
  let lots = Math.max(0.01, Math.floor(Math.min(want, keepLots) * 100 + 1e-9) / 100); const room = s.exness * 0.9
  if (lots * perLot > room) lots = Math.floor((room / perLot) * 100 + 1e-9) / 100
  if (lots < 0.01) { reasons.push('Exness balance is too small for even 0.01 lots'); lots = 0.01 }
  const f = Math.min(1, (p0 * lots * pv) / budget)
  const dir: 'CALL' | 'PUT' = o.dir ?? (forced && s.ladderDir ? s.ladderDir : sig.direction)
  return { sig, dir, atr: +rangePips.toFixed(2), reasons, stake, lots, f, vol, step, forced, mult, pip, pv, stopPips: +p0.toFixed(2), tpPips: +((st.tpUsd * mult) / (lots * pv)).toFixed(2) }
}

/** Writes the TRADE signal row and opens the paper cycle. entry = price the trade is taken at. */
function startCycle(s: EngineState, pair: string, p: ReturnType<typeof plan>, entry: number, time: string, openT: number, expiryT: number, extra: Partial<SignalRow> = {}): Notice {
  const st = s.settings, sg = p.dir === 'CALL' ? 1 : -1, rec = p.forced ? p.step : 0
  const row: SignalRow = { id: s.nextId++, time, pair, kind: 'TRADE', dir: p.dir, price: entry, strength: p.sig.strength, vol: p.vol, stake: p.stake, lots: p.lots, hedgeSide: sg === 1 ? 'SELL' : 'BUY', sl: entry + sg * p.stopPips * p.pip, tp: entry - sg * p.tpPips * p.pip, stopPips: p.stopPips, tpPips: p.tpPips, stopUsd: p.stopPips * p.lots * p.pv, tpUsd: p.tpPips * p.lots * p.pv, scaled: p.f, rec, atr: p.atr, expiry: new Date(expiryT).toISOString(), reasons: [], skipped: 0, ...extra }
  s.signals.unshift(row)
  s.cycle = { id: s.nextId++, pair, dir: p.dir, entry, openT, expiryT, stake: p.stake, lots: p.lots, pip: p.pip, pipValue: p.pv, stopPips: p.stopPips, tpPips: p.tpPips, strength: p.sig.strength, payout: (st.payoutMin + Math.random() * (st.payoutMax - st.payoutMin)) / 100, costPerLot: st.commission, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null, cwMin: st.counterWindowMin, cMinLeft: st.counterMinLeft, rec }
  return { kind: 'signal', row }
}
/** Drops the waiting setup and records why, as the one red no-trade card for this run. */
export function cancelPending(s: EngineState, reason: string, time: string): Notice[] {
  const pd = s.pending; if (!pd) return []
  s.pending = null
  const last = s.signals.find((x) => x.pair === pd.pair)
  if (last?.kind === 'NO_TRADE') { last.skipped++; last.reasons = [reason] } else s.signals.unshift({ id: s.nextId++, time, pair: pd.pair, kind: 'NO_TRADE', price: pd.ref, strength: pd.strength, vol: pd.atr, reasons: [reason], skipped: 1 })
  return [{ kind: 'info', text: `❌ <b>SETUP CANCELLED</b> · ${pd.pair}\n▫️ ${esc(reason)}\nDo not enter this candle.` }]
}
/** Looks at one price while a setup is waiting: pullback reached = enter there; straight run in favour or too late = skip. candleT = start of the candle being processed. */
function stepPending(s: EngineState, price: number, t: number, candleT: number): Notice[] {
  const pd = s.pending!, time = new Date(t).toISOString(), buy = pd.dir === 'CALL'
  if (candleT < pd.openT) return []
  if (t > pd.until) return cancelPending(s, 'No pullback came in time', time)
  const adverse = buy ? price <= pd.entryLevel : price >= pd.entryLevel, runaway = buy ? price >= pd.skipLevel : price <= pd.skipLevel
  if (runaway && !adverse) return cancelPending(s, 'Price went straight in favour with no pullback', time)
  if (!adverse) return []
  const p = plan(s, pd.pair, pd.entryLevel, { noGate: true, dir: pd.dir, step: 0 })
  if (p.reasons.length) return cancelPending(s, p.reasons[0], time)
  p.sig.strength = pd.strength; s.pending = null
  return [startCycle(s, pd.pair, p, pd.entryLevel, time, candleT, pd.openT + 900000, { pullbackPips: pd.pips, openRef: pd.ref })]
}

/** Decision at the open of a 15-minute candle: records the signal (one red card per no-trade run) and opens a paper cycle when everything is green (or a forced recovery trade is due). */
export function decide(s: EngineState, pair: string, t0: number, price: number): Notice[] {
  s.pending = null
  const st = s.settings, time = new Date(t0).toISOString(), out: Notice[] = [], p = plan(s, pair, price, { step: s.ladder ?? 0 }), sg = p.dir === 'CALL' ? 1 : -1
  const last = s.signals.find((x) => x.pair === pair)
  if (p.reasons.length) {
    if (p.forced) { s.ladder = 0; out.push({ kind: 'info', text: `🛑 <b>RECOVERY ${p.step} NOT PLACED</b>
${p.reasons.map((r) => '▫️ ' + esc(r)).join('\n')}
Ladder reset. Waiting for the next normal signal.` }) }
    if (last?.kind === 'NO_TRADE') { last.skipped++; last.reasons = p.reasons } else s.signals.unshift({ id: s.nextId++, time, pair, kind: 'NO_TRADE', price, strength: p.sig.strength, vol: p.vol, reasons: p.reasons, skipped: 1 })
    out.push({ kind: 'notrade', pair, time, reasons: p.reasons })
  } else {
    if (st.pullbackOn && !p.forced && p.step === 0) {
      // Pullback method: do not enter at the open. Wait for price to move AGAINST the trade by pullbackPct of the recent candle range and enter there.
      // If price runs the other way by the same amount first, the candle is skipped (no Quotex trade and no Exness trade).
      const pips = (p.atr * st.pullbackPct) / 100, d = pips * p.pip
      s.pending = { pair, dir: p.dir, openT: t0, ref: price, entryLevel: price - sg * d, skipLevel: price + sg * d, pips: +pips.toFixed(2), atr: p.atr, strength: p.sig.strength, until: t0 + st.pullbackWindowMin * 60000 }
      out.push({ kind: 'info', text: setupMessage(s.pending) })
    } else out.push(startCycle(s, pair, p, price, time, t0, t0 + 900000))
  }
  if (s.signals.length > 300) s.signals.pop()
  return out
}

/** Heads-up messages 'leadMin' and 1 minute before an open. Uses the live M1 candles to build the forming M15 bar, so it is a preview, not a promise. */
export function previewNotices(s: EngineState, pair: string, next: number, mins: number): Notice[] {
  const st = s.settings, m1 = s.candles[pair] ?? []
  if (!st.headsUp || !isTradingSession(next) || (mins !== st.leadMin && mins !== 1) || m1.length < 15) return []
  const key = `${next}:${mins}`; if (s.headsKey === key) return []
  s.headsKey = key
  const slot = next - 900000, part = m1.filter((c) => c.t >= slot), closed = (s.m15[pair] ?? []).filter((b) => b.t + 900000 <= slot)
  const prov = part.length ? [{ t: slot, o: part[0].o, h: Math.max(...part.map((c) => c.h)), l: Math.min(...part.map((c) => c.l)), c: part[part.length - 1].c }] : []
  const price = m1[m1.length - 1].c, pending = !!s.cycle, p = plan(s, pair, price, { m15: [...closed, ...prov], step: pending ? 0 : s.ladder ?? 0, ignoreOpen: pending && s.cycle!.expiryT <= next })
  const ready = p.reasons.length === 0, dir = ready ? p.dir : null, prev = s.heads?.open === next ? s.heads : null, out: Notice[] = [], when = `${new Date(next).toISOString().slice(11, 16)} GMT`
  s.heads = { open: next, dir, rec: p.step }
  const side = dir === 'CALL' ? 'BUY' : 'SELL', card = ready ? `${dot(side)} <b>${side}</b> ${pair} · ⭐ ${p.sig.strength}/100${p.forced ? ` · 🔁 RECOVERY ${p.step}` : ''}
💵 Stake $${p.stake.toFixed(2)} · Exness ${p.lots.toFixed(2)} lots` : ''
  if (pending && s.settings.recoveryOn && mins === st.leadMin) out.push({ kind: 'info', text: `ℹ️ <b>Current trade ends at ${when}.</b>
If its binary loses, a 🔁 RECOVERY trade follows at that open regardless of the signal, in the SAME direction (${s.cycle!.dir === 'CALL' ? '🔵 BUY' : '🔴 SELL'}).` })
  if (ready && !prev?.dir) out.push({ kind: 'info', text: `⏰ <b>HEADS-UP</b> · open ${when} (in ${mins} min)
${card}
⚠️ Preview only. It is confirmed at the open.` })
  else if (ready && prev?.dir === dir) out.push({ kind: 'info', text: `✅ <b>STILL ON</b> · open ${when} (in ${mins} min)
${card}` })
  else if (ready && prev?.dir) out.push({ kind: 'info', text: `🔄 <b>CHANGED</b> · open ${when}
Now ${card}` })
  else if (prev?.dir) out.push({ kind: 'info', text: `❌ <b>HEADS-UP CANCELLED</b> · open ${when}
${p.reasons.map((r) => '▫️ ' + esc(r)).join('\n')}` })
  return out
}

/** Books a finished cycle: balances, log row, recovery ladder. */
function finish(s: EngineState, cy: Cycle, x: Settled, time: string, pair: string, out: Notice[]) {
  s.binary += x.binary + x.counter; s.exness += x.exness - x.cost
        const row: CycleLogRow = { id: cy.id, time, pair, direction: cy.dir, entry: cy.entry, strength: cy.strength, stake: cy.stake, lots: cy.lots, binaryResult: x.binaryWin ? 'WIN' : 'LOSS', counterResult: x.counterWin === null ? undefined : x.counterWin ? 'WIN' : 'LOSS', exnessResult: +x.exness.toFixed(2), costs: +x.cost.toFixed(2), netPnl: x.net, outcomeTag: x.tag, source: 'live', binaryPnl: +x.binary.toFixed(2), counterPnl: +x.counter.toFixed(2), exnessPnl: +(x.exness - x.cost).toFixed(2), payout: +cy.payout.toFixed(4), rec: cy.rec ?? 0 }
        s.cycles.unshift(row); out.push({ kind: 'cycle', row })
        const nl = nextLadder(cy.rec ?? 0, !x.binaryWin, s.settings.recoveryOn); s.ladder = nl; s.ladderDir = nl === 0 ? null : (cy.rec ?? 0) === 0 ? cy.dir : s.ladderDir
        if (!x.binaryWin && s.settings.recoveryOn) out.push({ kind: 'info', text: nl === 0 ? '🛑 <b>RECOVERY LADDER HALTED</b> after 3 losing binaries.\nWaiting for the next normal signal.' : `🔁 <b>RECOVERY ${nl} QUEUED</b>\nThe binary lost, so the next candle is traded regardless in the SAME direction (${s.ladderDir === 'CALL' ? '🔵 BUY' : '🔴 SELL'})${nl === 2 ? ', with DOUBLE stake and lots' : ''}.` })
        if (s.cycles.length > 400) s.cycles.pop(); s.cycle = null
}
/** Settles a cycle whose 15 minutes are over, using the given price. Used right at an open (so the new decision never sees a stale open cycle) and as a safety net if the data feed lags. */
export function settleExpired(s: EngineState, price: number, now: number): Notice[] {
  const cy = s.cycle, out: Notice[] = []
  if (!cy || cy.expiryT > now) return out
  const r = step(cy, price, cy.expiryT)
  r.events.filter((e) => !e.startsWith('EXPIRY')).forEach((e) => out.push({ kind: 'info', text: infoMessage(cy.pair, e) }))
  if (r.settled) finish(s, cy, r.settled, new Date(cy.expiryT).toISOString(), cy.pair, out)
  return out
}

/** Feed one CLOSED real 1-minute candle: steps the open cycle and any copy trades on this pair. */
export function processCandle(s: EngineState, pair: string, c: Candle): Notice[] {
  const out: Notice[] = [], arr = (s.candles[pair] ??= [])
  if (arr.length && arr[arr.length - 1].t >= c.t) return out
  arr.push(c); if (arr.length > 400) arr.shift(); s.prices[pair] = c.c
  processCopyCandle(s.copy, pair, c)
  const end = c.t + 60000, time = new Date(end).toISOString()
  const path = c.c >= c.o ? [c.o, c.l, c.h, c.c] : [c.o, c.h, c.l, c.c]
  for (let i = 0; i < 4; i++) {
    const t = i === 3 ? end : c.t + (i + 1) * 15000
    if (s.pending && s.pending.pair === pair) out.push(...stepPending(s, path[i], t, c.t))
    if (s.cycle && s.cycle.pair === pair && c.t >= s.cycle.openT) {
      const cy = s.cycle, r = step(cy, path[i], t)
      r.events.filter((e) => !e.startsWith('EXPIRY')).forEach((e) => out.push({ kind: 'info', text: infoMessage(pair, e) }))
      if (r.settled) finish(s, cy, r.settled, time, pair, out)
    }
  }
  return out
}

const dp = (pair: string) => (pair.endsWith('JPY') ? 3 : 5), usd = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
const hm = (iso?: string) => (iso ? iso.slice(11, 16) : '')
/** Telegram text (HTML parse mode). Blue = BUY, red = SELL, on both the Quotex and Exness sides. */
export const signalMessage = (r: SignalRow) => {
  const d = dp(r.pair), buy = r.dir === 'CALL', pip = r.pair.endsWith('JPY') ? 0.01 : 0.0001, counter = r.price + (buy ? 1 : -1) * 0.5 * pip, q = buy ? 'BUY' : 'SELL', cside = buy ? 'SELL' : 'BUY'
  return `🟢 <b>TRADE SIGNAL</b>${r.pullbackPips ? ' · ↩️ <b>PULLBACK ENTRY</b>' : ''}${r.rec ? ` · 🔁 <b>RECOVERY ${r.rec}</b>${r.rec === 2 ? ' (DOUBLE)' : ''}` : ''}
🕒 ${hm(r.time)} GMT · ${r.pair} · ⭐ ${r.strength}/100
━━━━━━━━━━━━━━
${dot(q)} <b>QUOTEX: ${q}</b> (${r.dir})
💵 Stake $${r.stake?.toFixed(2)} · ⏱ ${r.pullbackPips ? 'to the candle end' : '15 min'} · expires ${hm(r.expiry)} GMT
📍 Entry about ${r.price.toFixed(d)}${r.pullbackPips ? ` (pullback of ${r.pullbackPips}p from the open ${r.openRef?.toFixed(d)})` : ''}${r.atr ? `
📏 Recent range (ATR) ${r.atr}p` : ''}
━━━━━━━━━━━━━━
${dot(r.hedgeSide!)} <b>EXNESS: ${r.hedgeSide}</b> ${r.lots?.toFixed(2)} lots
🛑 Stop ${r.sl?.toFixed(d)} (${r.stopPips}p · -$${r.stopUsd?.toFixed(2)})
🎯 Take profit ${r.tp?.toFixed(d)} (${r.tpPips}p · +$${r.tpUsd?.toFixed(2)})
━━━━━━━━━━━━━━
🔄 Counter: if the stop hits and price returns to ${counter.toFixed(d)} in the last 5 min, buy ${dot(cside)} <b>${cside}</b> $${r.stake?.toFixed(2)}, same expiry${r.scaled !== undefined && r.scaled < 0.95 ? `\n⚠️ Hedge sized to ${(r.scaled * 100).toFixed(0)}% of the stop budget, so a stop-hit still leaves a profit from the binary.` : ''}
📝 Paper signal. You trade manually elsewhere.`
}
export const setupMessage = (p: Pending) => { const buy = p.dir === 'CALL', side = buy ? 'BUY' : 'SELL', d = dp(p.pair); return `⏳ <b>SETUP</b> · ${p.pair} · ⭐ ${p.strength}/100\n${dot(side)} <b>${side}</b> planned. Do NOT enter at the open (${p.ref.toFixed(d)}).\n↩️ Enter ${side} when price ${buy ? 'falls' : 'rises'} to <b>${p.entryLevel.toFixed(d)}</b> (${p.pips}p pullback)\n❌ Skip if price ${buy ? 'rises' : 'falls'} to ${p.skipLevel.toFixed(d)} first\n⏱ Waiting until ${new Date(p.until).toISOString().slice(11, 16)} GMT` }
export const noTradeMessage = (pair: string, time: string, reasons: string[]) => `⛔ <b>NO TRADE</b> · ${hm(time)} GMT · ${pair}
${reasons.map((x) => '▫️ ' + esc(x)).join('\n')}`
export const cycleMessage = (r: CycleLogRow) => {
  const q = (r.binaryPnl ?? 0) + (r.counterPnl ?? 0), e = r.exnessPnl ?? r.exnessResult - r.costs, side = r.direction === 'CALL' ? 'BUY' : 'SELL'
  return `${r.netPnl >= 0 ? '✅' : '❌'} <b>CYCLE CLOSED</b> · ${r.pair} ${dot(side)} ${side}${r.rec ? ` · 🔁 recovery ${r.rec}` : ''}
📋 ${esc(r.outcomeTag)}
${q >= 0 ? '🟢' : '🔴'} Quotex ${usd(q)}
${e >= 0 ? '🟢' : '🔴'} Exness ${usd(e)}
💰 <b>Net ${usd(r.netPnl)}</b> (paper)`
}
export function infoMessage(pair: string, e: string) {
  if (e.startsWith('STOP_HIT')) return `🛑 <b>STOP HIT</b> · ${pair}
The Exness hedge is stopped. Watch for the counter window.`
  if (e.startsWith('TP_HIT')) return `🎯 <b>TAKE PROFIT HIT</b> · ${pair}
Close the Exness hedge now.`
  const c = e.match(/^COUNTER_OPENED (CALL|PUT)/)
  if (c) { const side = c[1] === 'CALL' ? 'BUY' : 'SELL'; const px = e.match(/ at ([0-9.]+)/)?.[1]; return `⚡ <b>COUNTER NOW</b> · ${pair}
Buy ${dot(side)} <b>${side}</b>${px ? ' at about ' + px : ''} with the same expiry.` }
  if (e.startsWith('COUNTER_CANCELLED')) return `⚠️ <b>Counter cancelled</b> · ${pair}
${esc(e.replace('COUNTER_CANCELLED ', ''))}`
  return `ℹ️ ${pair}: ${esc(e)}`
}
/** Plain-text P&L report for the last hour and the current UTC day. rate = GH₵ per USD. */
export function summaryText(cycles: CycleLogRow[], binary: number, exness: number, now: number, rate = 11) {
  const hr = cycles.filter((c) => now - Date.parse(c.time) <= 3600000), day = cycles.filter((c) => c.time.slice(0, 10) === new Date(now).toISOString().slice(0, 10))
  const net = (x: CycleLogRow[]) => x.reduce((a, c) => a + c.netPnl, 0), f = (v: number) => `${usd(v)} (GH₵${Math.abs(v * rate).toFixed(2)})`, ic = (x: CycleLogRow[]) => (net(x) >= 0 ? '📈' : '📉')
  return `💰 <b>HOURLY REPORT</b> (paper)
${ic(hr)} Last hour: ${hr.length} cycles, ${hr.length ? f(net(hr)) : 'no trades'}
${ic(day)} Today: ${day.length} cycles, ${day.length ? f(net(day)) : 'no trades'}
🔵 Quotex account GH₵${(binary * rate).toFixed(2)}
🟠 Exness account GH₵${(exness * rate).toFixed(2)}`
}

const RANGES: Record<string, [number, number]> = { stakeUsd: [0.5, 5000], payoutMin: [50, 100], payoutMax: [50, 100], maxLots: [0.01, 50], stopUsd: [0.1, 100000], tpUsd: [0.1, 100000], commission: [0, 100], counterWindowMin: [1, 14], counterMinLeft: [0, 14], minStrength: [0, 100], leverage: [1, 3000], minNetWin: [0, 10000], stopAtrMult: [0.2, 3], pullbackPct: [5, 100], pullbackWindowMin: [1, 14], chopBars: [3, 20], chopMinBodyPct: [5, 95], chopMinEffPct: [5, 95], ghsPerUsd: [1, 1000], copyLots: [0.01, 50], recoveryMult: [1, 5], leadMin: [1, 5] }
/** Checks a settings patch from the website. Returns the cleaned values to apply, or an error to show. Unknown keys and recoveryOn (the button owns that) are ignored. */
export function validateSettings(patch: Record<string, unknown>, current: Settings): { ok: true; values: Partial<Settings> } | { ok: false; error: string } {
  const values: Record<string, number | boolean> = {}
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k === 'recoveryOn' || k === 'pullbackOn' || !(k in defaultSettings)) continue
    const want = typeof (defaultSettings as unknown as Record<string, unknown>)[k]
    if (typeof v !== want) return { ok: false, error: `${k} must be a ${want}` }
    if (want === 'number') { const r = RANGES[k], n = v as number; if (!Number.isFinite(n) || (r && (n < r[0] || n > r[1]))) return { ok: false, error: `${k} must be between ${r?.[0]} and ${r?.[1]}` } }
    values[k] = v as number | boolean
  }
  const min = (values.payoutMin ?? current.payoutMin) as number, max = (values.payoutMax ?? current.payoutMax) as number
  if (min > max) return { ok: false, error: 'Payout minimum cannot be above the maximum' }
  return { ok: true, values: values as Partial<Settings> }
}
