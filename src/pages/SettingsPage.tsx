import { useAppStore } from '../store/useAppStore'

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const ghcPerUsd = useAppStore((state) => state.ghcPerUsd)
  const setGhcPerUsd = useAppStore((state) => state.setGhcPerUsd)
  const binaryBalanceUsd = useAppStore((state) => state.binaryBalanceUsd)
  const exnessBalanceUsd = useAppStore((state) => state.exnessBalanceUsd)
  const setAccountBalance = useAppStore((state) => state.setAccountBalance)
  const resetAccounts = useAppStore((state) => state.resetAccounts)

  return (
    <div className="page-grid">
      <section className="panel card">
        <h2>Settings</h2>
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
            <option value="midnight">Midnight Blue</option>
            <option value="emerald">Emerald</option>
            <option value="amber">Amber</option>
            <option value="violet">Violet</option>
            <option value="light">Light</option>
            <option value="contrast">High-Contrast</option>
          </select>
        </label>

        <label>
          GH₵ per 1 USD
          <input type="number" value={ghcPerUsd} min={1} step={0.1} onChange={(e) => setGhcPerUsd(Number(e.target.value) || 11)} />
        </label>
        <p className="muted">Placeholder default: 11.0, set to current rate.</p>
      </section>

      <section className="panel card">
        <h2>Accounts</h2>
        <div className="field-row">
          <label>
            Binary balance
            <input type="number" value={binaryBalanceUsd} onChange={(e) => setAccountBalance('binary', Number(e.target.value) || 0)} />
          </label>
          <label>
            Exness balance
            <input type="number" value={exnessBalanceUsd} onChange={(e) => setAccountBalance('exness', Number(e.target.value) || 0)} />
          </label>
        </div>
        <button onClick={resetAccounts}>Reset accounts</button>
      </section>
    </div>
  )
}
