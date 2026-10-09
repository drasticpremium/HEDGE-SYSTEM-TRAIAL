// Cloudflare Worker: serves the site and /api/*, and runs the 24/7 paper trader every minute (cron) inside a Durable Object.
import { newState, decide, processCandle, isTradingSession, signalMessage, noTradeMessage, cycleMessage, summaryText, setCapital, clearAuto, defaultSettings, type EngineState, type Notice } from '../engine/serverCore'
import { addCopy, newCopy, pnlUsd, processCopyCandle, type CopyInput } from '../engine/copyCore'
import type { Candle } from '../engine/math'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const sym = (p: string) => `${p.slice(0, 3)}/${p.slice(3)}`
const series = (j: any, tf: number, now: number): Candle[] => (j.values ?? []).map((v: any) => ({ t: Date.parse(String(v.datetime).replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close })).filter((c: Candle) => c.t + tf <= now + 1000)
const view = (s: EngineState, env: any) => ({
  telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), now: Date.now(), enabled: s.enabled, news: s.news, status: s.status, lastTick: s.lastTick, credits: s.credits, binary: s.binary, exness: s.exness, capital: s.capital, settings: s.settings,
  cycle: s.cycle, prices: s.prices, cycles: s.cycles.slice(0, 100), signals: s.signals.slice(0, 80), candles: Object.fromEntries(Object.entries(s.candles).map(([k, v]) => [k, v.slice(-150)])), copy: { balance: s.copy.balance, start: s.copy.start, trades: s.copy.trades.slice(0, 80) },
})
async function tg(env: any, text: string): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 'Telegram secrets not set (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)'
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }) }); return r.ok ? '' : `Telegram error ${r.status}: ${await r.text()}` } catch (e: any) { return 'Telegram failed: ' + e.message }
}

