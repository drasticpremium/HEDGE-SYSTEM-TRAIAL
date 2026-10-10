import { create } from 'zustand'
import type { Candle } from '../engine/math'
import type { CycleLogRow, SignalRow } from '../db/db'
import type { Cycle } from '../engine/cycle'
import type { Settings } from '../engine/serverCore'
import type { CopyTrade, Feed, FeedEvent } from '../engine/copyCore'
export interface ServerView {
  telegram: boolean; now: number; enabled: boolean; news: boolean; status: string; lastTick: number; credits: { day: string; n: number }; binary: number; exness: number; capital: { binary: number; exness: number }; settings: Settings
  ladder?: number; cycle: Cycle | null; prices: Record<string, number>; cycles: CycleLogRow[]; signals: SignalRow[]; candles: Record<string, Candle[]>; copy: { balance: number; start: number; trades: CopyTrade[]; feeds: Feed[]; log: FeedEvent[] }; testResult?: string
}
interface S { data: ServerView | null; error: string; load: () => Promise<void>; control: (body: object, token?: string) => Promise<string> }
export const useServer = create<S>((set) => ({
  data: null, error: '',
  load: async () => { try { const r = await fetch('/api/state'); const j = await r.json(); if (!j.settings) throw new Error('no state'); set({ data: j, error: '' }) } catch { set({ error: 'Server engine not reachable. It only exists on the deployed Cloudflare site, not in npm run dev.' }) } },
  control: async (body, token = sessionStorage.adminToken ?? '') => { const r = await fetch('/api/control', { method: 'POST', headers: { 'x-admin-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (r.ok) { set({ data: j }); return j.testResult ?? '' } return j.error ?? 'Failed' },
}))
void useServer.getState().load(); setInterval(() => void useServer.getState().load(), 10000)
