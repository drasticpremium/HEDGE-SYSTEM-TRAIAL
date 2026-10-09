import { useMemo } from 'react'
import { useServer } from '../store/server'
import type { CycleLogRow } from './db'
/** Logged cycles from the 24/7 server (real market data, paper money), oldest first. Null while loading. */
export function useCycles(): CycleLogRow[] | null {
  const d = useServer((s) => s.data)
  return useMemo(() => (d ? [...d.cycles].reverse() : null), [d])
}
