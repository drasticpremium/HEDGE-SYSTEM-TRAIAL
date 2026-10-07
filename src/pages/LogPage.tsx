import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type CycleLogRow } from '../db/db'

export function LogPage() {
  const [rows, setRows] = useState<CycleLogRow[]>([])

  useEffect(() => {
    const sub = liveQuery(() => db.history.orderBy('time').reverse().toArray()).subscribe({ next: setRows })
    return () => sub.unsubscribe()
  }, [])

  return (
    <div className="panel card wide">
      <h2>Trade Log</h2>
      <table className="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Pair</th>
            <th>Direction</th>
            <th>Strength</th>
            <th>Stake</th>
            <th>Net P&L</th>
            <th>Outcome</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? row.time}>
              <td>{new Date(row.time).toLocaleString()}</td>
              <td>{row.pair}</td>
              <td>{row.direction}</td>
              <td>{row.strength}</td>
              <td>${row.stake}</td>
              <td>${row.netPnl.toFixed(2)}</td>
              <td>{row.outcomeTag}</td>
              <td>{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
