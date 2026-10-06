export function PerformancePage() {
  return (
    <div className="page-grid">
      <section className="panel card wide">
        <h2>Performance</h2>
        <p>Time range filter: today • 7d • 30d • all</p>
        <p>Source filter: sim • live • both</p>
        <div className="mini-chart large" aria-label="Performance chart placeholder" />
      </section>
    </div>
  )
}
