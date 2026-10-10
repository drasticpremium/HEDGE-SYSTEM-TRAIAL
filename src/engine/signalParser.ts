export interface ParsedSignal { pair: string | null; side: 'BUY' | 'SELL' | null; type: 'AUTO' | 'LIMIT' | 'STOP'; entry: number | null; sl: number | null; tps: number[]; lots: number | null }
const CUR = 'EUR|GBP|AUD|NZD|USD|CAD|CHF|JPY', N = '(\\d{1,6}(?:\\.\\d+)?)'
/** Reads a pasted (or OCR'd) Telegram signal. Always show the result for review, never trade it blindly. */
export function parseSignal(text: string): ParsedSignal {
  const t = text.toUpperCase().replace(/(\d),(\d{3})(?=\.\d)/g, '$1$2').replace(/(\d),(\d+)/g, '$1.$2')
  let pair: string | null = /\b(GOLD|XAU\s*\/?\s*USD)\b/.test(t) ? 'XAUUSD' : /\b(SILVER|XAG\s*\/?\s*USD)\b/.test(t) ? 'XAGUSD' : null
  if (!pair) { for (const m of t.matchAll(new RegExp(`\\b(${CUR})\\s*[/\\-]?\\s*(${CUR})\\b`, 'g'))) if (m[1] !== m[2]) { pair = m[1] + m[2]; break } }
  const so = t.match(/\b(BUY|SELL)\s*(LIMIT|STOP)\b/), sd = t.match(/\b(BUY|SELL|LONG|SHORT)\b/)
  const side = so ? (so[1] as 'BUY' | 'SELL') : sd ? (sd[1] === 'LONG' ? 'BUY' : sd[1] === 'SHORT' ? 'SELL' : (sd[1] as 'BUY' | 'SELL')) : null
  const num = (re: RegExp) => { const m = t.match(re); return m ? Number(m[1]) : null }
  const entry = num(new RegExp(`ENTRY[^\\d]{0,15}${N}`)) ?? num(new RegExp(`\\b(?:BUY|SELL)(?:\\s*(?:LIMIT|STOP))?\\b(?:(?!SL|S/L|TP|T/P|STOP|TAKE|TARGET)[^\\d]){0,25}?${N}`)) ?? num(new RegExp(`@\\s*${N}`))
  const sl = num(new RegExp(`(?:\\bSL\\b|S/L|STOP\\s*LOSS|STOPLOSS)[^\\d]{0,12}${N}`))
  const tps = [...new Set([...t.matchAll(new RegExp(`(?:\\bTP|T/P|TAKE\\s*PROFIT|TARGET)\\s*(?:\\d(?![\\d.]))?[^\\d]{0,10}?${N}`, 'g'))].map((m) => Number(m[1])))]
  return { pair, side, type: (so?.[2] as 'LIMIT' | 'STOP') ?? 'AUTO', entry, sl, tps, lots: num(new RegExp(`(?:LOTS?|VOLUME)[^\\d]{0,6}${N}`)) ?? num(new RegExp(`${N}\\s*LOTS?\\b`)) }
}
