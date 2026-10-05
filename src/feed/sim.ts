import { defaultVol15, pipSize, startPrice } from '../engine/pairs'
export interface Tick { t: number; bid: number; ask: number }
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
/** Session volatility multiplier by GMT hour (London/NY overlap busiest). */
export const sessionMult = (h: number) => (h >= 13 && h < 17 ? 1.3 : h >= 8 && h < 13 ? 1.0 : h < 7 ? 0.6 : 0.5)
/** Random-walk EUR/USD-style feed. speed = simulated seconds per real second. */
export function makeSimFeed(pair: string, onTick: (t: Tick) => void, speed = 1) {
  let mid = startPrice(pair); const pip = pipSize(pair), sig = defaultVol15(pair) / Math.sqrt(900)
  let simNow = Date.now()
  const id = setInterval(() => {
    simNow += 1000 * speed
    for (let k = 0; k < speed; k++) mid += gauss() * sig * pip * sessionMult(new Date(simNow).getUTCHours())
    onTick({ t: simNow, bid: mid - pip * 0.3, ask: mid + pip * 0.3 })
  }, 1000)
  return () => clearInterval(id)
}
