import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'midnight' | 'emerald' | 'amber' | 'violet' | 'light' | 'contrast'
export type CurrencyUnit = 'USD' | 'GH₵'

interface AppSettings {
  theme: ThemeName
  pair: string
  clockMode: 'real' | 'sim'
  currencyUnit: CurrencyUnit
  ghcPerUsd: number
  binaryBalanceUsd: number
  exnessBalanceUsd: number
  leverage: number
  stopOutPercent: number
  commissionPerLotRoundTrip: number
  binaryStakePercent: number
  minimumBinaryStake: number
  hedgeRiskRatio: number
}

interface AppState extends AppSettings {
  setTheme: (theme: ThemeName) => void
  setPair: (pair: string) => void
  setClockMode: (mode: 'real' | 'sim') => void
  setCurrencyUnit: (unit: CurrencyUnit) => void
  setGhcPerUsd: (rate: number) => void
  resetAccounts: () => void
  setAccountBalance: (account: 'binary' | 'exness', value: number) => void
}

const initialState: AppSettings = {
  theme: 'midnight',
  pair: 'EURUSD',
  clockMode: 'sim',
  currencyUnit: 'GH₵',
  ghcPerUsd: 11,
  binaryBalanceUsd: 250,
  exnessBalanceUsd: 250,
  leverage: 500,
  stopOutPercent: 20,
  commissionPerLotRoundTrip: 9,
  binaryStakePercent: 2,
  minimumBinaryStake: 1,
  hedgeRiskRatio: 0.16,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setTheme: (theme) => set({ theme }),
      setPair: (pair) => set({ pair }),
      setClockMode: (clockMode) => set({ clockMode }),
      setCurrencyUnit: (currencyUnit) => set({ currencyUnit }),
      setGhcPerUsd: (ghcPerUsd) => set({ ghcPerUsd }),
      resetAccounts: () => set({ binaryBalanceUsd: 250, exnessBalanceUsd: 250 }),
      setAccountBalance: (account, value) =>
        set((state) => ({
          ...(account === 'binary'
            ? { binaryBalanceUsd: Math.max(0, value) }
            : { exnessBalanceUsd: Math.max(0, value) }),
        })),
    }),
    { name: 'hedge-signal-desk-store' },
  ),
)

export const usdToGhc = (amountUsd: number, ghcPerUsd: number) => amountUsd * ghcPerUsd
export const formatMoney = (amount: number, currencyUnit: CurrencyUnit, ghcPerUsd: number) => {
  const value = currencyUnit === 'GH₵' ? usdToGhc(amount, ghcPerUsd) : amount
  return `${currencyUnit === 'GH₵' ? 'GH₵' : '$'}${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
}
