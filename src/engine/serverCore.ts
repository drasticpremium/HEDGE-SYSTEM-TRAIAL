import { realizedVol15, type Candle } from './math'
import { step, type Cycle } from './cycle'
import { signalM15 } from './signalM15'
import { pipSize, pipValuePerLot } from './pairs'
import { newCopy, processCopyCandle, type CopyState } from './copyCore'
import type { CycleLogRow, SignalRow } from '../db/db'

/** Mon-Fri, 08:00-17:00 GMT. Entries happen at 15-minute opens from 08:00 to 16:45 so the 15-minute binary ends by 17:00. */
export const isTradingSession = (t: number) => { const d = new Date(t), day = d.getUTCDay(); return day >= 1 && day <= 5 && d.getUTCHours() >= 8 && d.getUTCHours() < 17 }
export interface Settings { stakeUsd: number; payoutMin: number; payoutMax: number; maxLots: number; autoLots: boolean; stopUsd: number; tpUsd: number; commission: number; counterWindowMin: number; counterMinLeft: number; minStrength: number; ghsPerUsd: number; leverage: number; tgNoTrade: boolean; copyLots: number; recoveryOn: boolean; recoveryMult: number; headsUp: boolean; leadMin: number }
export const defaultSettings: Settings = { stakeUsd: 5, payoutMin: 91, payoutMax: 95, maxLots: 0.2, autoLots: true, stopUsd: 8, tpUsd: 15, commission: 9, counterWindowMin: 5, counterMinLeft: 1, minStrength: 60, ghsPerUsd: 11, leverage: 500, tgNoTrade: true, copyLots: 0.01, recoveryOn: true, recoveryMult: 2, headsUp: true, leadMin: 2 }
export type Notice = { kind: 'signal'; row: SignalRow } | { kind: 'cycle'; row: CycleLogRow } | { kind: 'notrade'; pair: string; time: string; reasons: string[] } | { kind: 'info'; text: string }
export interface EngineState {
  v?: number; enabled: boolean; news: boolean; binary: number; exness: number; capital: { binary: number; exness: number }; status: string; lastTick: number; lastDecision: number; nextId: number; ladder?: number; ladderDir?: 'CALL' | 'PUT' | null; heads?: { open: number; dir: 'CALL' | 'PUT' | null; rec: number }; headsKey?: string
  candles: Record<string, Candle[]>; m15: Record<string, Candle[]>; h1: Record<string, Candle[]>; h1At: Record<string, number>; prices: Record<string, number>
  cycle: Cycle | null; cycles: CycleLogRow[]; signals: SignalRow[]; credits: { day: string; n: number }; lastReport?: string; settings: Settings; copy: CopyState
}
export const START_USD = 250 / 11
export const newState = (): EngineState => ({ v: 2, enabled: true, news: false, binary: START_USD, exness: START_USD, capital: { binary: START_USD, exness: START_USD }, status: 'Starting', lastTick: 0, lastDecision: 0, nextId: 1, ladder: 0, candles: {}, m15: {}, h1: {}, h1At: {}, prices: {}, cycle: null, cycles: [], signals: [], credits: { day: '', n: 0 }, settings: { ...defaultSettings }, copy: newCopy() })
export function setCapital(s: EngineState, binaryGhs: number, exnessGhs: number) { const r = s.settings.ghsPerUsd; s.capital = { binary: binaryGhs / r, exness: exnessGhs / r }; s.binary = s.capital.binary; s.exness = s.capital.exness }
/** Clears cycles, signals and the open trade, and puts both accounts back to the starting capital. Copy trading is untouched. */
export function clearAuto(s: EngineState) { s.cycle = null; s.cycles = []; s.signals = []; s.nextId = 1; s.ladder = 0; s.ladderDir = null; s.heads = undefined; s.binary = s.capital.binary; s.exness = s.capital.exness; s.lastDecision = 0 }

