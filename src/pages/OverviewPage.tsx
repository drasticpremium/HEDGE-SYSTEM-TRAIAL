import { useAppStore } from '../store/useAppStore'

export function OverviewPage() {
  const currencyUnit = useAppStore((state) => state.currencyUnit)
  const ghcPerUsd = useAppStore((state) => state.ghcPerUsd)
  const binaryBalanceUsd = useAppStore((state) => state.binaryBalanceUsd)
  const exnessBalanceUsd = useAppStore((state) => state.exnessBalanceUsd)

  return (
    <div className="page-grid">
      <section className="panel card">
        <h2>Overview</h2>
        <div className="stat-grid">
          <div className="stat-box">
            <span>Binary account</span>
            <strong>{currencyUnit === 'GH₵' ? `GH₵${(binaryBalanceUsd * ghcPerUsd).toFixed(2)}` : `$${binaryBalanceUsd.toFixed(2)}`}</strong>
          </div>
          <div className="stat-box">
            <span>Exness account</span>
            <strong>{currencyUnit === 'GH₵' ? `GH₵${(exnessBalanceUsd * ghcPerUsd).toFixed(2)}` : `$${exnessBalanceUsd.toFixed(2)}`}</strong>
          </div>
          <div className="stat-box">
            <span>Combined equity</span>
            <strong>{currencyUnit === 'GH₵' ? `GH₵${((binaryBalanceUsd + exnessBalanceUsd) * ghcPerUsd).toFixed(2)}` : `$${(binaryBalanceUsd + exnessBalanceUsd).toFixed(2)}`}</strong>
          </div>
        </div>
      </section>

      <section className="panel card">
        <h2>Auto trader</h2>
        <p>Running status: paused</p>
        <p>Current cycle: none</p>
        <p>Next signal state: waiting for the next valid setup</p>
      </section>

      <section className="panel card wide">
        <h2>Performance snapshot</h2>
        <div className="mini-chart" aria-label="Combined equity curve placeholder" />
      </section>
    </div>
  )
}
