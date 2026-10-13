import { describe, it, expect, vi } from 'vitest'
import { Engine } from './index'
function rig(fxReply: () => Response | Promise<Response>) {
  const store = new Map<string, any>(), calls: string[] = []
  const eng = new Engine({ storage: { get: async (k: string) => store.get(k), put: async (k: string, v: unknown) => { store.set(k, structuredClone(v)) } } }, { PAIRS: 'EURUSD' })
  globalThis.fetch = (async (u: string) => { calls.push(u); if (u.includes('er-api')) return fxReply(); return new Response('{}') }) as typeof fetch
  vi.useFakeTimers(); return { eng, calls, state: async () => (await (await eng.fetch(new Request('https://e/state'))).json()) as any, setNow: (t: number) => vi.setSystemTime(t) }
}
describe('live GHS rate in the worker', () => {
  it('fetches once, caches for 6 hours, then refreshes', async () => {
    const x = rig(() => new Response(JSON.stringify({ result: 'success', rates: { GHS: 12.34 } }))); x.setNow(Date.UTC(2026, 9, 13, 10)); await x.eng.tick()
    let st = await x.state(); expect(st.rate).toBe(12.34); expect(st.fx.src).toBe('open.er-api.com')
    const n = () => x.calls.filter((c) => c.includes('er-api')).length; await x.eng.tick(); expect(n()).toBe(1); x.setNow(Date.UTC(2026, 9, 13, 17)); await x.eng.tick(); expect(n()).toBe(2)
  })
  it('keeps the last good rate when the service fails, retries sooner, and never accepts nonsense', async () => {
    let ok = true; const x = rig(() => (ok ? new Response(JSON.stringify({ rates: { GHS: 12.34 } })) : new Response(JSON.stringify({ result: 'error', 'error-type': 'rate-limited' }), { status: 429 })))
    x.setNow(Date.UTC(2026, 9, 13, 10)); await x.eng.tick(); ok = false; x.setNow(Date.UTC(2026, 9, 13, 17)); await x.eng.tick()
    let st = await x.state(); expect(st.rate).toBe(12.34); expect(st.fx.error).toContain('rate-limited')
    const n = () => x.calls.filter((c) => c.includes('er-api')).length, before = n(); x.setNow(Date.UTC(2026, 9, 13, 17, 10)); await x.eng.tick(); expect(n()).toBe(before)   // too soon
    x.setNow(Date.UTC(2026, 9, 13, 17, 40)); await x.eng.tick(); expect(n()).toBe(before + 1)                                                                                  // retried after 30 min
    const bad = rig(() => new Response(JSON.stringify({ rates: { GHS: 0 } }))); bad.setNow(Date.UTC(2026, 9, 13, 10)); await bad.eng.tick(); st = await bad.state(); expect(st.rate).toBe(11); expect(st.fx.error).toBeTruthy()
    const down = rig(() => { throw new Error('offline') }); down.setNow(Date.UTC(2026, 9, 13, 10)); await down.eng.tick(); expect((await down.state()).rate).toBe(11)
  })
  it('capital entered in GH₵ converts at the live rate', async () => {
    const x = rig(() => new Response(JSON.stringify({ rates: { GHS: 15 } }))); x.setNow(Date.UTC(2026, 9, 13, 10)); await x.eng.tick()
    const r = await (await x.eng.fetch(new Request('https://e/control', { method: 'POST', body: JSON.stringify({ action: 'capital', binaryGhs: 1500, exnessGhs: 750 }) }))).json() as any
    expect(r.binary).toBeCloseTo(100, 5); expect(r.exness).toBeCloseTo(50, 5)
  })
})
