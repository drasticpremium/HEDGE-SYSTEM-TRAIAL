import { useEffect, useState } from 'react'
import { useServer } from '../store/server'
import { AdminToken } from './AdminToken'
import type { Settings } from '../engine/serverCore'

const FIELDS: [keyof Settings, string, string][] = [
  ['stakeUsd', 'Stake per binary (USD)', 'Quotex stake for each cycle'], ['payoutMin', 'Payout minimum (%)', 'Each cycle draws a random payout between min and max'], ['payoutMax', 'Payout maximum (%)', ''],
  ['maxLots', 'Exness lots (max)', 'Lot size used; scaled down automatically if the account cannot afford it'], ['stopUsd', 'Stop loss (USD)', 'Money lost if the hedge stop hits'], ['tpUsd', 'Take profit (USD)', 'Money won if the hedge take profit hits'],
  ['commission', 'Commission per lot (USD)', 'Round trip'], ['counterWindowMin', 'Counter window (minutes left or less)', 'Counter binary allowed only in the last N minutes'], ['counterMinLeft', 'Counter minimum minutes left', ''],
  ['minStrength', 'Minimum signal strength', '0-100'], ['leverage', 'Exness leverage (1:N)', 'Used for the margin check'], ['ghsPerUsd', 'GH₵ per 1 USD', 'Set to the current rate'], ['copyLots', 'Default copy-trade lots', 'Used when a pasted signal has no lot size'],
]
export function ServerSettings() {
  const d = useServer((s) => s.data), control = useServer((s) => s.control)
  const [f, setF] = useState<Settings | null>(null), [bg, setBg] = useState(250), [eg, setEg] = useState(250), [msg, setMsg] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => { if (d && !ready) { setF(d.settings); setBg(+(d.capital.binary * d.settings.ghsPerUsd).toFixed(2)); setEg(+(d.capital.exness * d.settings.ghsPerUsd).toFixed(2)); setReady(true) } }, [d, ready])
  if (!f) return <section className="panel card wide"><h2>Auto trader settings</h2><p className="empty">Waiting for the server. These settings apply to the 24/7 auto trader.</p></section>
  const act = async (b: object) => setMsg((await control(b)) || 'Done')
  return (
    <section className="panel card wide">
      <h2>Auto trader settings (24/7 server)</h2>
      <p className="mut">Changes apply from the next decision. Stop and take profit are in money; the pips follow from the lot size.</p>
      <div className="field-row wrap">{FIELDS.map(([k, label, hint]) => <label key={k} title={hint}>{label}<input type="number" step="any" value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></label>)}
        <label className="watch-item"><input type="checkbox" checked={f.autoLots} onChange={(e) => setF({ ...f, autoLots: e.target.checked })} /> Adjust lots to volatility (up to the max)</label>
        <label className="watch-item"><input type="checkbox" checked={f.tgNoTrade} onChange={(e) => setF({ ...f, tgNoTrade: e.target.checked })} /> Telegram message for no-trade candles too</label></div>
      <div className="button-row"><AdminToken /><button type="button" className="btn primary" onClick={() => void act({ action: 'settings', settings: f })}>Save settings</button></div>
      <h2 style={{ marginTop: 18 }}>Capital and data</h2>
      <div className="field-row"><label>Quotex capital (GH₵)<input type="number" value={bg} onChange={(e) => setBg(+e.target.value)} /></label><label>Exness capital (GH₵)<input type="number" value={eg} onChange={(e) => setEg(+e.target.value)} /></label></div>
      <div className="button-row"><button type="button" className="btn" onClick={() => void act({ action: 'capital', binaryGhs: bg, exnessGhs: eg })}>Apply capital (keep history)</button>
        <button type="button" className="btn" onClick={() => { if (confirm('Clear all auto-trader cycles and signals and restart both accounts with this capital?')) void act({ action: 'reset', binaryGhs: bg, exnessGhs: eg }) }}>Clear data and restart</button></div>
      <p className="mut">Copy-trade data has its own clear button on the Copy Trades page.</p>
      {msg && <p>{msg}</p>}
    </section>
  )
}
