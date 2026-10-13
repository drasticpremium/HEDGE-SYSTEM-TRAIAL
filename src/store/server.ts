import { create } from 'zustand'
import type { Candle } from '../engine/math'
import type { CycleLogRow, SignalRow } from '../db/db'
import type { Cycle } from '../engine/cycle'
import { toast } from './notify'
import { useAppStore } from './useAppStore'
import type { Settings } from '../engine/serverCore'
import type { CopyTrade, Feed, FeedEvent } from '../engine/copyCore'
export interface ServerView {
  rate: number; fx: { rate: number; at: number; src: string; error?: string } | null; telegram: boolean; now: number; enabled: boolean; news: boolean; status: string; lastTick: number; credits: { day: string; n: number }; binary: number; exness: number; capital: { binary: number; exness: number }; settings: Settings
  ladder?: number; cycle: Cycle | null; prices: Record<string, number>; cycles: CycleLogRow[]; signals: SignalRow[]; candles: Record<string, Candle[]>; copy: { balance: number; start: number; trades: CopyTrade[]; feeds: Feed[]; log: FeedEvent[] }; testResult?: string
}
interface S { data: ServerView | null; error: string; load: () => Promise<void>; control: (body: object, token?: string) => Promise<string> }
export const useServer = create<S>((set) => ({
  data: null, error: '',
  load: async () => { try { const r = await fetch('/api/state'); const j = await r.json(); if (!j.settings) throw new Error('no state'); set({ data: j, error: '' }); if (j.rate > 1) useAppStore.setState({ ghcPerUsd: j.rate }) } catch { set({ error: 'Server engine not reachable. It only exists on the deployed Cloudflare site, not in npm run dev.' }) } },
  control: async (body, token = sessionStorage.adminToken ?? '') => {
    let msg = '', bad = false
    try {
      const r = await fetch('/api/control', { method: 'POST', headers: { 'x-admin-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), j = await r.json()
      if (r.ok) { set({ data: j }); if (j.rate > 1) useAppStore.setState({ ghcPerUsd: j.rate }); msg = j.testResult ?? ''; bad = /^(Failed|Telegram error|Telegram failed|Telegram secrets)/.test(msg) } else { msg = j.error ?? `Request failed (${r.status})`; bad = true }
    } catch { msg = 'Failed: could not reach the server. Check your connection and try again.'; bad = true }
    if (msg || bad) toast(bad ? 'Could not do that' : 'Done', msg || 'Request failed', bad ? 'bad' : 'ok')
    return msg
  },
}))
void useServer.getState().load(); setInterval(() => void useServer.getState().load(), 10000)
