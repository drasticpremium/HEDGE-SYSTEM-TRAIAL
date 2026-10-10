import { useState } from 'react'
import { useServer } from '../store/server'
import { parseSignal, type ParsedSignal } from '../engine/signalParser'
import { formatMoney, useAppStore } from '../store/useAppStore'
import { AdminToken } from '../components/AdminToken'
import { Pill } from '../components/Pill'

const blank = { pair: '', side: 'BUY', type: 'AUTO', entry: '', sl: '', tps: '', lots: '' }
export function CopyPage() {
  const d = useServer((s) => s.data), control = useServer((s) => s.control), a = useAppStore(), m = (v: number) => formatMoney(v, a.currencyUnit, a.ghcPerUsd)
  const [text, setText] = useState(''), [form, setForm] = useState(blank), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [ghs, setGhs] = useState(250)
  const fill = (p: ParsedSignal) => setForm({ pair: p.pair ?? '', side: p.side ?? 'BUY', type: p.type, entry: p.entry?.toString() ?? '', sl: p.sl?.toString() ?? '', tps: p.tps.join(', '), lots: p.lots?.toString() ?? '' })
  const analyse = () => { const p = parseSignal(text); fill(p); setMsg(p.pair && p.side ? 'Check every field below, then press Paper trade.' : 'Could not find the pair or side. Fill them in below.') }
  const ocr = async (file: File) => {
    setBusy(true); setMsg('Reading the screenshot (first time downloads the reader, about 10-20 seconds)...')
    try { const { createWorker } = await import('tesseract.js'), w = await createWorker('eng'), r = await w.recognize(file); await w.terminate(); setText(r.data.text); fill(parseSignal(r.data.text)); setMsg('Screenshot read. Screenshots are less reliable than text, so check every number before trading.') } catch { setMsg('Could not read that image. Try a clearer screenshot or paste the text.') }
    setBusy(false)
  }
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const trade = async () => {
    const tps = form.tps.split(/[,\s]+/).map(Number).filter((x) => x > 0), pair = form.pair.toUpperCase().replace(/[^A-Z]/g, '')
    if (pair.length !== 6) return setMsg('Pair must look like EURUSD or XAUUSD.')
    if (!tps.length && num(form.sl) === null) return setMsg('Add at least a stop loss or one take profit.')
    setMsg(await control({ action: 'copy_add', trade: { pair, side: form.side, type: form.type, entry: num(form.entry), sl: num(form.sl), tps, lots: num(form.lots) ?? 0, raw: text.slice(0, 500) } }) || 'Done'); setForm(blank)
  }
  const field = (k: keyof typeof blank, label: string, ph = '') => <label>{label}<input value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
  const [feedUrl, setFeedUrl] = useState(''), feeds = d?.copy.feeds ?? [], flog = d?.copy.log ?? []
  const tradesAll = d?.copy.trades ?? []
  const bySrc = [...new Set(tradesAll.map((t) => t.src ?? ''))].map((k) => { const v = tradesAll.filter((t) => (t.src ?? '') === k), c = v.filter((t) => t.status === 'CLOSED'); return { k, n: v.length, closed: c.length, wins: c.filter((t) => t.realized > 0).length, pnl: v.reduce((x, t) => x + t.realized, 0) } })
  const ago = (t: number) => (t ? `${Math.max(0, Math.round((Date.now() - t) / 60000))} min ago` : 'never')
  const trades = d?.copy.trades ?? [], closed = trades.filter((t) => t.status === 'CLOSED'), wins = closed.filter((t) => t.realized > 0).length, total = trades.reduce((x, t) => x + t.realized, 0)
  return (
    <div className="page-grid">
      <section className="panel card wide"><h2>Copy Trades (separate paper account, real market prices)</h2>
        <p className="mut">Paste a signal from a Telegram channel, or upload a screenshot of it. The site reads the pair, entry, stop loss and take profits, and you confirm before it paper-trades them on the real market. This account and its profit never mix with the auto trader.</p>
        <textarea className="paste" rows={6} placeholder="Paste the signal text here..." value={text} onChange={(e) => setText(e.target.value)} />
        <div className="button-row"><button type="button" className="btn primary" onClick={analyse} disabled={!text.trim()}>Analyse text</button>
          <label className="btn">{busy ? 'Reading...' : 'Upload screenshot'}<input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && void ocr(e.target.files[0])} /></label></div>
        {msg && <p>{msg}</p>}</section>
      <section className="panel card wide"><h2>Review and confirm</h2>
        <div className="field-row">{field('pair', 'Pair', 'EURUSD')}<label>Side<select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}><option>BUY</option><option>SELL</option></select></label>
          <label>Order<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="AUTO">Auto (market or pending)</option><option>MARKET</option><option>LIMIT</option><option>STOP</option></select></label>
          {field('entry', 'Entry', 'blank = market')}{field('sl', 'Stop loss')}{field('tps', 'Take profits', '1.0900, 1.0950')}{field('lots', 'Lots', `blank = ${d?.settings.copyLots ?? 0.01}`)}</div>
        <div className="button-row"><AdminToken /><button type="button" className="btn primary" onClick={() => void trade()}>Paper trade this</button></div>
        <p className="mut">Auto: if the entry is within 0.03% of the live price it fills at once, otherwise it waits as a limit or stop order until the real price touches it. With several take profits the lots split equally. If a stop and a target fall in the same minute, the stop is assumed first.</p></section>
      <section className="panel card wide"><h2>Auto-copy from a Telegram channel</h2>
        <p className="mut">Add a PUBLIC channel link. The server checks it every minute and paper-trades each new text signal with your default lots, so you can stress-test a channel without touching anything. Only posts made after you add it are copied. Private invite links, image-only signals and channels with the web preview turned off cannot be read.</p>
        <div className="button-row"><input style={{ minWidth: 260 }} placeholder="https://t.me/channelname" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} /><AdminToken />
          <button type="button" className="btn primary" disabled={!feedUrl.trim()} onClick={async () => { setMsg((await control({ action: 'feed_add', url: feedUrl })) || 'Done'); setFeedUrl('') }}>Add channel</button></div>
        {!feeds.length ? <p className="empty">No channels yet. Add one above and its new signals will appear in the copy trades list below, tagged with the channel name.</p> : <div className="table-scroll"><table className="log-table"><thead><tr><th>Channel</th><th>Status</th><th>Last check</th><th>Posts seen</th><th>Copied</th><th>Ignored</th><th></th></tr></thead>
          <tbody>{feeds.map((f) => <tr key={f.id}><td>@{f.name}</td><td className={f.error ? 'down' : f.enabled ? 'up' : 'mut'}>{f.error || (f.enabled ? 'Watching' : 'Paused')}</td><td>{ago(f.checked)}</td><td>{f.found}</td><td>{f.copied}</td><td>{f.ignored}</td>
            <td><button type="button" className="btn" onClick={async () => setMsg((await control({ action: 'feed_toggle', id: f.id, on: !f.enabled })) || 'Done')}>{f.enabled ? 'Pause' : 'Resume'}</button> <button type="button" className="btn" onClick={async () => setMsg((await control({ action: 'feed_remove', id: f.id })) || 'Done')}>Remove</button></td></tr>)}</tbody></table></div>}
        {bySrc.length > 0 && <><h3>Results by source</h3><div className="table-scroll"><table className="log-table"><thead><tr><th>Source</th><th>Trades</th><th>Closed</th><th>Winners</th><th>P&L</th></tr></thead><tbody>{bySrc.map((r) => <tr key={r.k}><td>{r.k ? '@' + r.k : 'manual'}</td><td>{r.n}</td><td>{r.closed}</td><td>{r.closed ? `${r.wins}/${r.closed}` : '-'}</td><td className={r.pnl >= 0 ? 'up' : 'down'}>{m(r.pnl)}</td></tr>)}</tbody></table></div></>}
        {flog.length > 0 && <><h3>Channel activity</h3><div className="table-scroll"><table className="log-table"><thead><tr><th>Time (GMT)</th><th>Channel</th><th>Result</th><th>Why</th><th>Message</th></tr></thead><tbody>{flog.map((e, i) => <tr key={i}><td>{e.time.slice(0, 16).replace('T', ' ')}</td><td>@{e.channel}</td><td className={e.status === 'copied' ? 'up' : 'mut'}>{e.status}</td><td>{e.note}</td><td style={{ whiteSpace: 'normal', maxWidth: 360 }}>{e.text}</td></tr>)}</tbody></table></div></>}
        <p className="mut">Each copied signal and each open pair uses some of your 800 free daily data calls. The auto trader is protected first, so copy price checks pause when the credits left are needed for it.</p></section>
      <section className="panel card wide kpis">
        <div className="kpi"><span>Copy account</span><strong>{m(d?.copy.balance ?? 0)}</strong></div><div className="kpi"><span>Started with</span><strong>{m(d?.copy.start ?? 0)}</strong></div>
        <div className="kpi"><span>Copy P&L</span><strong className={total >= 0 ? 'up' : 'down'}>{m(total)}</strong></div><div className="kpi"><span>Closed trades</span><strong>{closed.length}</strong></div><div className="kpi"><span>Winners</span><strong>{closed.length ? `${wins}/${closed.length}` : 'no data'}</strong></div></section>
      <section className="panel card wide"><h2>Copy trades</h2>
        {!trades.length ? <p className="empty">No copy trades yet. Paste a signal above to start.</p> : <div className="table-scroll"><table className="log-table"><thead><tr><th>Added (GMT)</th><th>Source</th><th>Pair</th><th>Side</th><th>Order</th><th>Entry</th><th>Stop</th><th>Targets</th><th>Lots</th><th>Status</th><th>P&L</th><th></th></tr></thead>
          <tbody>{trades.map((t) => <tr key={t.id}><td>{t.created.slice(0, 16).replace('T', ' ')}</td><td>{t.src ? '@' + t.src : 'manual'}</td><td>{t.pair}</td><td><Pill side={t.side} /></td><td>{t.type}</td><td>{t.fillPrice ?? t.entry}</td><td>{t.sl ?? '-'}</td><td>{t.tps.map((x, i) => <span key={i} className={i < t.tpHit ? 'up' : ''}>{x} </span>)}</td><td>{t.lots}</td><td>{t.status}{t.exit ? ` (${t.exit})` : ''}</td><td className={t.realized >= 0 ? 'up' : 'down'}>{m(t.realized)}</td>
            <td>{(t.status === 'PENDING' || t.status === 'OPEN') && <button type="button" className="btn" onClick={async () => setMsg(await control({ action: 'copy_close', id: t.id }) || 'Done')}>{t.status === 'PENDING' ? 'Cancel' : 'Close now'}</button>}</td></tr>)}</tbody></table></div>}
        <div className="button-row"><label>Restart with GH₵<input type="number" value={ghs} onChange={(e) => setGhs(+e.target.value)} /></label><button type="button" className="btn" onClick={() => { if (confirm('Clear all copy-trade data and restart the copy account?')) void control({ action: 'copy_reset', ghs }).then((r) => setMsg(r || 'Done')) }}>Clear copy data</button></div>
        <p className="mut">Real-price checking uses your free data allowance (800 calls a day, shared with the auto trader), so keep the number of open copy pairs small.</p></section>
    </div>
  )
}
