import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type CycleLogRow } from './db'
/** Live list of logged cycles, oldest first. Re-renders whenever the trader writes a new row. */
export function useCycles(): CycleLogRow[] | null {
  const [rows, setRows] = useState<CycleLogRow[] | null>(null)
  useEffect(() => { const s = liveQuery(() => db.history.orderBy('time').toArray()).subscribe({ next: setRows }); return () => s.unsubscribe() }, [])
  return rows
}
