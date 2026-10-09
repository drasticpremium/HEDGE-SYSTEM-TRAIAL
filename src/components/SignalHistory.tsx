import type { SignalRow } from '../db/db'
import { Pill } from './Pill'

const fmt = (pair: string, x?: number) => (x === undefined ? '-' : x.toFixed(pair.endsWith('JPY') ? 3 : 5))
const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)} GMT`
export function SignalCards({ rows: list }: { rows: SignalRow[] }) {
  return (
      <div className="sig-list">
        {list.map((r) => r.kind === 'TRADE' ? (
          <article key={r.id} className="sig-card sig-trade">
            <header><span className="badge badge-ok">TRADE</span><strong>{r.pair}</strong><span className="mut">{when(r.time)}</span><span className="meter" title={`Strength ${r.strength}`}><i style={{ width: `${r.strength}%` }} /></span><b>{r.strength}</b></header>
            <div className="sig-split">
              <div className="sig-side"><h4>Quotex</h4><Pill side={r.dir === 'CALL' ? 'BUY' : 'SELL'} /> <small className="mut">{r.dir}</small><p>Stake ${r.stake?.toFixed(2)}</p><p>Entry {fmt(r.pair, r.price)}</p><p>Expiry {r.expiry?.slice(11, 19)} GMT</p></div>
              <div className="sig-side"><h4>Exness</h4><Pill side={r.hedgeSide!} /><p>{r.lots?.toFixed(2)} lots</p><p>Stop {fmt(r.pair, r.sl)} ({r.stopPips}p, -${r.stopUsd?.toFixed(2)})</p><p>Take profit {fmt(r.pair, r.tp)} ({r.tpPips}p, +${r.tpUsd?.toFixed(2)})</p></div>
            </div>
          </article>
        ) : (
          <article key={r.id} className="sig-card sig-skip">
            <header><span className="badge badge-bad">NO TRADE</span><strong>{r.pair}</strong><span className="mut">{when(r.time)}</span><b>{r.skipped} candle{r.skipped === 1 ? '' : 's'} in a row</b></header>
            <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </article>
        ))}
      </div>
  )
}
