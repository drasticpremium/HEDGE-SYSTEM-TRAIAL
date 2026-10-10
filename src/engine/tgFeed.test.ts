import { describe, it, expect } from 'vitest'
import { parseChannelName, parseChannelHtml, htmlToText, toCopyInput } from './tgFeed'
describe('telegram channel feed', () => {
  it('accepts normal links and refuses private invite links', () => { expect(parseChannelName('https://t.me/gold_signals_vip')).toBe('gold_signals_vip'); expect(parseChannelName('t.me/s/FxKing/123')).toBe('FxKing'); expect(parseChannelName('@fx_pro_calls')).toBe('fx_pro_calls'); expect(parseChannelName('https://t.me/+AbCdEf123')).toBeNull(); expect(parseChannelName('hello world')).toBeNull() })
  it('reads posts from the public preview html', () => {
    const html = '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="fx_calls/101"><div class="tgme_widget_message_text js-message_text" dir="auto">GBPUSD <b>SELL</b> 1.2750<br/>SL 1.2790<br/>TP1 1.2710 &amp; TP2 1.2680</div><a class="tgme_widget_message_date"><time datetime="2026-10-09T09:00:00+00:00" class="time">09:00</time></a></div></div>'
      + '<div class="tgme_widget_message" data-post="fx_calls/102"><div class="tgme_widget_message_photo_wrap"></div></div><div class="tgme_widget_message" data-post="fx_calls/103"><div class="tgme_widget_message_text js-message_text">Good morning team</div></div>'
    const p = parseChannelHtml(html); expect(p.map((x) => x.id)).toEqual([101, 103]); expect(p[0].text).toContain('GBPUSD SELL 1.2750\nSL 1.2790'); expect(p[0].text).toContain('TP1 1.2710 & TP2'); expect(p[0].time).toContain('2026-10-09')
  })
  it('decodes entities and strips tags', () => expect(htmlToText('A&lt;B&gt; <i>x</i>&#39;s&nbsp;ok')).toBe("A<B> x's ok"))
  it('turns a clean signal into a copy input', () => { const r = toCopyInput('GBPUSD SELL 1.2750\nSL 1.2790\nTP1 1.2710\nTP2 1.2680', 0.01, 1.275); expect(r.ok).toBe(true); if (r.ok) expect(r.input).toMatchObject({ pair: 'GBPUSD', side: 'SELL', entry: 1.275, sl: 1.279, tps: [1.271, 1.268], lots: 0.01 }) })
  it('ignores chat, results, wrong-side stops and far-off prices', () => {
    for (const t of ['Good morning team, big week ahead', 'EURUSD BUY TP1 HIT +30 pips', 'EURUSD BUY 1.0850 SL 1.0900 TP 1.0900', 'EURUSD BUY 1.5000 SL 1.4950 TP 1.5100', 'EURUSD BUY 1.0850']) expect(toCopyInput(t, 0.01, 1.085).ok).toBe(false)
  })
  it('uses the live price when the post has no entry', () => { const r = toCopyInput('XAUUSD BUY NOW\nSL 2340\nTP 2360', 0.01, 2350); expect(r.ok).toBe(true); if (r.ok) expect(r.input.entry).toBeNull() })
})
