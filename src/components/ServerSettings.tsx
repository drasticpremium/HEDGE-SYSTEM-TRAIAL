import { useEffect, useState } from 'react'
import { useServer } from '../store/server'
import { AdminToken } from './AdminToken'
import type { Settings } from '../engine/serverCore'

const FIELDS: [keyof Settings, string, string][] = [
  ['stakeUsd', 'Stake per binary (USD)', 'Quotex stake for each cycle'], ['payoutMin', 'Payout minimum (%)', 'Each cycle draws a random payout between min and max'], ['payoutMax', 'Payout maximum (%)', ''],
  ['maxLots', 'Exness lots (max)', 'Lot size used; scaled down automatically if the account cannot afford it'], ['stopUsd', 'Exness stop loss, maximum (USD)', 'The most the Exness stop may cost. Lots are sized from recent volatility so the stop costs about this'], ['tpUsd', 'Exness take profit (USD)', 'Money won if the Exness take profit hits. A high figure means a far-away target'],
  ['commission', 'Commission per lot (USD)', 'Round trip'], ['counterWindowMin', 'Counter window (minutes left or less)', 'Counter binary allowed only in the last N minutes'], ['counterMinLeft', 'Counter minimum minutes left', ''],
  ['minStrength', 'Minimum signal strength', '0-100'], ['leverage', 'Exness leverage (1:N)', 'Used for the margin check'], ['stopAtrMult', 'Stop distance (share of recent candle range)', 'Stop = this x the recent 15-minute candle range (ATR). Calmer market = tighter stop and bigger lots; wilder market = wider stop and smaller lots'], ['pullbackPct', 'Pullback depth (% of recent candle range)', 'Used by the pullback button: wait for price to move against the trade by this much, then enter'], ['pullbackWindowMin', 'Pullback wait (minutes after the open)', 'If no pullback comes within this time the candle is skipped'], ['minNetWin', 'Profit kept if the stop hits and the binary wins (USD)', 'The hedge is sized so that a stop-hit plus commission still leaves at least this much from a winning binary'], ['copyLots', 'Default copy-trade lots', 'Used when a pasted signal has no lot size'], ['recoveryMult', 'Recovery step 2 multiplier', 'Stake and lots are multiplied by this on the third trade (2 = double)'], ['leadMin', 'Heads-up minutes before the open', 'First heads-up this many minutes ahead, second one minute ahead'],
]
export function ServerSettings() {
  const d = useServer((s) => s.data), control = useServer((s) => s.control)
  const [f, setF] = useState<Settings | null>(null), [bg, setBg] = useState(250), [eg, setEg] = useState(250), [msg, setMsg] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => { if (d && !ready) { setF(d.settings); setBg(+(d.capital.binary * d.rate).toFixed(2)); setEg(+(d.capital.exness * d.rate).toFixed(2)); setReady(true) } }, [d, ready])
  if (!f) return <section className="panel card wide"><h2>Auto trader settings</h2><p className="empty">Waiting for the server. These settings apply to the 24/7 auto trader.</p></section>
  const act = async (b: object) => setMsg((await control(b)) || 'Done')
  return (
    <section className="panel card wide">
      <h2>Auto trader settings (24/7 server)</h2>
      <p className="mut">Changes apply from the next decision. Stop and take profit are in money; the pips follow from the lot size.</p>
      <div className="field-row wrap">{FIELDS.map(([k, label, hint]) => <label key={k} title={hint}>{label}<input type="number" step="any" value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></label>)}
        <label className="watch-item"><input type="checkbox" checked={f.autoLots} onChange={(e) => setF({ ...f, autoLots: e.target.checked })} /> Adjust lots to volatility (up to the max)</label>
        <label className="watch-item"><input type="checkbox" checked={f.headsUp} onChange={(e) => setF({ ...f, headsUp: e.target.checked })} /> Heads-up messages before each open</label>
        <label className="watch-item"><input type="checkbox" checked={f.tgNoTrade} onChange={(e) => setF({ ...f, tgNoTrade: e.target.checked })} /> Telegram message for no-trade candles too</label></div>
      <div className="button-row"><AdminToken /><button type="button" className="btn primary" onClick={() => void act({ action: 'settings', settings: (({ recoveryOn: _r, pullbackOn: _p, ...rest }) => rest)(f) })}>Save settings</button></div>
      <h2 style={{ marginTop: 18 }}>Capital and data</h2>
      <p className="mut">Amounts are converted at the live rate: 1 USD = GH₵{d?.rate.toFixed(2)}{d?.fx && !d.fx.error ? ` (source ${d.fx.src}, checked ${Math.max(0, Math.round((Date.now() - d.fx.at) / 3600000))} h ago)` : ' (fallback value, live rate unavailable right now)'}.</p>
      <div className="field-row"><label>Quotex capital (GH₵)<input type="number" value={bg} onChange={(e) => setBg(+e.target.value)} /></label><label>Exness capital (GH₵)<input type="number" value={eg} onChange={(e) => setEg(+e.target.value)} /></label></div>
      <div className="button-row"><button type="button" className="btn" onClick={() => void act({ action: 'capital', binaryGhs: bg, exnessGhs: eg })}>Apply capital (keep history)</button>
        <button type="button" className="btn" onClick={() => { if (confirm('Clear all auto-trader cycles and signals and restart both accounts with this capital?')) void act({ action: 'reset', binaryGhs: bg, exnessGhs: eg }) }}>Clear data and restart</button></div>
      <p className="mut">Copy-trade data has its own clear button on the Copy Trades page.</p>
      {msg && <p>{msg}</p>}
    </section>
  )
}