export class Engine {
  constructor(private ctx: any, private env: any) {}
  private async load(): Promise<EngineState> { const s = (await this.ctx.storage.get('s')) as EngineState | undefined; return s && s.v === 2 ? s : newState() }
  /** One Twelve Data call. Counts against a 780/day budget (free plan is 800). */
  private async td(s: EngineState, q: string): Promise<any> {
    if (s.credits.n >= 780) throw new Error('Daily free-tier credit budget reached (780 of 800). Resumes tomorrow.')
    s.credits.n++
    const j: any = await (await fetch(`https://api.twelvedata.com/${q}&apikey=${this.env.TWELVE_DATA_KEY}`)).json()
    if (j.status === 'error') throw new Error(j.message ?? 'Data error')
    return j
  }
  async fetch(req: Request) {
    const path = new URL(req.url).pathname
    if (path === '/tick') { await this.tick(); return json({ ok: true }) }
    const s = await this.load()
    let testResult = ''
    if (path === '/control' && req.method === 'POST') {
      const b: any = JSON.parse((await req.text()) || '{}')
      try {
        if (b.action === 'pause') s.enabled = false
        else if (b.action === 'resume') s.enabled = true
        else if (b.action === 'settings') { for (const [k, v] of Object.entries(b.settings ?? {})) if (k in defaultSettings && typeof v === typeof (defaultSettings as any)[k] && (typeof v !== 'number' || Number.isFinite(v))) (s.settings as any)[k] = v; testResult = 'Settings saved' }
        else if (b.action === 'capital') { setCapital(s, +b.binaryGhs, +b.exnessGhs); testResult = 'Capital updated (history kept)' }
        else if (b.action === 'reset') { if (b.binaryGhs && b.exnessGhs) setCapital(s, +b.binaryGhs, +b.exnessGhs); clearAuto(s); testResult = 'Auto trader data cleared and accounts reset' }
        else if (b.action === 'telegram_test') testResult = (await tg(this.env, 'Test message from Hedge Signal Desk. Alerts are working.')) || 'Telegram test message sent'
        else if (b.action === 'copy_add') {
          const t = b.trade as CopyInput
          if (!/^[A-Z]{6}$/.test(t.pair) || (t.side !== 'BUY' && t.side !== 'SELL')) throw new Error('Pair or side is invalid')
          const price = Number((await this.td(s, `price?symbol=${sym(t.pair)}`)).price)
          addCopy(s.copy, { ...t, lots: t.lots > 0 ? t.lots : s.settings.copyLots }, price, new Date().toISOString(), s.nextId++); testResult = `Copy trade added at live price ${price}`
        } else if (b.action === 'copy_close') {
          const t = s.copy.trades.find((x) => x.id === b.id)
          if (t && t.status === 'PENDING') { t.status = 'CANCELLED'; testResult = 'Pending order cancelled' }
          else if (t && t.status === 'OPEN') { const price = Number((await this.td(s, `price?symbol=${sym(t.pair)}`)).price), p = pnlUsd(t.pair, (price - t.fillPrice!) * (t.side === 'BUY' ? 1 : -1), t.remaining); t.realized += p; s.copy.balance += p; t.remaining = 0; t.status = 'CLOSED'; t.exit = 'Manual'; t.closedAt = new Date().toISOString(); testResult = `Closed at ${price}` }
        } else if (b.action === 'copy_reset') { s.copy = newCopy(b.ghs ? +b.ghs / s.settings.ghsPerUsd : s.copy.start); testResult = 'Copy-trade data cleared' }
        else if (typeof b.news === 'boolean') s.news = b.news
      } catch (e: any) { testResult = 'Failed: ' + e.message }
      await this.ctx.storage.put('s', s)
    }
    return json({ ...view(s, this.env), testResult })
  }
  async tick() {
    const s = await this.load(), now = Date.now(), env = this.env, notices: Notice[] = []
    s.lastTick = now
    const auto = String(env.PAIRS || 'EURUSD').split(',')[0].trim()
    const day = new Date(now).toISOString().slice(0, 10); if (s.credits.day !== day) s.credits = { day, n: 0 }
    if (!s.enabled) s.status = 'Paused'
    else if (!env.TWELVE_DATA_KEY) s.status = 'Missing secret TWELVE_DATA_KEY. Add it in Cloudflare (see setup steps).'
    else { try { await this.run(s, auto, now, notices) } catch (e: any) { s.status = 'Data error: ' + e.message } }
    for (const n of notices) {
      if (n.kind === 'signal') await tg(env, signalMessage(n.row))
      else if (n.kind === 'cycle') await tg(env, cycleMessage(n.row))
      else if (n.kind === 'info') await tg(env, n.text)
      else if (s.settings.tgNoTrade) await tg(env, noTradeMessage(n.pair, n.time, n.reasons))
    }
    const d = new Date(now), key = d.toISOString().slice(0, 13), hr = d.getUTCHours()
    if (s.enabled && d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && hr >= 9 && hr <= 17 && d.getUTCMinutes() < 10 && s.lastReport !== key) { s.lastReport = key; await tg(env, summaryText(s.cycles, s.binary, s.exness, now, s.settings.ghsPerUsd)) }
    await this.ctx.storage.put('s', s)
  }
  private async run(s: EngineState, auto: string, now: number, notices: Notice[]) {
    const inSession = isTradingSession(now), t0 = Math.floor(now / 900000) * 900000
    const copyPairs = [...new Set(s.copy.trades.filter((t) => t.status === 'PENDING' || t.status === 'OPEN').map((t) => t.pair))]
    const seeded = (s.candles[auto]?.length ?? 0) > 20 && (s.h1[auto]?.length ?? 0) >= 50 && (s.m15[auto]?.length ?? 0) >= 20
    const m1 = async (pair: string, n: number) => series(await this.td(s, `time_series?symbol=${sym(pair)}&interval=1min&outputsize=${n}&timezone=UTC&order=asc`), 60000, now)
    if (!seeded) {
      s.m15[auto] = series(await this.td(s, `time_series?symbol=${sym(auto)}&interval=15min&outputsize=60&timezone=UTC&order=asc`), 900000, now)
      s.h1[auto] = series(await this.td(s, `time_series?symbol=${sym(auto)}&interval=1h&outputsize=80&timezone=UTC&order=asc`), 3600000, now); s.h1At[auto] = now
      s.candles[auto] = await m1(auto, 120); s.prices[auto] = s.candles[auto].at(-1)?.c ?? 0
    } else if (inSession || s.cycle || copyPairs.includes(auto)) {
      for (const c of await m1(auto, 5)) notices.push(...processCandle(s, auto, c)) // settle anything that ended at this open BEFORE deciding
      if (isTradingSession(t0) && t0 > s.lastDecision && now - t0 < 10 * 60000) {
        s.m15[auto] = series(await this.td(s, `time_series?symbol=${sym(auto)}&interval=15min&outputsize=60&timezone=UTC&order=asc`), 900000, now)
        if (now - (s.h1At[auto] ?? 0) > 55 * 60000) { s.h1[auto] = series(await this.td(s, `time_series?symbol=${sym(auto)}&interval=1h&outputsize=80&timezone=UTC&order=asc`), 3600000, now); s.h1At[auto] = now }
        const price = Number((await this.td(s, `price?symbol=${sym(auto)}`)).price)
        s.lastDecision = t0; notices.push(...decide(s, auto, t0, price))
      }
    }
    for (const p of copyPairs) if (p !== auto) for (const c of await m1(p, 3)) processCopyCandle(s.copy, p, c)
    s.status = !seeded ? 'Loaded history. Trading starts at the next 15-minute open inside 08:00-17:00 GMT.' : inSession ? `Live: ${auto}, deciding at every 15-minute open until 16:45 GMT.` : 'Market session closed (08:00-17:00 GMT, Mon-Fri). Auto trading sleeps and uses no data credits.'
  }
}
const stub = (env: any) => env.ENGINE.get(env.ENGINE.idFromName('main'))
export default {
  async fetch(req: Request, env: any) {
    const u = new URL(req.url)
    if (!u.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    const path = u.pathname.slice(4)
    if (path !== '/state' && path !== '/control') return json({ error: 'not found' }, 404)
    if (req.method === 'POST' && (!env.ADMIN_TOKEN || req.headers.get('x-admin-token') !== env.ADMIN_TOKEN)) return json({ error: 'Controls need the ADMIN_TOKEN secret set in Cloudflare and the same token entered here.' }, 403)
    return stub(env).fetch('https://engine' + path, { method: req.method, body: req.method === 'POST' ? await req.text() : undefined })
  },
  async scheduled(_e: unknown, env: any, ctx: any) { ctx.waitUntil(stub(env).fetch('https://engine/tick')) },
}