/** Recovery ladder: 0 = normal. A losing binary moves 0 -> 1 -> 2; a loss on step 2 halts (back to 0); any win resets to 0. */
export const nextLadder = (rec: number, lost: boolean, on: boolean) => (!on || !lost ? 0 : rec === 0 ? 1 : rec === 1 ? 2 : 0)
const dot = (side: string) => (side === 'BUY' ? '🔵' : '🔴'), esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Everything needed for a trade at an open, without changing any state. step > 0 = forced recovery trade (signal quality, volatility and the news switch are ignored; step 2 doubles stake and lots). */
export function plan(s: EngineState, pair: string, price: number, o: { m15?: Candle[]; step?: number; ignoreOpen?: boolean } = {}) {
  const st = s.settings, pip = pipSize(pair), pv = pipValuePerLot(pair), step = st.recoveryOn ? o.step ?? 0 : 0, forced = step > 0, mult = step === 2 ? st.recoveryMult : 1
  const sig = signalM15({ h1: s.h1[pair] ?? [], m15: o.m15 ?? s.m15[pair] ?? [], price, pip, minStrength: st.minStrength }), reasons: string[] = []
  if (forced) { if (!s.ladderDir && sig.inputs.ema50 === null) reasons.push('Not enough H1 history to pick a direction') } else { reasons.push(...sig.reasons); if (s.news) reasons.push('News nearby switch is on') }
  if (s.cycle && !o.ignoreOpen) reasons.push('Previous cycle still open')
  const stake = +(st.stakeUsd * mult).toFixed(2)
  if (s.binary < stake) reasons.push(`Binary balance is below the ${mult > 1 ? 'doubled ' : ''}stake`)
  const vol = Math.max(1, realizedVol15((s.candles[pair] ?? []).slice(-60).map((c) => c.c), pip) ?? 3.2)
  const base = st.autoLots ? Math.min(st.maxLots, Math.max(0.01, Math.floor((st.stopUsd / (1.25 * vol * pv)) * 100 + 1e-9) / 100)) : st.maxLots, desired = +(base * mult).toFixed(2)
  const perLot = ((pair.startsWith('USD') ? 1 : price * (pv / (100000 * pip))) * 100000) / st.leverage
  let lots = desired; const room = s.exness * 0.9
  if (lots * perLot > room) lots = Math.floor((room / perLot) * 100 + 1e-9) / 100
  if (lots < 0.01) { reasons.push('Exness balance is too small for even 0.01 lots'); lots = 0.01 }
  const f = Math.min(1, lots / desired)
  const dir: 'CALL' | 'PUT' = forced && s.ladderDir ? s.ladderDir : sig.direction
  return { sig, dir, reasons, stake, lots, f, vol, step, forced, mult, pip, pv, stopPips: +((st.stopUsd * mult * f) / (lots * pv)).toFixed(2), tpPips: +((st.tpUsd * mult * f) / (lots * pv)).toFixed(2) }
}

/** Decision at the open of a 15-minute candle: records the signal (one red card per no-trade run) and opens a paper cycle when everything is green (or a forced recovery trade is due). */
export function decide(s: EngineState, pair: string, t0: number, price: number): Notice[] {
  const st = s.settings, time = new Date(t0).toISOString(), out: Notice[] = [], p = plan(s, pair, price, { step: s.ladder ?? 0 }), sg = p.dir === 'CALL' ? 1 : -1
  const last = s.signals.find((x) => x.pair === pair)
  if (p.reasons.length) {
    if (p.forced) { s.ladder = 0; out.push({ kind: 'info', text: `🛑 <b>RECOVERY ${p.step} NOT PLACED</b>
${p.reasons.map((r) => '▫️ ' + esc(r)).join('\n')}
Ladder reset. Waiting for the next normal signal.` }) }
    if (last?.kind === 'NO_TRADE') { last.skipped++; last.reasons = p.reasons } else s.signals.unshift({ id: s.nextId++, time, pair, kind: 'NO_TRADE', price, strength: p.sig.strength, vol: p.vol, reasons: p.reasons, skipped: 1 })
    out.push({ kind: 'notrade', pair, time, reasons: p.reasons })
  } else {
    const rec = p.forced ? p.step : 0
    const row: SignalRow = { id: s.nextId++, time, pair, kind: 'TRADE', dir: p.dir, price, strength: p.sig.strength, vol: p.vol, stake: p.stake, lots: p.lots, hedgeSide: sg === 1 ? 'SELL' : 'BUY', sl: price + sg * p.stopPips * p.pip, tp: price - sg * p.tpPips * p.pip, stopPips: p.stopPips, tpPips: p.tpPips, stopUsd: p.stopPips * p.lots * p.pv, tpUsd: p.tpPips * p.lots * p.pv, scaled: p.f, rec, expiry: new Date(t0 + 900000).toISOString(), reasons: [], skipped: 0 }
    s.signals.unshift(row); out.push({ kind: 'signal', row })
    s.cycle = { id: s.nextId++, pair, dir: p.dir, entry: price, openT: t0, expiryT: t0 + 900000, stake: p.stake, lots: p.lots, pip: p.pip, pipValue: p.pv, stopPips: p.stopPips, tpPips: p.tpPips, strength: p.sig.strength, payout: (st.payoutMin + Math.random() * (st.payoutMax - st.payoutMin)) / 100, costPerLot: st.commission, stopHit: false, tpHit: false, counterState: 'none', counterEntry: null, cwMin: st.counterWindowMin, cMinLeft: st.counterMinLeft, rec }
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
      r.events.filter((e) => !e.startsWith('EXPIRY')).forEach((e) => out.push({ kind: 'info', text: infoMessage(pair, e) }))
      if (r.settled) {
        const x = r.settled; s.binary += x.binary + x.counter; s.exness += x.exness - x.cost
        const row: CycleLogRow = { id: cy.id, time, pair, direction: cy.dir, entry: cy.entry, strength: cy.strength, stake: cy.stake, lots: cy.lots, binaryResult: x.binaryWin ? 'WIN' : 'LOSS', counterResult: x.counterWin === null ? undefined : x.counterWin ? 'WIN' : 'LOSS', exnessResult: +x.exness.toFixed(2), costs: +x.cost.toFixed(2), netPnl: x.net, outcomeTag: x.tag, source: 'live', binaryPnl: +x.binary.toFixed(2), counterPnl: +x.counter.toFixed(2), exnessPnl: +(x.exness - x.cost).toFixed(2), payout: +cy.payout.toFixed(4), rec: cy.rec ?? 0 }
        s.cycles.unshift(row); out.push({ kind: 'cycle', row })
        const nl = nextLadder(cy.rec ?? 0, !x.binaryWin, s.settings.recoveryOn); s.ladder = nl; s.ladderDir = nl === 0 ? null : (cy.rec ?? 0) === 0 ? cy.dir : s.ladderDir
        if (!x.binaryWin && s.settings.recoveryOn) out.push({ kind: 'info', text: nl === 0 ? '🛑 <b>RECOVERY LADDER HALTED</b> after 3 losing binaries.\nWaiting for the next normal signal.' : `🔁 <b>RECOVERY ${nl} QUEUED</b>\nThe binary lost, so the next candle is traded regardless in the SAME direction (${s.ladderDir === 'CALL' ? '🔵 BUY' : '🔴 SELL'})${nl === 2 ? ', with DOUBLE stake and lots' : ''}.` })
        if (s.cycles.length > 400) s.cycles.pop(); s.cycle = null
      }
    }
  }
  return out
}

