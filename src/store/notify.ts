import { create } from 'zustand'
export interface Toast { id: number; title: string; body: string; tone: 'ok' | 'bad' | 'info' }
export interface Prefs { signals: boolean; cycles: boolean; hourly: boolean; browser: boolean; sound: boolean }
const DEF: Prefs = { signals: true, cycles: true, hourly: true, browser: true, sound: true }
const load = (): Prefs => { try { return { ...DEF, ...JSON.parse(localStorage.notifyPrefs) } } catch { return DEF } }
let n = 0
export const useNotify = create<{ toasts: Toast[]; prefs: Prefs; setPref: (k: keyof Prefs, v: boolean) => void; dismiss: (id: number) => void }>((set, get) => ({
  toasts: [], prefs: load(),
  setPref: (k, v) => { const prefs = { ...get().prefs, [k]: v }; localStorage.notifyPrefs = JSON.stringify(prefs); set({ prefs }) },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
const beep = () => { try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 760; o.start(); o.stop(c.currentTime + 0.2) } catch { /* sound blocked */ } }
/** In-site pop-up, plus a system notification (desktop or phone) when permission is granted. */
export function notify(title: string, body: string, tone: Toast['tone'] = 'info') {
  const { prefs } = useNotify.getState(), id = ++n
  useNotify.setState((s) => ({ toasts: [...s.toasts, { id, title, body, tone }].slice(-4) }))
  setTimeout(() => useNotify.getState().dismiss(id), 14000)
  if (prefs.sound) beep()
  if (prefs.browser && 'Notification' in window && Notification.permission === 'granted') {
    const opts = { body, icon: '/icon-192.png', tag: title + body }
    if (navigator.serviceWorker) void navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => new Notification(title, opts)); else new Notification(title, opts)
  }
}
