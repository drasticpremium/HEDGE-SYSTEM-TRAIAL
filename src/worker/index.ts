// Cloudflare Worker: serves the site, a read-only /api/state, and runs the 24/7 paper trader once a minute (cron) inside a Durable Object.
import { newState, processCandle, signalMessage, cycleMessage, summaryText, type EngineState, type Notice } from '../engine/serverCore'
import { isTradingSession } from '../engine/evaluate'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const view = (s: EngineState, env: any) => ({ telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), now: Date.now(), enabled: s.enabled, news: s.news, status: s.status, lastTick: s.lastTick, credits: s.credits, binary: s.binary, exness: s.exness, cycle: s.cycle, prices: s.prices, cycles: s.cycles.slice(0, 60), signals: s.signals.slice(0, 60), candles: Object.fromEntries(Object.entries(s.candles).map(([k, v]) => [k, v.slice(-150)])) })

export class Engine {
  constructor(private ctx: any, private env: any) {}
  private async load(): Promise<EngineState> { return ((await this.ctx.storage.get('s')) as EngineState) ?? newState() }
  async fetch(req: Request) {
    const path = new URL(req.url).pathname
    if (path === '/tick') { await this.tick(); return json({ ok: true }) }
    const s = await this.load()
    let testResult = ''
    if (path === '/control' && req.method === 'POST') {
      const b: any = JSON.parse((await req.text()) || '{}')
      if (b.action === 'pause') s.enabled = false
      if (b.action === 'resume') s.enabled = true
      if (b.action === 'reset') { const keep = s.enabled; Object.assign(s, newState()); s.enabled = keep }
      if (typeof b.news === 'boolean') s.news = b.news
      if (b.action === 'telegram_test') testResult = (await tg(this.env, 'Test message from Hedge Signal Desk. Alerts are working.')) || 'Telegram test message sent'
      await this.ctx.storage.put('s', s)
    }
    return json({ ...view(s, this.env), testResult })
  }
  async tick() {
    const s = await this.load(), now = Date.now(), env = this.env
    s.lastTick = now
    const notices: Notice[] = []
    const pairs = String(env.PAIRS || 'EURUSD').split(',').map((x: string) => x.trim()).slice(0, 2)
    const day = new Date(now).toISOString().slice(0, 10); if (s.credits.day !== day) s.credits = { day, n: 0 }
    const seeded = pairs.every((p: string) => s.candles[p]?.length)
    if (!s.enabled) s.status = 'Paused'
    else if (!env.TWELVE_DATA_KEY) s.status = 'Missing secret TWELVE_DATA_KEY. Add it in Cloudflare (see setup steps).'
    else if (!isTradingSession(now) && !s.cycle && seeded) s.status = 'Market session closed (08:00-17:00 GMT, Mon-Fri). Sleeping, no API credits used.'
    else {
      s.status = 'Live: tracking ' + pairs.join(', ')
      for (const pair of pairs) {
        if (s.credits.n >= 780) { s.status = 'Daily free-tier credit budget reached (780 of 800). Resumes tomorrow.'; break }
        try {
          const has = !!s.candles[pair]?.length
          const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${pair.slice(0, 3)}/${pair.slice(3)}&interval=1min&outputsize=${has ? 5 : 120}&timezone=UTC&order=asc&apikey=${env.TWELVE_DATA_KEY}`)
          s.credits.n++
          const j: any = await r.json()
          if (j.status === 'error' || !j.values) { s.status = `Data error: ${j.message ?? 'no data returned'}`; continue }
          const cs = j.values.map((v: any) => ({ t: Date.parse(String(v.datetime).replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close })).filter((c: any) => c.t + 60000 <= now + 1000)
          if (!has) { s.candles[pair] = cs; s.prices[pair] = cs.length ? cs[cs.length - 1].c : 0 } else cs.forEach((c: any) => notices.push(...processCandle(s, pair, c)))
        } catch (e: any) { s.status = 'Fetch failed: ' + e.message }
      }
    }
    for (const n of notices) { if (n.kind === 'cycle') await tg(env, cycleMessage(n.row)); else if (env.TG_SIGNALS !== 'off') await tg(env, signalMessage(n.row)) }
    const d = new Date(now), key = d.toISOString().slice(0, 13), hr = d.getUTCHours()
    if (s.enabled && d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && hr >= 9 && hr <= 17 && d.getUTCMinutes() < 10 && s.lastReport !== key) { s.lastReport = key; await tg(env, summaryText(s.cycles, s.binary, s.exness, now, Number(env.GHS_PER_USD) || 11)) }
    await this.ctx.storage.put('s', s)
  }
}
async function tg(env: any, text: string): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 'Telegram secrets not set (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)'
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }) }); return r.ok ? '' : `Telegram error ${r.status}: ${await r.text()}` } catch (e: any) { return 'Telegram failed: ' + e.message }
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