const dp = (pair: string) => (pair.endsWith('JPY') ? 3 : 5), usd = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
const hm = (iso?: string) => (iso ? iso.slice(11, 16) : '')
/** Telegram text (HTML parse mode). Blue = BUY, red = SELL, on both the Quotex and Exness sides. */
export const signalMessage = (r: SignalRow) => {
  const d = dp(r.pair), buy = r.dir === 'CALL', pip = r.pair.endsWith('JPY') ? 0.01 : 0.0001, counter = r.price + (buy ? 1 : -1) * 0.5 * pip, q = buy ? 'BUY' : 'SELL', cside = buy ? 'SELL' : 'BUY'
  return `🟢 <b>TRADE SIGNAL</b>${r.rec ? ` · 🔁 <b>RECOVERY ${r.rec}</b>${r.rec === 2 ? ' (DOUBLE)' : ''}` : ''}
🕒 ${hm(r.time)} GMT · ${r.pair} · ⭐ ${r.strength}/100
━━━━━━━━━━━━━━
${dot(q)} <b>QUOTEX: ${q}</b> (${r.dir})
💵 Stake $${r.stake?.toFixed(2)} · ⏱ 15 min · expires ${hm(r.expiry)} GMT
📍 Entry about ${r.price.toFixed(d)}
━━━━━━━━━━━━━━
${dot(r.hedgeSide!)} <b>EXNESS: ${r.hedgeSide}</b> ${r.lots?.toFixed(2)} lots
🛑 Stop ${r.sl?.toFixed(d)} (${r.stopPips}p · -$${r.stopUsd?.toFixed(2)})
🎯 Take profit ${r.tp?.toFixed(d)} (${r.tpPips}p · +$${r.tpUsd?.toFixed(2)})
━━━━━━━━━━━━━━
🔄 Counter: if the stop hits and price returns to ${counter.toFixed(d)} in the last 5 min, buy ${dot(cside)} <b>${cside}</b> $${r.stake?.toFixed(2)}, same expiry${r.scaled !== undefined && r.scaled < 1 ? `\n⚠️ Hedge scaled to ${(r.scaled * 100).toFixed(0)}% of plan to fit the Exness balance.` : ''}
📝 Paper signal. You trade manually elsewhere.`
}
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
  if (c) { const side = c[1] === 'CALL' ? 'BUY' : 'SELL'; return `⚡ <b>COUNTER NOW</b> · ${pair}
Buy ${dot(side)} <b>${side}</b> with the same expiry.` }
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
