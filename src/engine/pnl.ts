export interface CycleInput {
  stake: number; payout: number          // 0.95 = +95%
  lots: number; pipValue: number; costPerLot: number
  exnessPips: number                     // realised pips on the hedge (TP = +tp, stop = -stop, else minus the move in binary direction)
  binaryWin: boolean
  counter?: { win: boolean }             // optional single counter binary, same stake
}
export interface CycleResult { binary: number; counter: number; exness: number; cost: number; net: number }
const bin = (win: boolean, stake: number, payout: number) => (win ? stake * payout : -stake)
export function cyclePnl(i: CycleInput): CycleResult {
  const binary = bin(i.binaryWin, i.stake, i.payout)
  const counter = i.counter ? bin(i.counter.win, i.stake, i.payout) : 0
  const exness = i.exnessPips * i.lots * i.pipValue
  const cost = i.lots * i.costPerLot
  return { binary, counter, exness, cost, net: +(binary + counter + exness - cost).toFixed(2) }
}
