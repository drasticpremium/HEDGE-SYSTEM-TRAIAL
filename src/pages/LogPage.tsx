import { useServer } from '../store/server'
import { formatMoney, useAppStore } from '../store/useAppStore'
import { Pill } from '../components/Pill'

export function LogPage() {
  const d = useServer((s) => s.data), a = useAppStore(), m = (v: number) => formatMoney(v, a.currencyUnit, a.ghcPerUsd)
  const rows = d?.cycles ?? []
  const tone = (v: number) => (v >= 0 ? 'up' : 'down')
  const q = (r: (typeof rows)[number]) => (r.binaryPnl ?? 0) + (r.counterPnl ?? 0), e = (r: (typeof rows)[number]) => r.exnessPnl ?? r.exnessResult - r.costs
  const tq = rows.reduce((x, r) => x + q(r), 0), te = rows.reduce((x, r) => x + e(r), 0), tn = rows.reduce((x, r) => x + r.netPnl, 0)
  const csv = () => {
    const head = 'time_gmt,pair,direction,strength,stake,payout,binary_result,binary_pnl,counter_pnl,quotex_pnl,lots,exness_gross,costs,exness_pnl,net,outcome'
    const body = rows.map((r) => [r.time, r.pair, r.direction, r.strength, r.stake, r.payout ?? '', r.binaryResult, r.binaryPnl ?? '', r.counterPnl ?? '', q(r).toFixed(2), r.lots, r.exnessResult, r.costs, e(r).toFixed(2), r.netPnl, r.outcomeTag].join(','))
    const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' })), el = document.createElement('a'); el.href = url; el.download = 'hedge-cycles.csv'; el.click(); URL.revokeObjectURL(url)
  }
  return (
    <div className="panel card wide">
      <div className="row-between"><h2>Trade Log (auto trader, real market, paper money)</h2><button type="button" className="btn" disabled={!rows.length} onClick={csv}>Export CSV</button></div>
      {!rows.length ? <p className="empty">No closed cycles yet. The auto trader decides at every 15-minute open between 08:00 and 16:45 GMT on weekdays, and a cycle appears here when its 15 minutes end.</p> : (
        <div className="table-scroll"><table className="log-table">
          <thead>
            <tr className="group-row"><th colSpan={4}></th><th colSpan={5} className="g-quotex">QUOTEX (binary)</th><th colSpan={4} className="g-exness">EXNESS (hedge)</th><th colSpan={2}></th></tr>
            <tr><th>Time (GMT)</th><th>Pair</th><th>Side</th><th>Str.</th><th>Stake</th><th>Payout</th><th>Result</th><th>Counter</th><th>Quotex P&L</th><th>Lots</th><th>Gross</th><th>Costs</th><th>Exness P&L</th><th>Net</th><th>What happened</th></tr>
          </thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{r.time.slice(0, 16).replace('T', ' ')}</td><td>{r.pair}</td><td><Pill side={r.direction === 'CALL' ? 'BUY' : 'SELL'} /></td><td>{r.strength}</td>
              <td>{m(r.stake)}</td><td>{r.payout ? `${(r.payout * 100).toFixed(1)}%` : '-'}</td><td className={r.binaryResult === 'WIN' ? 'up' : 'down'}>{r.binaryResult}</td><td>{r.counterResult ?? '-'}</td><td className={tone(q(r))}>{m(q(r))}</td>
              <td>{r.lots.toFixed(2)}</td><td className={tone(r.exnessResult)}>{m(r.exnessResult)}</td><td>{m(-r.costs)}</td><td className={tone(e(r))}>{m(e(r))}</td><td className={tone(r.netPnl)}><strong>{m(r.netPnl)}</strong></td><td>{r.outcomeTag}</td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={8}><strong>Totals ({rows.length} cycles)</strong></td><td className={tone(tq)}><strong>{m(tq)}</strong></td><td colSpan={3}></td><td className={tone(te)}><strong>{m(te)}</strong></td><td className={tone(tn)}><strong>{m(tn)}</strong></td><td></td></tr></tfoot>
        </table></div>)}
    </div>
  )
}
