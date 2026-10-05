// All 28 pairs from the 8 major currencies. Approximate USD values are used only
// for the simulated start price and for estimating pip value per lot.
export const USD_VALUE: Record<string, number> = { EUR: 1.08, GBP: 1.27, AUD: 0.66, NZD: 0.6, USD: 1, CAD: 0.73, CHF: 1.12, JPY: 0.0067 }
export const PAIRS = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD','EURGBP','EURJPY','EURCHF','EURAUD','EURCAD','EURNZD','GBPJPY','GBPCHF','GBPAUD','GBPCAD','GBPNZD','AUDJPY','AUDCHF','AUDCAD','AUDNZD','NZDJPY','NZDCHF','NZDCAD','CADJPY','CADCHF','CHFJPY']
const VOL15: Record<string, number> = { EURUSD: 3.2, GBPUSD: 4, USDJPY: 4, USDCHF: 3.5, AUDUSD: 3, USDCAD: 3.5, NZDUSD: 3, EURGBP: 2.5 }
export const pipSize = (p: string) => (p.endsWith('JPY') ? 0.01 : 0.0001)
export const startPrice = (p: string) => USD_VALUE[p.slice(0, 3)] / USD_VALUE[p.slice(3)]
/** USD value of 1 pip for 1 standard lot (100,000 units). EURUSD = $10. */
export const pipValuePerLot = (p: string) => 100000 * pipSize(p) * USD_VALUE[p.slice(3)]
/** Starting guess for the simulator only; the live value is always computed from data. */
export const defaultVol15 = (p: string) => VOL15[p] ?? (p.includes('JPY') ? 5.5 : 4)
