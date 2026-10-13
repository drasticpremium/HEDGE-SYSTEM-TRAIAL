import { useCycles } from '../db/useCycles'
import { group, wilson } from '../engine/stats'
import type { CycleLogRow } from '../db/db'

const bucket = (s: number) => (s < 40 ? '0-39' : s < 60 ? '40-59' : s < 80 ? '60-79' : '80-100')
const MIN = 30
function Table({ title, rows, keyFn }: { title: string; rows: CycleLogRow[]; keyFn: (r: CycleLogRow) => string }) {
  const g = group(rows, keyFn)
  return (
    <section className="panel card"><h2>{title}</h2>
      {!g.length ? <p className="empty">No logged cycles yet.</p> : (
        <div className="table-scroll"><table className="log-table"><thead><tr><th>Group</th><th>Samples</th><th>Win rate</th><th>95% range</th></tr></thead><tbody>
          {g.map(([k, v]) => {
            const ci = wilson(v.wins, v.n)
            return v.n < MIN
              ? <tr key={k}><td>{k}</td><td>{v.n}</td><td className="mut">{v.wins}/{v.n} won</td><td className="mut wrap">need {MIN}+ to judge</td></tr>
              : <tr key={k}><td>{k}</td><td>{v.n}</td><td>{((v.wins / v.n) * 100).toFixed(1)}%</td><td>{(ci![0] * 100).toFixed(0)}% to {(ci![1] * 100).toFixed(0)}%</td></tr>
          })}
        </tbody></table></div>)}
    </section>
  )
}
export function AccuracyPage() {
  const rows = useCycles() ?? []
  return (
    <div className="page-grid acc-grid">
      <section className="panel card wide"><h2>Accuracy</h2><p>Measured binary win rate of logged signals only. Nothing here is hard-coded. A group needs at least {MIN} samples before its win rate and range are shown; until then you see the raw count of wins.</p></section>
      <Table title="By signal strength" rows={rows} keyFn={(r) => bucket(r.strength)} />
      <Table title="By hour (GMT)" rows={rows} keyFn={(r) => `${String(new Date(r.time).getUTCHours()).padStart(2, '0')}:00`} />
      <Table title="By pair" rows={rows} keyFn={(r) => r.pair} />
    </div>
  )
}
