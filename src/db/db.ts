import Dexie, { type Table } from 'dexie'

export interface CycleLogRow {
  id?: number
  time: string
  pair: string
  direction: 'CALL' | 'PUT'
  entry: number
  strength: number
  stake: number
  lots: number
  binaryResult: string
  counterResult?: string
  exnessResult: number
  costs: number
  netPnl: number
  outcomeTag: string
  source: 'sim' | 'live'
}

export interface EventLogRow {
  id?: number
  cycleId?: number
  time: string
  message: string
  level: 'info' | 'warn' | 'success' | 'error'
}

class HedgeSignalDeskDatabase extends Dexie {
  history!: Table<CycleLogRow, number>
  events!: Table<EventLogRow, number>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('hedge-signal-desk-db')
    this.version(1).stores({
      history: '++id, time, pair, outcomeTag, source',
      events: '++id, cycleId, time',
      meta: '&key',
    })
    this.version(2).stores({}).upgrade((tx) => tx.table('history').filter((r: CycleLogRow) => (r.entry === 1.0842 && r.lots === 0.15) || (r.entry === 1.2712 && r.lots === 0.12)).delete())
  }
}

export const db = new HedgeSignalDeskDatabase()

export async function seedHistoryIfEmpty(): Promise<void> {
  const count = await db.history.count()
  if (count > 0) return

  const seedRows: CycleLogRow[] = [
    { time: new Date().toISOString(), pair: 'EURUSD', direction: 'PUT', entry: 1.0842, strength: 74, stake: 12, lots: 0.15, binaryResult: 'WIN', exnessResult: 3.4, costs: 1.2, netPnl: 9.8, outcomeTag: 'take-profit hit', source: 'sim' },
    { time: new Date(Date.now() - 86400000).toISOString(), pair: 'GBPUSD', direction: 'CALL', entry: 1.2712, strength: 68, stake: 9, lots: 0.12, binaryResult: 'LOSS', exnessResult: -2.7, costs: 1.5, netPnl: -11.2, outcomeTag: 'stop hit', source: 'sim' },
  ]

  await db.history.bulkAdd(seedRows)
}

export async function addHistoryRow(row: CycleLogRow): Promise<number> {
  return db.history.add(row)
}

export async function addEventRow(row: EventLogRow): Promise<number> {
  return db.events.add(row)
}
