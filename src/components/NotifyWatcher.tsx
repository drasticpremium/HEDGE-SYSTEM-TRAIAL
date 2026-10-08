import { useEffect, useRef } from 'react'
import { useServer } from '../store/server'
import { notify, useNotify } from '../store/notify'
import { summaryText } from '../engine/serverCore'
import { useAppStore } from '../store/useAppStore'

/** Watches the 24/7 server data and pops up alerts for new signals, closed cycles and the hourly report. */
export function NotifyWatcher() {
  const data = useServer((s) => s.data), seen = useRef<{ sig: Set<number>; cyc: Set<number> } | null>(null), hour = useRef('')
  useEffect(() => {
    if (!data) return
    if (!seen.current) { seen.current = { sig: new Set(data.signals.map((x) => x.id!)), cyc: new Set(data.cycles.map((x) => x.id!)) }; return } // first load: don't flood with old items
    const p = useNotify.getState().prefs
    for (const s of [...data.signals].reverse()) if (!seen.current.sig.has(s.id!)) { seen.current.sig.add(s.id!); if (s.kind === 'TRADE' && p.signals) notify(`SIGNAL ${s.pair}: Quotex ${s.dir === 'CALL' ? 'BUY' : 'SELL'}, Exness ${s.hedgeSide}`, `Entry ${s.price.toFixed(s.pair.endsWith('JPY') ? 3 : 5)}. Stop ${s.sl?.toFixed(5)}, TP ${s.tp?.toFixed(5)}. Strength ${s.strength}.`, s.dir === 'CALL' ? 'info' : 'bad') }
    for (const c of [...data.cycles].reverse()) if (!seen.current.cyc.has(c.id!)) { seen.current.cyc.add(c.id!); if (p.cycles) notify(`Cycle closed ${c.pair}`, `${c.outcomeTag}. Net ${c.netPnl >= 0 ? '+' : '-'}$${Math.abs(c.netPnl).toFixed(2)} (paper)`, c.netPnl >= 0 ? 'ok' : 'bad') }
  }, [data])
  useEffect(() => {
    const i = setInterval(() => {
      const d = new Date(), key = d.toISOString().slice(0, 13), sv = useServer.getState().data
      if (d.getUTCMinutes() === 0 && d.getUTCHours() >= 9 && d.getUTCHours() <= 17 && d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && hour.current !== key && sv && useNotify.getState().prefs.hourly) { hour.current = key; notify('Hourly report', summaryText(sv.cycles, sv.binary, sv.exness, Date.now(), useAppStore.getState().ghcPerUsd)) }
    }, 20000)
    return () => clearInterval(i)
  }, [])
  return null
}
export function Toasts() {
  const { toasts, dismiss } = useNotify()
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast toast-${t.tone}`} onClick={() => dismiss(t.id)}><strong>{t.title}</strong><p>{t.body}</p></div>)}</div>
}
