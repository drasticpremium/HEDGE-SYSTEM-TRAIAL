import { parseSignal } from './signalParser'
import type { CopyInput } from './copyCore'
/** Reads the public web preview of a Telegram channel (https://t.me/s/NAME). Works only for PUBLIC channels with the preview enabled. Text posts only, images are not read. */
export function parseChannelName(input: string): string | null {
  const t = input.trim().replace(/^@/, '')
  const m = t.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})\/?/i) ?? t.match(/^([A-Za-z0-9_]{4,})$/)
  return m && !m[1].startsWith('+') && m[1].toLowerCase() !== 'joinchat' ? m[1] : null
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export const htmlToText = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? '')).trim()
export function parseChannelHtml(html: string): { id: number; text: string; time: string }[] {
  const out: { id: number; text: string; time: string }[] = []
  for (const chunk of html.split('data-post="').slice(1)) {
    const id = Number(chunk.match(/^[^"]*\/(\d+)"/)?.[1]), tx = chunk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    if (id && tx) out.push({ id, text: htmlToText(tx[1]), time: chunk.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? '' })
  }
  return out.sort((a, b) => a.id - b.id)
}
const RESULT = /\b(HIT|BOOKED|ACHIEVED|REACHED|DONE|CLOSED|RUNNING|SECURED|PROFIT\s+BOOKED|RESULT)\b/i
/** Turns a channel post into a copy-trade input, or says why it was ignored. price = live price (used when the post has no entry). */
export function toCopyInput(text: string, lots: number, price: number): { ok: true; input: CopyInput } | { ok: false; note: string } {
  const p = parseSignal(text)
  if (!p.pair || !p.side) return { ok: false, note: 'not a trade signal (no pair or buy/sell)' }
  if (RESULT.test(text) && p.entry === null) return { ok: false, note: 'looks like a result or update message' }
  if (p.sl === null && !p.tps.length) return { ok: false, note: 'no stop loss or take profit found' }
  const ref = p.entry ?? price, buy = p.side === 'BUY'
  if (Math.abs(ref - price) / price > 0.05) return { ok: false, note: 'entry price is far from the live market, probably misread' }
  if (p.sl !== null && (buy ? p.sl >= ref : p.sl <= ref)) return { ok: false, note: 'stop loss is on the wrong side of entry' }
  if (p.tps.some((x) => (buy ? x <= ref : x >= ref) || Math.abs(x - price) / price > 0.1)) return { ok: false, note: 'a take profit is on the wrong side or far away, probably misread' }
  return { ok: true, input: { pair: p.pair, side: p.side, type: p.type, entry: p.entry, sl: p.sl, tps: p.tps, lots: p.lots ?? lots, raw: text.slice(0, 400) } }
}
