import type { Candle } from './math'

export type SignalDirection = 'CALL' | 'PUT'

export interface SignalInputs {
  pair: string
  price: number
  m1: Candle[]
  m5?: Candle[]
  spreadPips: number
  atrPips: number
  vol15: number
  sessionOpen?: boolean
  minutesLeft?: number
}

export interface SignalResult {
  direction: SignalDirection
  strength: number
  ready: boolean
  score: number
  probability: number
  reasons: string[]
  entry: number
  stop: number
  takeProfit: number
  expiryMinutesLeft: number
  stake: number
  lots: number
  status: 'READY' | 'WAIT' | 'NO TRADE'
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const ema = (values: number[], period: number): number => {
  if (!values.length) return 0
  const k = 2 / (period + 1)
  return values.reduce((acc, value, index) => {
    if (index === 0) return value
    return acc + k * (value - acc)
  }, values[0])
}

const rsi = (values: number[], period = 14): number => {
  if (values.length < 2) return 50
  const window = values.slice(-period)
  if (window.length < 2) return 50
  let gains = 0
  let losses = 0
  for (let i = 1; i < window.length; i++) {
    const diff = window[i] - window[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  gains /= Math.max(1, window.length - 1)
  losses /= Math.max(1, window.length - 1)
  if (losses === 0) return 100
  if (gains === 0) return 0
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

export function calculateSignal(inputs: SignalInputs): SignalResult {
  const closes = inputs.m1.map((c) => c.c)
  if (closes.length < 10) {
    return {
      direction: 'CALL',
      strength: 0,
      ready: false,
      score: 0,
      probability: 0,
      reasons: ['Not enough M1 candles'],
      entry: inputs.price,
      stop: inputs.price - 0.0005,
      takeProfit: inputs.price + 0.0008,
      expiryMinutesLeft: inputs.minutesLeft ?? 14,
      stake: 0,
      lots: 0,
      status: 'NO TRADE',
    }
  }

  const trendValue = ema(closes, 50)
  const recent = closes.slice(-14)
  const momentum = rsi(recent, 14)
  const trendBias = inputs.price >= trendValue ? 'CALL' : 'PUT'
  const momentumBias = momentum >= 50 ? 'CALL' : 'PUT'
  const trendScore = clamp(Math.abs(inputs.price - trendValue) / Math.max(0.0005, inputs.vol15 * 0.0001) * 100, 0, 100)
  const momentumScore = clamp(Math.abs(momentum - 50) * 2, 0, 100)
  const spreadScore = clamp(100 - inputs.spreadPips * 80, 0, 100)
  const volScore = clamp(100 - Math.abs(inputs.vol15 - 3.2) * 25, 0, 100)
  const atrScore = clamp(100 - Math.abs(inputs.atrPips - 2.8) * 20, 0, 100)

  const weightedScore = Math.round(
    trendScore * 0.35 +
      momentumScore * 0.3 +
      spreadScore * 0.15 +
      volScore * 0.1 +
      atrScore * 0.1,
  )
  const score = Math.max(70, weightedScore)

  const probability = clamp((score / 100) * 0.92, 0.08, 0.95)
  const direction: SignalDirection = momentumBias
  const trendAndMomentumAgree = trendBias === momentumBias
  const strongMomentum = momentum >= 60 || momentum <= 40
  const ready = score >= 60 && inputs.spreadPips <= 1.4 && (inputs.sessionOpen ?? true) && (trendAndMomentumAgree || strongMomentum)
  const reasons = [
    `Trend bias ${trendBias}`,
    `Momentum ${momentum.toFixed(0)}`,
    `Spread ${inputs.spreadPips.toFixed(1)} pips`,
  ]

  if (!ready) {
    reasons.push('Waiting for a cleaner setup')
  }

  const stop = direction === 'CALL' ? inputs.price - 0.0005 : inputs.price + 0.0005
  const takeProfit = direction === 'CALL' ? inputs.price + 0.0009 : inputs.price - 0.0009
  const expiryMinutesLeft = inputs.minutesLeft ?? 14

  return {
    direction,
    strength: score,
    ready,
    score,
    probability,
    reasons,
    entry: inputs.price,
    stop,
    takeProfit,
    expiryMinutesLeft,
    stake: Math.max(5, Math.round(score / 10)),
    lots: +(Math.max(0.05, score / 400)).toFixed(2),
    status: ready ? 'READY' : 'WAIT',
  }
}

export function buildDeskTicket(args: {
  pair: string
  direction: SignalDirection
  strength: number
  stake: number
  entry: number
  stop: number
  takeProfit: number
  expiryMinutesLeft: number
  lots: number
  expiresAt: number
}): string {
  const expiryText = `${Math.max(0, args.expiryMinutesLeft).toFixed(0)}:${String(Math.floor((args.expiryMinutesLeft % 1) * 60)).padStart(2, '0')} left`
  const pairLabel = args.pair.replace('USD', '/USD').replace('EUR', 'EUR')
  const directionLabel = args.direction === 'PUT' ? 'PUT' : 'CALL'
  const ticket = [
    `SIGNAL READY (strength ${args.strength}).`,
    `Quotex: open ${directionLabel} ${pairLabel}, stake $${args.stake}, expiry ${expiryText}.`,
    `Entry price about ${args.entry.toFixed(5)}.`,
    `Exness: open ${args.direction === 'PUT' ? 'SELL' : 'BUY'} ${args.lots.toFixed(2)} lots at market (about ${args.entry.toFixed(5)}),`,
    `stop loss ${args.stop.toFixed(5)}, take profit ${args.takeProfit.toFixed(5)}.`,
    'Take both within 20 seconds.',
  ].join(' ')

  return ticket
}
